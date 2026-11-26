// Paperclip as the guide's host: the real renderer and animator, with the pet's gestures practised in place.
import { ANIMATIONS, SHOWY_ANIMS } from '../anim/animations';
import { Animator } from '../anim/animator';
import { HIDDEN, NEUTRAL } from '../anim/pose';
import type { Pose } from '../anim/pose';
import type { AnimName } from '../anim/types';
import { Renderer } from '../art/renderer';
import type { OutfitName } from '../art/outfits';
import type { Style } from '../art/style';
import { EyeTracker, ZERO_TARGET, computeTarget } from '../agent/eyeFollow';
import type { Pt } from '../agent/eyeFollow';
import { MAX_QUESTION_CHARS } from '../agent/ask';
import type { ContentKind, ContentProvider } from '../content/provider';
import { attachInteraction } from '../ui/interaction';
import { ContextMenu } from '../ui/contextMenu';
import { buildMenu } from '../ui/menuModel';
import { Balloon } from '../ui/balloon';
import { DEFAULTS } from '../platform/settingsParse';
import { pick } from '../util/rng';
import { COPY } from './copy';
import type { Lesson } from './flow';
import { DOUBLE_CONTEXT_MS, keyGesture } from './stageKeys';

const FOLLOW_MS = 4000;
const TALK_MS = 2500; // an instruction stays up, but he only gestures for a moment
const SLIDE_LIMIT = 52; // viewBox units either way: he stays on his mat
const FLING_SPEED = 1.2; // px per ms at release
const ROUGH_SPEED = 2.4;

export interface Stage {
  play(name: AnimName): Promise<void>;
  /** Enter on the mat (instant under reduced motion). */
  enter(): Promise<void>;
  /** Roll the mat up and leave. */
  leave(): Promise<void>;
  /** Turn his eyes to a point in the window (null = straight ahead again). */
  lookAt(p: Pt | null): void;
  setStyle(s: Style): void;
  /** The current instruction: stays in his balloon until the next one. Waits while he is saying something else. */
  instruct(text: string): void;
  /** Something he says (a joke, an answer); the instruction comes back afterwards. */
  speak(text: string, attribution?: string): void;
  /** Forget what he was saying (a new screen). */
  hush(): void;
  /** The real Ask input in his balloon; null when cancelled. */
  prompt(text: string, placeholder: string): Promise<string | null>;
  onGesture(cb: (l: Lesson) => void): void;
  onAsk(cb: () => void): void;
  closeMenu(): void;
}

export interface StageOpts {
  style: Style;
  outfit: OutfitName;
  reducedMotion: boolean;
  balloonEl: HTMLElement;
  menuEl: HTMLElement;
  content: ContentProvider;
  onStyle(s: Style): void;
}

