/**
 * Throwing: pure physics for a window flung across the work area. No DOM, no Tauri.
 *
 * Units are whatever the caller uses (main.ts uses physical px so the numbers can go straight to
 * `setPosition`); `scaleConfig` converts the logical-px constants below by the display scale factor.
 * The body is the window's top-left corner; `boundsFor` turns a work area + the window's transparent
 * margins into the range that corner may take, so the *character* (not the 320x380 window) touches the walls.
 */

export interface Body { x: number; y: number; vx: number; vy: number }
export interface Bounds { minX: number; minY: number; maxX: number; maxY: number }
export type Surface = 'floor' | 'ceiling' | 'left' | 'right';
export interface Bounce { surface: Surface; speed: number }
export interface StepResult { body: Body; bounces: Bounce[]; resting: boolean }

export interface PhysicsConfig {
  gravity: number; // px/s^2
  restitution: number; // fraction of the normal speed kept after a bounce
  floorFriction: number; // 1/s: horizontal speed decay while sliding on the floor
  airDrag: number; // 1/s: very light, keeps long flights from feeling like a vacuum
  minBounceSpeed: number; // px/s: slower impacts do not bounce, they just stop
  restSpeed: number; // px/s: on the floor and slower than this on both axes = at rest
  maxSpeed: number; // px/s: release velocities are clamped to this
  maxDt: number; // s: longer frames are integrated as this (a stalled rAF must not teleport him)
}

/** Logical px. Tuned by feel: heavy enough to land, light enough to be fun (a paperclip, not a brick). */
export const DEFAULT_PHYSICS: PhysicsConfig = {
  gravity: 2200,
  restitution: 0.55,
  floorFriction: 4.5,
  airDrag: 0.15,
  minBounceSpeed: 150,
  restSpeed: 30,
  maxSpeed: 3200,
  maxDt: 1 / 30,
};

/** Release speed (logical px/s) above which a drag becomes a throw. A deliberate flick is 1000+; a careful drop is under 300. */
export const THROW_MIN_SPEED = 800;
/** Release velocity is measured over this much movement before the last move event. */
export const VELOCITY_WINDOW_MS = 80;
/** No move for this long before the release is evaluated = the pointer was held still, not flung. */
export const RELEASE_SILENCE_MS = 60;
/** Impacts slower than this (logical px/s) are not counted as "a bounce" for the rough-landing rule. */
export const ROUGH_BOUNCE_SPEED = 300;
/** One impact this hard (logical px/s) is a rough landing on its own. */
export const ROUGH_IMPACT_SPEED = 1800;
export const ROUGH_BOUNCES = 2;

/** Length-based constants scale with the display scale factor; ratios and rates do not. */
export function scaleConfig(c: PhysicsConfig, k: number): PhysicsConfig {
  return { ...c, gravity: c.gravity * k, minBounceSpeed: c.minBounceSpeed * k, restSpeed: c.restSpeed * k, maxSpeed: c.maxSpeed * k };
}

export interface Insets { left: number; right: number; top: number; bottom: number }

/**
 * Range of the window's top-left so that the character stays inside `area`. The insets are the empty
 * (transparent) margins between the window edge and the drawn character, so he lands ON the work-area edge.
 */
