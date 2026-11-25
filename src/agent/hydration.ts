import type { Timers } from './scheduler';

/** Reminders only fire inside these local hours: [start, end). */
export const ACTIVE_START_HOUR = 8;
export const ACTIVE_END_HOUR = 22;
export const INTERVAL_OPTIONS = [30, 45, 60, 90] as const;
export type IntervalMin = (typeof INTERVAL_OPTIONS)[number];
export const DEFAULT_INTERVAL: IntervalMin = 45;
export const SNOOZE_MIN = 10;
export const RETRY_MS = 60_000; // hidden / balloon open: look again shortly
export const GRACE_MS = 60_000; // overdue at launch: wait a moment before nagging

export type ReminderResult = 'drank' | 'later';

export interface HydrationConfig { enabled: boolean; intervalMin: IntervalMin }
export interface HydrationState { lastReminderAt: number | null; glasses: number; glassesDate: string }
export interface HydrationHandlers {
  /** Show the reminder (animation + balloon with buttons) and report what the user chose. */
  remind(info: { snoozed: boolean }): Promise<ReminderResult>;
  isHidden(): boolean;
  isBlocked(): boolean; // a balloon (or another reminder) is already open
  save(state: HydrationState): void;
}

export function dateKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function inActiveHours(t: number): boolean {
  const h = new Date(t).getHours();
  return h >= ACTIVE_START_HOUR && h < ACTIVE_END_HOUR;
}

function nextActiveStart(t: number): number {
  const d = new Date(t);
  d.setHours(ACTIVE_START_HOUR, 0, 0, 0);
  if (d.getTime() <= t) d.setDate(d.getDate() + 1);
  return d.getTime();
}

const globalTimers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

/**
 * Water reminders. Independent of quiet mode. Persisted `lastReminderAt` keeps the cadence across
 * restarts (no instant re-fire, no reset). "Later" snoozes once (10 min), then the normal interval resumes.
 */
export class HydrationScheduler {
  private active = false;
  private id: unknown;
  private busy = false;
  private snoozedUntil: number | null = null;
  private listeners = new Set<() => void>();

  constructor(
    private cfg: HydrationConfig,
    private readonly state: HydrationState,
    private readonly h: HydrationHandlers,
    private readonly now: () => number = () => Date.now(),
    private readonly timers: Timers = globalTimers,
  ) {}

  get config(): HydrationConfig { return { ...this.cfg }; }
  get snapshot(): HydrationState { return { ...this.state }; }

  /** Today's glasses; reads as 0 once the local date has rolled over. */
  get glassesToday(): number {
    return this.state.glassesDate === dateKey(this.now()) ? this.state.glasses : 0;
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    let grace = false;
    if (this.state.lastReminderAt === null) {
      this.state.lastReminderAt = this.now(); // baseline: first launch starts the interval
      this.h.save({ ...this.state });
    } else if (this.state.lastReminderAt + this.cfg.intervalMin * 60_000 <= this.now()) {
      grace = true;
    }
    this.arm(grace ? GRACE_MS : undefined);
  }

  stop(): void {
    this.active = false;
    this.clearTimer();
  }

  setConfig(patch: Partial<HydrationConfig>): void {
    const reEnabled = patch.enabled === true && !this.cfg.enabled;
    this.cfg = { ...this.cfg, ...patch };
    if (reEnabled) {
      this.state.lastReminderAt = this.now(); // turning reminders back on restarts the interval
      this.snoozedUntil = null;
      this.h.save({ ...this.state });
    }
    if (this.active) this.arm();
  }

  /** "Remind me now": ignores active hours and hidden state (the caller shows him first). */
  async remindNow(): Promise<void> {
    if (this.busy) return;
    this.clearTimer();
    await this.run(true);
  }

  private clearTimer(): void {
    if (this.id !== undefined) {
      this.timers.clearTimeout(this.id);
      this.id = undefined;
    }
  }

  private arm(delay?: number): void {
    this.clearTimer();
    if (!this.active || !this.cfg.enabled || this.busy) return;
    let ms = delay;
    if (ms === undefined) {
      const due = this.snoozedUntil ?? (this.state.lastReminderAt ?? this.now()) + this.cfg.intervalMin * 60_000;
      ms = Math.max(0, due - this.now());
    }
    this.id = this.timers.setTimeout(() => {
      this.id = undefined;
      void this.run(false);
    }, ms);
  }

  private async run(force: boolean): Promise<void> {
    if (!force) {
      if (!this.active || !this.cfg.enabled) return;
      if (this.h.isHidden() || this.h.isBlocked()) return this.arm(RETRY_MS);
      const t = this.now();
      if (!inActiveHours(t)) return this.arm(Math.max(RETRY_MS, nextActiveStart(t) - t));
    } else if (this.h.isBlocked()) {
      return;
    }
    const wasSnooze = this.snoozedUntil !== null;
    this.busy = true;
    this.state.lastReminderAt = this.now();
    this.h.save({ ...this.state });
    let result: ReminderResult = 'later';
    try {
      result = await this.h.remind({ snoozed: wasSnooze });
    } catch (e) {
      console.warn('reminder failed', e);
    }
    this.busy = false;
    const t = this.now();
    if (result === 'drank') {
      const today = dateKey(t);
      this.state.glasses = this.state.glassesDate === today ? this.state.glasses + 1 : 1;
      this.state.glassesDate = today;
      this.state.lastReminderAt = t;
      this.snoozedUntil = null;
    } else if (!wasSnooze) {
      this.snoozedUntil = t + SNOOZE_MIN * 60_000; // snooze once
    } else {
      this.snoozedUntil = null; // snoozed again: back to the normal interval from now
      this.state.lastReminderAt = t;
    }
    this.h.save({ ...this.state });
    for (const cb of [...this.listeners]) cb();
    this.arm();
  }
}
