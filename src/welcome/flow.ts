// The welcome guide as pure state: no DOM, no Tauri. Every function returns a new state (or the same one when nothing applies).
import { normalizeAskProvider } from '../agent/ask';
import type { AskProvider } from '../agent/ask';
import { COPY } from './copy';
import type { Platform } from './providers';

export type Screen = 'hello' | 'try' | 'menus' | 'key' | 'ask';
export const SCREENS: readonly Screen[] = ['hello', 'try', 'menus', 'key', 'ask'];
export type Lesson = 'click' | 'doubleClick' | 'drag' | 'contextMenu' | 'menuPick' | 'askBox' | 'tray';
export const LESSONS: { try: readonly Lesson[]; menus: readonly Lesson[] } = {
  try: ['click', 'doubleClick', 'drag', 'contextMenu'],
  menus: ['menuPick', 'askBox', 'tray'],
};
export type LessonState = 'todo' | 'done' | 'skipped';
export type RehearsalStep = 'signIn' | 'createKey' | 'copy' | 'paste';
export const REHEARSAL: readonly RehearsalStep[] = ['signIn', 'createKey', 'copy', 'paste'];

export interface GuideState {
  screen: Screen;
  provider: AskProvider;
  platform: Platform;
  lessons: Record<Lesson, LessonState>;
  keyPhase: 'rehearse' | 'real';
  rehearsal: RehearsalStep | 'done';
  keySaved: Record<AskProvider, boolean>;
  asked: boolean;
  draftQuestion: string;
}

const isScreen = (v: string | null): v is Screen => SCREENS.includes(v as Screen);

export function initial(q: URLSearchParams, keySaved: Record<AskProvider, boolean>): GuideState {
  const start = q.get('start');
  const platform = q.get('platform');
  const provider = normalizeAskProvider(q.get('provider'));
  return {
    screen: isScreen(start) ? start : 'hello',
    provider,
    platform: platform === 'windows' || platform === 'linux' ? platform : 'macos',
    lessons: { click: 'todo', doubleClick: 'todo', drag: 'todo', contextMenu: 'todo', menuPick: 'todo', askBox: 'todo', tray: 'todo' },
    keyPhase: keySaved[provider] ? 'real' : 'rehearse',
    rehearsal: 'signIn',
    keySaved: { ...keySaved },
    asked: false,
    draftQuestion: '',
  };
}

export const goto = (s: GuideState, screen: Screen): GuideState => (s.screen === screen ? s : { ...s, screen });
const move = (s: GuideState, by: number): GuideState => {
  const screen = SCREENS[SCREENS.indexOf(s.screen) + by];
  return screen ? goto(s, screen) : s;
};
export const next = (s: GuideState): GuideState => move(s, 1);
export const back = (s: GuideState): GuideState => move(s, -1);

const lessonsOf = (screen: Screen): readonly Lesson[] => (screen === 'try' ? LESSONS.try : screen === 'menus' ? LESSONS.menus : []);
export const activeLesson = (s: GuideState): Lesson | null => lessonsOf(s.screen).find((l) => s.lessons[l] === 'todo') ?? null;
export const screenDone = (s: GuideState): boolean => activeLesson(s) === null;
const settle = (s: GuideState, l: Lesson, to: LessonState): GuideState => ({ ...s, lessons: { ...s.lessons, [l]: to } });
export const perform = (s: GuideState, l: Lesson): GuideState => (activeLesson(s) === l ? settle(s, l, 'done') : s);
export function skipLesson(s: GuideState): GuideState {
  const l = activeLesson(s);
  return l ? settle(s, l, 'skipped') : s;
}

export function rehearse(s: GuideState, step: RehearsalStep): GuideState {
  if (s.rehearsal !== step) return s;
  return { ...s, rehearsal: REHEARSAL[REHEARSAL.indexOf(step) + 1] ?? 'done' };
}
export const skipRehearsal = (s: GuideState): GuideState => ({ ...s, keyPhase: 'real' });
/** A provider that already has a key goes straight to the real controls; otherwise the phase is kept. */
export const setProvider = (s: GuideState, p: AskProvider): GuideState => ({ ...s, provider: p, keyPhase: s.keySaved[p] ? 'real' : s.keyPhase });
export const markKeySaved = (s: GuideState, p: AskProvider): GuideState => ({ ...s, keySaved: { ...s.keySaved, [p]: true }, keyPhase: 'real' });
export const markAsked = (s: GuideState): GuideState => ({ ...s, asked: true });
export const setDraft = (s: GuideState, text: string): GuideState => ({ ...s, draftQuestion: text });

export function forward(s: GuideState): { label: string; primary: boolean } {
  const f = COPY.footer;
  switch (s.screen) {
    case 'hello':
      return { label: f.start, primary: true };
    case 'try':
    case 'menus':
      return screenDone(s) ? { label: f.next, primary: true } : { label: f.skip, primary: false };
    case 'key':
      return s.keySaved[s.provider] ? { label: f.next, primary: true } : { label: f.skipForNow, primary: false };
    case 'ask':
      return { label: f.finish, primary: s.asked };
  }
}