export function boundsFor(area: { x: number; y: number; w: number; h: number }, win: { w: number; h: number }, ins: Insets): Bounds {
  return {
    minX: area.x - ins.left,
    maxX: area.x + area.w - (win.w - ins.right),
    minY: area.y - ins.top,
    maxY: area.y + area.h - (win.h - ins.bottom),
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Internal fixed sub-step: collisions are resolved at this rate whatever the display's frame rate is. */
const SUBSTEP = 1 / 240;

export function step(b: Body, bounds: Bounds, dtIn: number, cfg: PhysicsConfig): StepResult {
  const total = clamp(dtIn, 0, cfg.maxDt);
  const n = Math.max(1, Math.ceil(total / SUBSTEP - 1e-9));
  let cur = b;
  const bounces: Bounce[] = [];
  let resting = false;
  for (let i = 0; i < n; i++) {
    const r = substep(cur, bounds, total / n, cfg);
    cur = r.body;
    resting = r.resting;
    bounces.push(...r.bounces);
  }
  return { body: cur, bounces, resting };
}

function substep(b: Body, bounds: Bounds, dt: number, cfg: PhysicsConfig): StepResult {
  const bounces: Bounce[] = [];
  const maxX = Math.max(bounds.minX, bounds.maxX);
  const maxY = Math.max(bounds.minY, bounds.maxY);
  const drag = Math.exp(-cfg.airDrag * dt);
  let vx = b.vx * drag;
  let vy = (b.vy + cfg.gravity * dt) * drag;
  let x = b.x + vx * dt;
  let y = b.y + vy * dt;

  const hit = (surface: Surface, normalSpeed: number): number => {
    const speed = Math.abs(normalSpeed);
    if (speed < cfg.minBounceSpeed) return 0; // too gentle to bounce: stop dead against the surface
    bounces.push({ surface, speed });
    return -normalSpeed * cfg.restitution;
  };
  if (x < bounds.minX) { x = bounds.minX; vx = hit('left', vx); }
  else if (x > maxX) { x = maxX; vx = hit('right', vx); }
  if (y < bounds.minY) { y = bounds.minY; vy = hit('ceiling', vy); }
  else if (y > maxY) { y = maxY; vy = hit('floor', vy); }

  const onFloor = y >= maxY;
  if (onFloor) vx *= Math.exp(-cfg.floorFriction * dt);
  const resting = onFloor && Math.abs(vx) < cfg.restSpeed && Math.abs(vy) < cfg.restSpeed;
  if (resting) { vx = 0; vy = 0; }
  return { body: { x, y, vx, vy }, bounces, resting };
}

export interface Release { vx: number; vy: number; speed: number }

/**
 * Release velocity from timestamped window positions. Native dragging hides the pointer from JS, so the
 * samples are the window's own `onMoved` positions; the "release" is the silence after the last one.
 */
export class VelocityTracker {
  private pts: { x: number; y: number; t: number }[] = [];

  get size(): number {
    return this.pts.length;
  }

  push(x: number, y: number, t: number): void {
    this.pts.push({ x, y, t });
    if (this.pts.length > 64) this.pts.splice(0, this.pts.length - 32);
  }

  reset(): void {
    this.pts = [];
  }

  /** The most recent position pushed, or null. */
  last(): { x: number; y: number } | null {
    const p = this.pts[this.pts.length - 1];
    return p ? { x: p.x, y: p.y } : null;
  }

  /**
   * Velocity (units/s) over the last VELOCITY_WINDOW_MS of motion, or null when there is none: fewer than two
   * samples, the pointer was still for a while before `now`, or he was decelerating hard into the release
   * (the final stretch much slower than the window as a whole, i.e. a flick that was held at the end).
   */
  release(now: number): Release | null {
    const n = this.pts.length;
    if (n < 2) return null;
    const last = this.pts[n - 1];
    if (now - last.t > VELOCITY_WINDOW_MS) return null;
    let i = n - 1;
    while (i > 0 && last.t - this.pts[i - 1].t <= VELOCITY_WINDOW_MS) i--;
    const first = this.pts[i];
    const dt = (last.t - first.t) / 1000;
    if (dt <= 0) return null;
    const vx = (last.x - first.x) / dt;
    const vy = (last.y - first.y) / dt;
    const speed = Math.hypot(vx, vy);
    // Tail check: the last ~third of the window must still be moving at a good fraction of the average.
    const mid = this.pts.slice(i).find((p) => last.t - p.t <= VELOCITY_WINDOW_MS / 3);
    if (mid && mid !== last) {
      const tdt = (last.t - mid.t) / 1000;
      if (tdt > 0 && Math.hypot(last.x - mid.x, last.y - mid.y) / tdt < speed * 0.4) return null;
    }
    return { vx, vy, speed };
  }
}

/** Clamp a release velocity to the configured maximum, keeping its direction. */
export function clampSpeed(vx: number, vy: number, max: number): { vx: number; vy: number } {
  const s = Math.hypot(vx, vy);
  if (s <= max || s === 0) return { vx, vy };
  return { vx: (vx / s) * max, vy: (vy / s) * max };
}

/** Accumulates a flight's impacts (in physical px/s: divide by the scale factor via the `scale` argument). */
export class FlightLog {
  bounces = 0; // impacts that count (see ROUGH_BOUNCE_SPEED)
  peak = 0; // hardest impact seen, px/s

  constructor(private readonly scale = 1) {}

  add(bs: Bounce[]): void {
    for (const b of bs) {
      const logical = b.speed / this.scale;
      this.peak = Math.max(this.peak, logical);
      if (logical >= ROUGH_BOUNCE_SPEED) this.bounces++;
    }
  }
}

/** Dizzy on landing: two or more real bounces, or one really hard hit. */
export function isRoughLanding(log: FlightLog): boolean {
  return log.bounces >= ROUGH_BOUNCES || log.peak >= ROUGH_IMPACT_SPEED;
}