export function createStage(host: HTMLElement, o: StageOpts): Stage {
  const renderer = new Renderer(host, o.style, document.documentElement);
  renderer.setOutfit(o.outfit);
  const animator = new Animator({ render: (p) => renderer.render(p), reducedMotion: o.reducedMotion });
  animator.setPose(o.reducedMotion ? NEUTRAL : HIDDEN);

  const eyes = new EyeTracker();
  let slide = 0;
  animator.setOverlay((p: Pose): Pose => {
    const v = eyes.values;
    return {
      ...p,
      pupils: { x: p.pupils.x + v.px, y: p.pupils.y + v.py, conv: p.pupils.conv + v.conv },
      body: { ...p.body, x: p.body.x + slide, tilt: p.body.tilt + v.tilt },
    };
  });

  const play = (name: AnimName): Promise<void> => animator.play(ANIMATIONS[name]).then(() => undefined);

  // ---- his balloon: the pet's own, typewriter and all ----
  const balloon = new Balloon(o.balloonEl, () => undefined);
  let instruction = '';
  let shown = ''; // the instruction currently on screen
  let line = 0; // bumps whenever something new is said, so a finished line knows whether it still matters
  let speaking = false;
  let talkTimer: ReturnType<typeof setTimeout> | null = null;
  const talk = (ms?: number) => {
    if (talkTimer !== null) clearTimeout(talkTimer);
    talkTimer = null;
    if (animator.animating) return; // a hop or a celebration plays out
    void play('Explain');
    if (ms) talkTimer = setTimeout(() => animator.exit(), ms);
  };
  const showInstruction = () => {
    if (!instruction || speaking || shown === instruction) return;
    shown = instruction;
    line++;
    talk(TALK_MS);
    void balloon.speak(instruction, undefined, undefined, { sticky: true });
  };
  const say = (text: string, attribution?: string) => {
    const mine = ++line;
    speaking = true;
    shown = '';
    animator.stop();
    talk();
    void balloon.speak(text, attribution).then(() => {
      if (mine !== line) return;
      speaking = false;
      animator.exit();
      showInstruction();
    });
  };
  const fetchAndSay = (kind: ContentKind) => void o.content.next(kind).then((c) => say(c.text, c.attribution));

  // ---- eyes ----
  let lastMove = 0;
  let followTimer: ReturnType<typeof setTimeout> | null = null;
  let following = false;
  const aim = (p: Pt | null) => {
    const now = performance.now();
    // Targets arrive once (a lesson, a click) rather than in a stream, so settle on them in one go.
    const dt = following && p ? now - lastMove : 100;
    lastMove = now;
    const from = (host.closest('#stage') as HTMLElement).getBoundingClientRect(); // eye centres are stage-relative
    const target = p ? computeTarget(renderer.eyeCentres(), { x: p.x - from.left, y: p.y - from.top }, o.reducedMotion) : ZERO_TARGET;
    eyes.update(target, dt);
    if (!following) for (let i = 0; i < 3; i++) eyes.update(target, 100);
    animator.refresh();
  };
  const onFollowMove = (e: MouseEvent) => aim({ x: e.clientX, y: e.clientY });
  const endFollow = () => {
    if (followTimer !== null) clearTimeout(followTimer);
    followTimer = null;
    following = false;
    document.removeEventListener('mousemove', onFollowMove);
    aim(null);
  };
  const follow = () => {
    endFollow();
    following = true;
    document.addEventListener('mousemove', onFollowMove);
    followTimer = setTimeout(endFollow, FOLLOW_MS);
  };

  // ---- gestures ----
  let gestureCb: (l: Lesson) => void = () => undefined;
  let askCb: () => void = () => undefined;
  const click = () => {
    follow();
    void play('Noticed');
    gestureCb('click');
  };
  const doubleClick = () => {
    // As on the desktop: a moment's thought, then a joke.
    void play('Thinking');
    setTimeout(() => { animator.stop(); fetchAndSay('joke'); }, o.reducedMotion ? 0 : 900);
    gestureCb('doubleClick');
  };

  let easing: number | null = null;
  const stopEase = () => {
    if (easing !== null) cancelAnimationFrame(easing);
    easing = null;
  };
  const slideHome = () => {
    stopEase();
    const from = slide;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 320);
      slide = from * (1 - k) * (1 - k);
      animator.refresh();
      easing = k < 1 ? requestAnimationFrame(step) : null;
    };
    easing = requestAnimationFrame(step);
  };
  const land = async (speed: number) => {
    gestureCb('drag');
    if (speed > FLING_SPEED) {
      slideHome();
      await play('Fling');
      await play(speed > ROUGH_SPEED ? 'Dizzy' : 'Thud');
    } else slideHome();
  };

  let downX = 0;
  host.addEventListener('mousedown', (e) => { downX = e.clientX; }, true);
  const startSlide = (): Promise<void> => {
    stopEase();
    endFollow();
    // viewBox units per CSS px, so he moves exactly with the pointer.
    const unit = 240 / (host.getBoundingClientRect().width || 240);
    const origin = downX - slide / unit;
    let lastX = downX;
    let lastT = performance.now();
    let speed = 0;
    const move = (e: MouseEvent) => {
      const t = performance.now();
      speed = Math.abs(e.clientX - lastX) / Math.max(t - lastT, 1);
      lastX = e.clientX;
      lastT = t;
      slide = Math.max(-SLIDE_LIMIT, Math.min(SLIDE_LIMIT, (e.clientX - origin) * unit));
      animator.refresh();
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      void land(performance.now() - lastT > 80 ? 0 : speed);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    return Promise.resolve();
  };

  // ---- his right-click menu: the real one; what needs the desktop says so ----
  let style = o.style;
  const menu = new ContextMenu(o.menuEl, (id) => {
    if (id === 'hi') {
      void play('Greeting');
      fetchAndSay('greeting');
    } else if (id === 'joke' || id === 'quote' || id === 'tip') fetchAndSay(id);
    else if (id === 'animate') void play(pick(Math.random, SHOWY_ANIMS));
    else if (id === 'style-classic' || id === 'style-flat') o.onStyle(id === 'style-flat' ? 'flat' : 'classic');
    else if (id === 'ask-open') askCb();
    else say(COPY.menus.desktopOnly);
    gestureCb('menuPick');
  }, (visible) => {
    if (!visible && o.menuEl.contains(document.activeElement)) host.focus({ preventScroll: true });
  });
  const items = () => buildMenu({
    sleeping: false, quiet: false, greetOnUnlock: true, hideWhenPresenting: true, reactToMusic: true, outfits: true, style,
    water: { enabled: DEFAULTS.water.enabled, intervalMin: DEFAULTS.water.intervalMin, glassesToday: 0 },
    stretch: DEFAULTS.stretch, focusLeft: null, calendarSupported: false, meetingHeadsUp: false,
    ask: { keySet: false, provider: DEFAULTS.askProvider, model: DEFAULTS.askModel, groqModel: DEFAULTS.askGroqModel, claudeModel: DEFAULTS.askClaudeModel },
  });
  // x, y arrive in window px; the menu lives on his stage.
  const openMenu = (x: number, y: number) => {
    const r = (host.closest('#stage') as HTMLElement).getBoundingClientRect();
    menu.open(x - r.left, y - r.top, items());
    gestureCb('contextMenu');
  };
  const openAsk = () => {
    menu.close();
    askCb();
    gestureCb('askBox');
  };

  attachInteraction(host, {
    click,
    doubleClick,
    tripleClick: () => fetchAndSay('quote'),
    middleClick: () => fetchAndSay('quote'),
    openAsk,
    contextMenu: openMenu,
    dragStart: () => menu.close(),
    matTap: () => void play('Jump'),
  }, startSlide);

  // ---- the same gestures from the keyboard ----
  let menuKeyTimer: ReturnType<typeof setTimeout> | null = null;
  host.addEventListener('keydown', (e) => {
    if (menu.visible) return; // the menu has the arrows and Enter
    const g = keyGesture(e);
    if (!g) return;
    e.preventDefault();
    e.stopPropagation();
    if (g === 'click') click();
    else if (g === 'doubleClick') doubleClick();
    else if (g === 'contextMenu') {
      if (menuKeyTimer !== null) {
        clearTimeout(menuKeyTimer);
        menuKeyTimer = null;
        openAsk();
        return;
      }
      menuKeyTimer = setTimeout(() => {
        menuKeyTimer = null;
        const r = host.getBoundingClientRect();
        openMenu(r.left + 20, r.top + 20);
        o.menuEl.querySelector<HTMLElement>('.item')?.dispatchEvent(new MouseEvent('mouseenter'));
      }, DOUBLE_CONTEXT_MS);
    } else {
      stopEase();
      const dir = g === 'dragLeft' || g === 'flingLeft' ? -1 : 1;
      slide = dir * SLIDE_LIMIT * 0.8;
      animator.refresh();
      void land(g.startsWith('fling') ? FLING_SPEED + 0.1 : 0);
    }
  });
  return {
    play,
    async enter() {
      if (o.reducedMotion) {
        animator.setPose(NEUTRAL);
        return;
      }
      await play('EnterSlide');
      await play('Greeting');
    },
    async leave() {
      menu.close();
      if (o.reducedMotion) return;
      await Promise.race([play('ExitRollUp'), new Promise<void>((r) => setTimeout(r, 1800))]);
    },
    lookAt: (p) => { if (!following) aim(p); },
    setStyle(s) {
      style = s;
      renderer.setStyle(s);
      animator.refresh();
    },
    instruct(text) {
      instruction = text;
      showInstruction();
    },
    speak: say,
    hush() {
      line++;
      speaking = false;
      shown = '';
      instruction = '';
      balloon.close();
    },
    async prompt(text, placeholder) {
      const mine = ++line;
      speaking = true;
      shown = '';
      const typed = await balloon.prompt(text, { maxLength: MAX_QUESTION_CHARS, placeholder });
      if (mine === line) speaking = false;
      return typed;
    },
    onGesture: (cb) => { gestureCb = cb; },
    onAsk: (cb) => { askCb = cb; },
    closeMenu: () => menu.close(),
  };
}
