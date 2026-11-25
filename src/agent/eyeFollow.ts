import type { Timers } from './scheduler';

/** Distance (logical px) at which the pupils saturate; closer cursors give proportionally smaller offsets. */
export const FALLOFF_PX = 160;
/** No cursor movement for this long ends eye-follow. */
export const FOLLOW_IDLE_MS = 8000;
const TAU_FOLLOW_MS = 70; // smoothing time constant per cursor event
const TAU_BACK_MS = 40; // ease back to centre (~200 ms to settle)

export interface Pt { x: number; y: number }

/** Pupil offset for one eye, inside the unit disc (the pose's pupils range is -1..1). */
export function pupilOffset(eye: Pt, cursor: Pt): Pt {
  const dx = cursor.x - eye.x;
  const dy = cursor.y - eye.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return { x: 0, y: 0 };
  const mag = Math.min(1, dist / FALLOFF_PX);
  return { x: (dx / dist) * mag, y: (dy / dist) * mag };
}

export interface FollowTarget { px: number; py: number; conv: number; tilt: number; ex: number; ey: number }
export const ZERO_TARGET: FollowTarget = { px: 0, py: 0, conv: 0, tilt: 0, ex: 0, ey: 0 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Eyes are in window logical px (from the SVG's on-screen position), so this works in any skin and pose. */
export function computeTarget(eyes: { l: Pt; r: Pt }, cursor: Pt, reducedMotion: boolean): FollowTarget {
  const ol = pupilOffset(eyes.l, cursor);
  const or = pupilOffset(eyes.r, cursor);
  const px = (ol.x + or.x) / 2;
  const py = (ol.y + or.y) / 2;
  // Geometry converges the eyes naturally when the cursor is close and between them.
  const conv = clamp(((ol.x - or.x) / 2) * 2.5, 0, 1);
  return { px, py, conv, tilt: reducedMotion ? 0 : clamp(px * 3, -3, 3), ex: px * 1.2, ey: py * 0.8 };
}

/** Critically-damped-style smoothing, no animation loop of its own: call update() per cursor event. */
export class EyeTracker {
  values: FollowTarget = { ...ZERO_TARGET };

  update(target: FollowTarget, dtMs: number): void {
    this.approach(target, dtMs, TAU_FOLLOW_MS);
  }

  /** Ease back toward centre (follow ended). */
  decay(dtMs: number): void {
    this.approach(ZERO_TARGET, dtMs, TAU_BACK_MS);
  }

  get settled(): boolean {
    return Object.values(this.values).every((v) => Math.abs(v) < 0.01);
  }

  reset(): void {
    this.values = { ...ZERO_TARGET };
  }

  private approach(t: FollowTarget, dtMs: number, tau: number): void {
    const a = 1 - Math.exp(-Math.min(Math.max(dtMs, 0), 100) / tau);
    const v = this.values;
    for (const k of Object.keys(v) as (keyof FollowTarget)[]) v[k] += (t[k] - v[k]) * a;
  }
}

export type FollowEnd = 'click' | 'drag' | 'idle' | 'user' | 'sleep' | 'hide' | 'interrupt';

export interface EyeFollowDeps {
  canStart(): boolean; // false while asleep or hidden
  onStart(): void;
  onEnd(reason: FollowEnd): void;
  inactivityMs?: number;
}

const globalTimers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export class EyeFollow {
  private on = false;
  private timer: unknown;

  constructor(private readonly d: EyeFollowDeps, private readonly timers: Timers = globalTimers) {}

  get active(): boolean {
    return this.on;
  }

  /** Single click on the clip: start, or end if already following. Returns whether anything changed. */
  click(): boolean {
    if (this.on) {
      this.end('click');
      return true;
    }
    if (!this.d.canStart()) return false;
    this.on = true;
    this.armIdle();
    this.d.onStart();
    return true;
  }

  end(reason: FollowEnd): void {
    if (!this.on) return;
    this.on = false;
    if (this.timer !== undefined) {
      this.timers.clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.d.onEnd(reason);
  }

  cursorMoved(): void {
    if (this.on) this.armIdle();
  }

  private armIdle(): void {
    if (this.timer !== undefined) this.timers.clearTimeout(this.timer);
    this.timer = this.timers.setTimeout(() => {
      this.timer = undefined;
      this.end('idle');
    }, this.d.inactivityMs ?? FOLLOW_IDLE_MS);
  }
}

export interface ClickDeps {
  sleeping: boolean;
  follow: EyeFollow;
  wake(): void;
  activity(): void;
}

/** What a single click on the clip does: wake him if asleep, otherwise toggle eye-follow. No random reaction. */
export function characterClick(d: ClickDeps): void {
  if (d.sleeping) {
    d.wake();
    return;
  }
  d.activity();
  d.follow.click();
}
