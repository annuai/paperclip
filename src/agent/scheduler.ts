import { randRange } from '../util/rng';
import type { Rng } from '../util/rng';

export interface SchedulerConfig {
  blinkMinMs: number; blinkMaxMs: number;
  idleMinMs: number; idleMaxMs: number;
  talkMinMs: number; talkMaxMs: number;
  quiet: boolean;
}
export const DEFAULT_SCHEDULER: SchedulerConfig = {
  blinkMinMs: 3000, blinkMaxMs: 7000,
  idleMinMs: 8000, idleMaxMs: 20000,
  talkMinMs: 120000, talkMaxMs: 300000,
  quiet: false,
};

export interface SchedulerHandlers { blink(): void; idleAnim(): void; talk(): void; isBusy(kind?: 'blink' | 'idle' | 'talk'): boolean }
export interface Timers { setTimeout(fn: () => void, ms: number): unknown; clearTimeout(id: unknown): void }

const globalTimers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

type Kind = 'blink' | 'idle' | 'talk';
const RETRY: Record<Kind, number> = { blink: 1000, idle: 3000, talk: 10000 };

export class IdleScheduler {
  private cfg: SchedulerConfig;
  private active = false;
  private ids: Partial<Record<Kind, unknown>> = {};

  constructor(
    cfg: SchedulerConfig,
    private readonly h: SchedulerHandlers,
    private readonly rng: Rng = Math.random,
    private readonly timers: Timers = globalTimers,
  ) {
    this.cfg = { ...cfg };
  }

  get running(): boolean {
    return this.active;
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.armAll();
  }

  stop(): void {
    this.active = false;
    for (const k of ['blink', 'idle', 'talk'] as Kind[]) this.clear(k);
  }

  setConfig(patch: Partial<SchedulerConfig>): void {
    this.cfg = { ...this.cfg, ...patch };
    if (this.active) this.armAll();
  }

  notifyActivity(): void {
    if (!this.active) return;
    this.arm('idle');
    this.arm('talk');
  }

  private armAll(): void {
    this.arm('blink');
    this.arm('idle');
    this.arm('talk');
  }

  private interval(k: Kind): number | null {
    const c = this.cfg;
    switch (k) {
      case 'blink': return randRange(this.rng, c.blinkMinMs, c.blinkMaxMs);
      case 'idle': return randRange(this.rng, c.idleMinMs, c.idleMaxMs) * (c.quiet ? 2 : 1);
      case 'talk': return c.quiet ? null : randRange(this.rng, c.talkMinMs, c.talkMaxMs);
    }
  }

  private clear(k: Kind): void {
    if (this.ids[k] !== undefined) {
      this.timers.clearTimeout(this.ids[k]);
      this.ids[k] = undefined;
    }
  }

  private arm(k: Kind, delay?: number): void {
    this.clear(k);
    if (!this.active) return;
    const ms = delay ?? this.interval(k);
    if (ms === null) return;
    this.ids[k] = this.timers.setTimeout(() => this.fire(k), ms);
  }

  private fire(k: Kind): void {
    this.ids[k] = undefined;
    if (!this.active) return;
    if (this.h.isBusy(k)) {
      this.arm(k, RETRY[k]);
      return;
    }
    try {
      if (k === 'blink') this.h.blink();
      else if (k === 'idle') this.h.idleAnim();
      else this.h.talk();
    } catch (e) {
      console.warn('scheduler handler failed', e);
    }
    this.arm(k);
  }
}
