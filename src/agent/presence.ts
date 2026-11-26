import type { AnimName } from '../anim/types';
import { dateKey } from './hydration';
import type { Rng } from '../util/rng';

/** What the Rust sampler (`system.rs`) reports. */
export interface SystemSnapshot {
  fullscreen: boolean; // another app is full screen / presenting on his display
  batteryPct: number | null;
  charging: boolean | null; // true = on AC power
  cpuPct: number; // system-wide, smoothed
  audioPlaying: boolean;
  idleSecs: number; // used by the stretch-break logic in phase 2
}

export interface PresenceConfig { hideWhenPresenting: boolean; reactToMusic: boolean }
/** The live state `main.ts` knows and Presence does not. */
export interface PresenceCtx {
  now: number;
  hidden: boolean; // currently off screen (or hiding)
  quiet: boolean; // quiet mode: no lines (hide/show and animations are unaffected)
  busy: boolean; // speaking, menu open, asleep, mid-reminder, eye-follow...: do not interrupt
}

export type PresenceLine = 'lowBattery' | 'overheating' | 'lateNight';
export type Reaction =
  | { type: 'hide' }
  | { type: 'show' }
  | { type: 'react'; line: PresenceLine; anim?: AnimName; speak: boolean };

export const LOW_BATTERY_PCT = 15;
export const HIGH_CPU_PCT = 85;
export const CPU_SUSTAIN_MS = 30_000;
export const CPU_COOLDOWN_MS = 10 * 60_000;
export const DANCE_COOLDOWN_MS = 3 * 60_000;
export const TIRED_GAP_MS = 45_000;
export const TIRED_CHANCE = 0.6;
export const YAWN_GAP_MS = 3 * 60_000;
export const YAWN_CHANCE = 0.3;
export const NIGHT_END_HOUR = 5; // night is 00:00 until 05:00 local

export function isLowBattery(s: SystemSnapshot): boolean {
  return s.batteryPct !== null && s.batteryPct <= LOW_BATTERY_PCT && s.charging !== true;
}

export function isNight(t: number): boolean {
  return new Date(t).getHours() < NIGHT_END_HOUR;
}

/**
 * Turns system snapshots into reactions. Pure and clock-free: every call gets `ctx.now`, so it is
 * fully testable. `main.ts` executes the reactions and calls `tick` every ~10 s (the Rust sampler
 * only emits on change, so time-based rules such as "CPU high for 30 s" need a heartbeat).
 */
export class Presence {
  private snap: SystemSnapshot | null = null;
  private lastFullscreen = false;
  private hiddenByMe = false;
  private wasLow = false;
  private lowPending = false;
  private cpuHighSince: number | null = null;
  private lastCpuReact = -Infinity;
  private lastDance = -Infinity;
  private lastTired = -Infinity;
  private lastYawn = -Infinity;
  private nightKey = '';

  constructor(private cfg: PresenceConfig, private readonly rng: Rng = Math.random) {}

  /** True while the battery is low and not charging (drives the Tired idle animation). */
  get low(): boolean {
    return this.wasLow;
  }

  /** Call when the user (not Presence) hid or showed him: that takes over from any automatic hide. */
  userChangedVisibility(): void {
    this.hiddenByMe = false;
  }

  /** True while the current hide is Presence's own (full screen), not the user's. */
  isAutoHidden(): boolean {
    return this.hiddenByMe;
  }

  /** The host kept him hidden for full screen (he came home from the welcome guide): show him when it ends. */
  adoptHidden(): void {
    this.hiddenByMe = true;
  }

  setConfig(cfg: PresenceConfig, ctx: PresenceCtx): Reaction[] {
    const before = this.cfg;
    this.cfg = { ...cfg };
    if (before.hideWhenPresenting === cfg.hideWhenPresenting) return [];
    if (cfg.hideWhenPresenting) {
      if (this.snap?.fullscreen && !ctx.hidden && !this.hiddenByMe) {
        this.hiddenByMe = true;
        return [{ type: 'hide' }];
      }
      return [];
    }
    if (this.hiddenByMe) {
      this.hiddenByMe = false;
      return [{ type: 'show' }];
    }
    return [];
  }

  update(s: SystemSnapshot, ctx: PresenceCtx): Reaction[] {
    this.snap = s;
    const out: Reaction[] = [];
    if (s.fullscreen !== this.lastFullscreen) {
      this.lastFullscreen = s.fullscreen;
      out.push(...this.onFullscreen(s.fullscreen, ctx));
    }
    const low = isLowBattery(s);
    if (low && !this.wasLow) this.lowPending = true; // a fresh drop below the threshold
    if (!low) this.lowPending = false;
    this.wasLow = low;
    return [...out, ...this.lines(ctx)];
  }

  /** Heartbeat for time-based rules. */
  tick(ctx: PresenceCtx): Reaction[] {
    return this.lines(ctx);
  }

  /** Called when the idle scheduler wants an animation: returns a presence-flavoured one or null. */
  idleAnim(ctx: PresenceCtx): AnimName | null {
    if (ctx.hidden || this.hiddenByMe) return null;
    const s = this.snap;
    if (s?.audioPlaying && this.cfg.reactToMusic && ctx.now - this.lastDance >= DANCE_COOLDOWN_MS) {
      this.lastDance = ctx.now;
      return 'Dance';
    }
    if (this.wasLow && ctx.now - this.lastTired >= TIRED_GAP_MS && this.rng() < TIRED_CHANCE) {
      this.lastTired = ctx.now;
      return 'Tired';
    }
    if (isNight(ctx.now) && ctx.now - this.lastYawn >= YAWN_GAP_MS && this.rng() < YAWN_CHANCE) {
      this.lastYawn = ctx.now;
      return 'Yawn';
    }
    return null;
  }

  private onFullscreen(on: boolean, ctx: PresenceCtx): Reaction[] {
    if (on) {
      if (!this.cfg.hideWhenPresenting || ctx.hidden) return []; // already hidden: the user's choice stands
      this.hiddenByMe = true;
      return [{ type: 'hide' }];
    }
    if (!this.hiddenByMe) return [];
    this.hiddenByMe = false;
    return ctx.hidden ? [{ type: 'show' }] : [];
  }

  /** At most one spoken reaction per call; the rest wait for the next heartbeat. */
  private lines(ctx: PresenceCtx): Reaction[] {
    const s = this.snap;
    if (!s) return [];
    this.cpuHighSince = s.cpuPct > HIGH_CPU_PCT ? (this.cpuHighSince ?? ctx.now) : null;
    if (ctx.hidden || this.hiddenByMe || ctx.busy) return [];
    const speak = !ctx.quiet;
    if (this.lowPending) {
      this.lowPending = false;
      return [{ type: 'react', line: 'lowBattery', anim: 'Tired', speak }];
    }
    if (this.cpuHighSince !== null && ctx.now - this.cpuHighSince >= CPU_SUSTAIN_MS && ctx.now - this.lastCpuReact >= CPU_COOLDOWN_MS) {
      this.lastCpuReact = ctx.now;
      return [{ type: 'react', line: 'overheating', anim: 'Sweat', speak }];
    }
    if (isNight(ctx.now) && this.nightKey !== dateKey(ctx.now)) {
      this.nightKey = dateKey(ctx.now);
      return speak ? [{ type: 'react', line: 'lateNight', anim: 'Yawn', speak }] : [];
    }
    return [];
  }
}
