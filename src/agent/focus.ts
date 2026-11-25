import type { Timers } from './scheduler';

export const FOCUS_OPTIONS = [15, 25, 45, 60] as const;
export type FocusMin = (typeof FOCUS_OPTIONS)[number];

export interface FocusSaved { endsAt: number; minutes: number }
export interface FocusHandlers {
  /** The whole-minutes-left label changed (once a minute). */
  onTick(minutesLeft: number): void;
  /** The time ran out (also fires after a machine sleep that outlasted the timer). */
  onDone(): void;
  /** Persist the end timestamp (null = nothing running). */
  save(s: FocusSaved | null): void;
}

const MIN = 60_000;

const globalTimers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

/** What the prop shows: whole minutes left, never below 1 while it is still running. */
export function focusLabel(minutesLeft: number): string {
  return String(Math.max(1, Math.round(minutesLeft)));
}

/**
 * Focus timer. It only stores an end timestamp, so a sleeping machine cannot make it drift: every wake-up
 * recomputes the time left from the clock. One timeout at a time, aimed at the next whole-minute boundary
 * (no per-second updates, no rAF).
 */
export class FocusTimer {
  private endsAt: number | null = null;
  private minutes = 0;
  private id: unknown;

  constructor(
    private readonly h: FocusHandlers,
    private readonly now: () => number = () => Date.now(),
    private readonly timers: Timers = globalTimers,
  ) {}

  get active(): boolean { return this.endsAt !== null; }
  get end(): number | null { return this.endsAt; }
  get totalMinutes(): number { return this.minutes; }

  /** Whole minutes left, rounded up (0 when idle). */
  minutesLeft(): number {
    return this.endsAt === null ? 0 : Math.max(0, Math.ceil((this.endsAt - this.now()) / MIN));
  }

  start(minutes: number): void {
    this.clear();
    this.minutes = minutes;
    this.endsAt = this.now() + minutes * MIN;
    this.h.save({ endsAt: this.endsAt, minutes });
    this.arm();
  }

  /** Picks up a persisted end time after a restart. False (and cleared) when it already passed. */
  resume(endsAt: number, minutes: number): boolean {
    this.clear();
    if (!(endsAt > this.now())) {
      this.h.save(null);
      return false;
    }
    this.minutes = minutes;
    this.endsAt = endsAt;
    this.arm();
    return true;
  }

  stop(): void {
    if (this.endsAt === null) return;
    this.clear();
    this.h.save(null);
  }

  /** Re-reads the clock now (call it after a wake-up or unlock: the OS may have paused the pending timer). */
  check(): void {
    if (this.endsAt === null) return;
    if (this.id !== undefined) this.timers.clearTimeout(this.id);
    this.fire();
  }

  private clear(): void {
    if (this.id !== undefined) this.timers.clearTimeout(this.id);
    this.id = undefined;
    this.endsAt = null;
  }

  private arm(): void {
    if (this.endsAt === null) return;
    const rem = this.endsAt - this.now();
    const left = Math.ceil(rem / MIN);
    // Fire when the label should change: at the next whole-minute boundary, or exactly at the end.
    const delay = Math.max(0, left <= 1 ? rem : rem - (left - 1) * MIN);
    this.id = this.timers.setTimeout(() => this.fire(), delay);
  }

  private fire(): void {
    this.id = undefined;
    if (this.endsAt === null) return;
    if (this.endsAt - this.now() <= 0) {
      this.clear();
      this.h.save(null);
      this.h.onDone();
      return;
    }
    this.h.onTick(this.minutesLeft());
    this.arm();
  }
}
