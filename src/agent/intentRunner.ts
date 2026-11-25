import type { AnimName } from '../anim/types';
import type { Intent } from './intents';
import { MAX_TIMER, MIN_TIMER } from './intents';

export const CREATOR_REPLY = "I was built by a designer called Annuai, and I'm inspired by the original Microsoft Clippy!";
export const CAPABILITIES_REPLY = 'I can run a focus timer, remind you to drink water and stretch, answer anything you ask, and tell you jokes and quotes!';
export const HIDE_REPLY = 'Bye! Click the menu-bar icon to bring me back.';

/** Everything an intent can do to the app; main.ts supplies the real pieces, tests supply fakes. */
export interface IntentDeps {
  /** Queues an animation (fire and forget). */
  play(anim: AnimName): void;
  /** Whole minutes left on the focus timer, or null when none runs. */
  focusLeft(): number | null;
  startTimer(minutes: number): void;
  stopTimer(): void;
  water: {
    enabled(): boolean;
    intervalMin(): number;
    setEnabled(on: boolean): void;
    /** Logs a glass like "Drank some"; returns today's count. */
    logGlass(): number;
  };
  content(kind: 'joke' | 'quote'): Promise<{ text: string; attribution?: string }>;
  /** The guided stretch (resolves when it is over). */
  stretch(): Promise<void>;
  /** The menu's take-a-nap command. */
  nap(): Promise<void>;
  hide(): Promise<void>;
  style(): 'classic' | 'flat';
  setStyle(s: 'classic' | 'flat'): void;
}

/**
 * What a local answer looks like to the Ask flow: the balloon text (with Reply / Done), an optional animation that plays
 * with it, and an optional follow-up that must happen AFTER he has spoken (a nap, a hide and the guided stretch take over
 * the screen, so they answer first and then run; those answers end the conversation).
 */
export interface IntentResult {
  reply: string;
  attribution?: string;
  anim?: AnimName;
  after?: () => Promise<void>;
}

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);
const every = (m: number): string => (m === 60 ? 'every hour' : `every ${m} minutes`);

export async function runIntent(intent: Intent, d: IntentDeps): Promise<IntentResult> {
  switch (intent.kind) {
    case 'aboutCreator':
      return { reply: CREATOR_REPLY, anim: 'Wave' };
    case 'capabilities':
      return { reply: CAPABILITIES_REPLY, anim: 'Greeting' };
    case 'animate':
      for (let i = 1; i < intent.repeat; i++) d.play(intent.anim); // the last round plays with the balloon
      return { reply: intent.reply, anim: intent.anim };
    case 'nap':
      return { reply: 'Okay, nap time. Zzz...', after: () => d.nap() };
    case 'startTimer':
      d.startTimer(intent.minutes);
      return { reply: `Done! ${intent.minutes}-minute focus timer started.` };
    case 'timerRange':
      return { reply: `I can time anything from ${MIN_TIMER} to ${MAX_TIMER} minutes. Try a number in between!` };
    case 'stopTimer':
      if (d.focusLeft() === null) return { reply: 'No timer is running right now.' };
      d.stopTimer();
      return { reply: 'Okay, timer stopped.' };
    case 'timeLeft': {
      const left = d.focusLeft();
      return { reply: left === null ? 'No timer is running right now. Want me to start one?' : `${left} ${plural(left, 'minute', 'minutes')} left on your focus timer.` };
    }
    case 'water': {
      const m = d.water.intervalMin();
      if (intent.action === 'off') {
        if (d.water.enabled()) d.water.setEnabled(false);
        return { reply: 'Okay, water reminders are off.' };
      }
      if (d.water.enabled()) return { reply: `Water reminders are already on. I'll nudge you ${every(m)}.` };
      d.water.setEnabled(true);
      return { reply: `You got it! I'll remind you to drink water ${every(m)}.` };
    }
    case 'drankWater': {
      const n = d.water.logGlass();
      return { reply: n === 1 ? "Nice! That's your first glass today." : `Nice! That's glass number ${n} today.`, anim: 'Congratulate' };
    }
    case 'joke':
    case 'quote': {
      const item = await d.content(intent.kind);
      return item.attribution ? { reply: item.text, attribution: item.attribution } : { reply: item.text };
    }
    case 'stretch':
      return { reply: "Great idea, let's stretch together!", after: () => d.stretch() };
    case 'hide':
      return { reply: HIDE_REPLY, after: () => d.hide() };
    case 'style': {
      const now = d.style();
      const next = intent.style === 'toggle' ? (now === 'classic' ? 'flat' : 'classic') : intent.style;
      if (next === now) return { reply: `I'm already in the ${next} style.` };
      d.setStyle(next);
      return { reply: `Switched to the ${next} style!` };
    }
  }
}
