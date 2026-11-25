import { randRange } from '../util/rng';
import type { Rng } from '../util/rng';
import type { Timers } from './scheduler';

export interface SleepConfig {
  inactivityMinMs: number; // no user interaction for this long -> nap
  inactivityMaxMs: number;
  idleChance: number; // probability that an idle-animation pick turns into a nap instead
  hoverWakeMs: number; // cursor hovering over the character this long wakes it
  retryMs: number; // re-check delay when something is in progress
}
export const DEFAULT_SLEEP: SleepConfig = {
  inactivityMinMs: 4 * 60_000,
  inactivityMaxMs: 8 * 60_000,
  idleChance: 0.03,
  hoverWakeMs: 600,
  retryMs: 10_000,
};

export type SleepState = 'awake' | 'falling' | 'asleep' | 'waking';
export type WakeReason = 'click' | 'doubleClick' | 'drag' | 'hover' | 'command' | 'reminder';

export interface SleepHandlers {
  /** Play FallAsleep and start the Sleeping loop. Resolves when the clip is asleep. */
  fallAsleep(): Promise<void>;
  /** Play WakeUp and speak a line. Resolves when finished. */
  wake(reason: WakeReason): Promise<void>;
  /** Something (animation, balloon, menu) is in progress: don't nap now. */
  isBusy(): boolean;
}

const globalTimers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export class SleepController {
  private st: SleepState = 'awake';
  private active = false;
  private inactivity: unknown;
  private hover: unknown;
  private wakePending: WakeReason | null = null;
  private gen = 0;
  private listeners = new Set<(s: SleepState) => void>();

  constructor(
    private cfg: SleepConfig,
    private readonly h: SleepHandlers,
    private readonly rng: Rng = Math.random,
    private readonly timers: Timers = globalTimers,
  ) {}

  get state(): SleepState { return this.st; }
  /** True while falling asleep, asleep or waking: no scheduled animations or utterances. */
  get sleeping(): boolean { return this.st !== 'awake'; }
  get asleep(): boolean { return this.st === 'asleep'; }

  onChange(cb: (s: SleepState) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.armInactivity();
  }

  stop(): void {
    this.active = false;
    this.clear('inactivity');
    this.clear('hover');
  }

  /** Any user interaction while awake pushes the nap back; while asleep it wakes (use `wake`). */
  notifyActivity(): void {
    if (this.st === 'awake') this.armInactivity();
  }

  /** Idle-animation picker calls this: small chance the idle choice is a nap. Returns true if napping. */
  maybeIdleSleep(): boolean {
    if (!this.active || this.st !== 'awake' || this.rng() >= this.cfg.idleChance) return false;
    void this.sleepNow();
    return true;
  }

  async sleepNow(): Promise<void> {
    if (this.st !== 'awake') return;
    this.clear('inactivity');
    const gen = this.gen;
    this.set('falling');
    try {
      await this.h.fallAsleep();
    } catch (e) {
      console.warn('fallAsleep failed', e);
    }
    if (gen !== this.gen) return; // reset() happened meanwhile (e.g. hidden)
    if (this.wakePending) {
      const r = this.wakePending;
      this.wakePending = null;
      this.set('asleep');
      await this.wake(r);
    } else {
      this.set('asleep');
    }
  }

  async wake(reason: WakeReason): Promise<void> {
    this.clear('hover');
    if (this.st === 'falling') {
      this.wakePending = reason;
      return;
    }
    if (this.st !== 'asleep') return;
    const gen = this.gen;
    this.set('waking');
    try {
      await this.h.wake(reason);
    } catch (e) {
      console.warn('wake failed', e);
    }
    if (gen !== this.gen) return;
    this.set('awake');
    this.armInactivity();
  }

  /** Drop back to awake without any animation (used when hiding / quitting). */
  reset(): void {
    this.gen++;
    this.wakePending = null;
    this.clear('inactivity');
    this.clear('hover');
    if (this.st !== 'awake') this.set('awake');
  }

  hoverStart(): void {
    if (!this.sleeping || this.hover !== undefined) return;
    this.hover = this.timers.setTimeout(() => {
      this.hover = undefined;
      void this.wake('hover');
    }, this.cfg.hoverWakeMs);
  }

  hoverEnd(): void {
    this.clear('hover');
  }

  private set(s: SleepState): void {
    this.st = s;
    for (const cb of [...this.listeners]) cb(s);
  }

  private clear(k: 'inactivity' | 'hover'): void {
    if (this[k] !== undefined) {
      this.timers.clearTimeout(this[k]);
      this[k] = undefined;
    }
  }

  private armInactivity(delay?: number): void {
    this.clear('inactivity');
    if (!this.active) return;
    const ms = delay ?? randRange(this.rng, this.cfg.inactivityMinMs, this.cfg.inactivityMaxMs);
    this.inactivity = this.timers.setTimeout(() => {
      this.inactivity = undefined;
      if (this.st !== 'awake') return;
      if (this.h.isBusy()) this.armInactivity(this.cfg.retryMs);
      else void this.sleepNow();
    }, ms);
  }
}
