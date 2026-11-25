import { ANIMATIONS } from '../anim/animations';
import type { AnimName } from '../anim/types';

export const STRETCH_OPTIONS = [30, 45, 60, 90] as const;
export type StretchMin = (typeof STRETCH_OPTIONS)[number];
export const DEFAULT_STRETCH_MIN: StretchMin = 60;

/** A sample counts as an active minute while the last input was less than this long ago. */
export const ACTIVE_BELOW_SECS = 60;
/** This much idle time is a real break: the count (and any snooze) starts over. */
export const BREAK_AT_SECS = 300;
export const SNOOZE_MIN = 15;
/** Samples further apart than this (machine sleep, frozen timers) are not credited as work. */
export const MAX_SAMPLE_GAP_MS = 150_000;
/** How often main.ts samples the idle time. */
export const SAMPLE_EVERY_MS = 60_000;

export interface StretchConfig { enabled: boolean; everyMin: StretchMin }
/** What `main.ts` knows and this module does not. Any `true` here defers the offer (it stays due). */
export interface StretchCtx {
  now: number;
  hidden: boolean;
  quiet: boolean;
  focus: boolean; // focus timer running
  presenting: boolean; // another app is full screen
  reminder: boolean; // a water reminder is showing
  busy: boolean; // speaking, menu open, asleep ...
}

/**
 * Counts *active minutes* (idleSecs < 60) and says when a stretch break is due. Pure and clock-free:
 * every call gets the time, so it is fully testable. `main.ts` calls `sample` once a minute.
 */
export class StretchBreaks {
  private activeMs = 0;
  private lastAt: number | null = null;
  private snoozedUntil = 0;

  constructor(private cfg: StretchConfig) {}

  get config(): StretchConfig { return { ...this.cfg }; }
  get activeMinutes(): number { return Math.floor(this.activeMs / 60_000); }

  setConfig(patch: Partial<StretchConfig>): void {
    if (patch.enabled === true && !this.cfg.enabled) this.reset();
    this.cfg = { ...this.cfg, ...patch };
  }

  sample(idleSecs: number, now: number): void {
    const gap = this.lastAt === null ? 0 : now - this.lastAt;
    this.lastAt = now;
    if (idleSecs >= BREAK_AT_SECS) {
      this.reset();
      return;
    }
    if (idleSecs < ACTIVE_BELOW_SECS && gap > 0 && gap <= MAX_SAMPLE_GAP_MS) this.activeMs += gap;
  }

  due(ctx: StretchCtx): boolean {
    if (!this.cfg.enabled) return false;
    if (this.activeMs < this.cfg.everyMin * 60_000 || ctx.now < this.snoozedUntil) return false;
    return !(ctx.hidden || ctx.quiet || ctx.focus || ctx.presenting || ctx.reminder || ctx.busy);
  }

  /** "Stretch with me": the count starts over. */
  completed(): void {
    this.reset();
  }

  /** "Later" (or the balloon timed out): ask again in 15 min, keeping the count. */
  later(now: number): void {
    this.snoozedUntil = now + SNOOZE_MIN * 60_000;
  }

  private reset(): void {
    this.activeMs = 0;
    this.snoozedUntil = 0;
  }
}

export interface StretchStep { anim: AnimName; line: string }
/** The guided sequence (~30 s): each step plays its pose while the line is on screen. */
export const GUIDED_STEPS: StretchStep[] = [
  { anim: 'StretchReach', line: 'Reach up... all the way to the ceiling.' },
  { anim: 'StretchSide', line: 'And side... lean left, then right. Breathe.' },
  { anim: 'StretchFold', line: 'Now fold forward... let it all hang loose.' },
  { anim: 'StretchReach', line: 'And reach up once more... tall as a paperclip!' },
];

/** Total playing time of the guided steps (animation lengths; the balloon only has to fit inside). */
export function guidedDurationMs(): number {
  let total = 0;
  for (const s of GUIDED_STEPS) {
    const a = ANIMATIONS[s.anim];
    total += a.frames.reduce((sum, f) => sum + f.duration, 0) * (a.timeScale ?? 1);
  }
  return total;
}

/**
 * Runs the steps in order through `play`, stopping as soon as `aborted()` turns true (the user clicked,
 * the agent was interrupted...). Returns true when every step ran.
 */
export async function runGuided(play: (step: StretchStep) => Promise<void>, aborted: () => boolean): Promise<boolean> {
  for (const step of GUIDED_STEPS) {
    if (aborted()) return false;
    await play(step);
  }
  return !aborted();
}
