import {
  DEFAULT_PHYSICS, FlightLog, RELEASE_SILENCE_MS, THROW_MIN_SPEED, VelocityTracker, clampSpeed, isRoughLanding, scaleConfig, step,
} from './throwPhysics';
import type { Body, Bounds, Surface } from './throwPhysics';

export { RELEASE_SILENCE_MS };

export interface ThrowLanding {
  /** Final window position (the same units `setPosition` takes). */
  x: number;
  y: number;
  rough: boolean;
  bounces: number;
}

export interface ThrowDeps {
  /** Device pixel ratio of the window he is on (physical px per logical px). */
  dpr(): number;
  /** The work-area bounds of the monitor the window is on (in the units of the move events) and that monitor's scale. */
  locate(pos: { x: number; y: number }): Promise<{ bounds: Bounds; scale: number } | null>;
  setPosition(x: number, y: number): Promise<void>;
  raf(cb: (t: number) => void): number;
  caf(id: number): void;
  onLaunch(): void;
  /** `speed` is in logical px/s. */
  onBounce(surface: Surface, speed: number): void;
  onLand(l: ThrowLanding): void;
}

/**
 * Drag release -> flight -> rest.
 *
 * Native `startDragging` hides the pointer from JS, so the only signal is the window's own `onMoved` positions
 * (fed through `move`). `release` is called after a short silence (RELEASE_SILENCE_MS) following the last one.
 * A slow release is a no-op, so dropping him gently behaves exactly as it always did. rAF runs only while flying.
 */
export class Thrower {
  private readonly tracker = new VelocityTracker();
  private dragging = false;
  private gen = 0; // bumped by every beginDrag/cancel: stale async work checks it
  private rafId: number | null = null;
  private isFlying = false;

  constructor(private readonly deps: ThrowDeps) {}

  get flying(): boolean {
    return this.isFlying;
  }

  /** The user grabbed him (or something else took over): forget the old drag and stop any flight. */
  beginDrag(): void {
    this.cancel();
    this.tracker.reset();
    this.dragging = true;
  }

  cancel(): void {
    this.gen++;
    this.dragging = false;
    if (this.rafId !== null) this.deps.caf(this.rafId);
    this.rafId = null;
    this.isFlying = false;
  }

  /** A window `onMoved` position. Ignored unless a drag is in progress (so our own setPosition echoes never count). */
  move(x: number, y: number, t: number): void {
    if (this.dragging && !this.isFlying) this.tracker.push(x, y, t);
  }

  /** True when this release became a throw. */
  async release(now: number): Promise<boolean> {
    if (!this.dragging) return false;
    const gen = this.gen;
    const rel = this.tracker.release(now);
    const last = this.lastPos();
    this.dragging = false;
    if (!rel || !last) return false;
    const dpr = this.deps.dpr() || 1;
    if (rel.speed / dpr < THROW_MIN_SPEED) return false;
    const where = await this.deps.locate(last);
    if (!where || gen !== this.gen) return false; // a new drag started while we looked up the monitor
    this.launch(last, rel, where, gen);
    return true;
  }

  private lastPos(): { x: number; y: number } | null {
    return this.tracker.last();
  }

  private launch(from: { x: number; y: number }, rel: { vx: number; vy: number }, where: { bounds: Bounds; scale: number }, gen: number): void {
    const cfg = scaleConfig(DEFAULT_PHYSICS, where.scale);
    const v = clampSpeed(rel.vx, rel.vy, cfg.maxSpeed);
    let body: Body = { x: from.x, y: from.y, vx: v.vx, vy: v.vy };
    const log = new FlightLog(where.scale);
    let prev = 0;
    this.isFlying = true;
    this.deps.onLaunch();
    const frame = (t: number) => {
      this.rafId = null;
      if (gen !== this.gen) return;
      const dt = prev === 0 ? 1 / 60 : (t - prev) / 1000;
      prev = t;
      const r = step(body, where.bounds, dt, cfg);
      body = r.body;
      log.add(r.bounces);
      for (const b of r.bounces) this.deps.onBounce(b.surface, b.speed / where.scale);
      this.deps
        .setPosition(Math.round(body.x), Math.round(body.y))
        .then(() => {
          if (gen !== this.gen) return;
          if (r.resting) this.land(body, log, gen);
          else this.rafId = this.deps.raf(frame);
        })
        .catch((e) => {
          console.warn('throw setPosition failed', e);
          if (gen === this.gen) this.isFlying = false;
        });
    };
    this.rafId = this.deps.raf(frame);
  }

  private land(body: Body, log: FlightLog, gen: number): void {
    if (gen !== this.gen) return;
    this.isFlying = false;
    this.deps.onLand({ x: Math.round(body.x), y: Math.round(body.y), rough: isRoughLanding(log), bounces: log.bounces });
  }
}
