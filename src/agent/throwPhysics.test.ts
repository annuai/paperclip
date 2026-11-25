import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PHYSICS, FlightLog, THROW_MIN_SPEED, VelocityTracker, boundsFor, isRoughLanding, scaleConfig, step,
} from './throwPhysics';
import type { Body, Bounds } from './throwPhysics';

const B: Bounds = { minX: 0, minY: 0, maxX: 1000, maxY: 600 };
const run = (b: Body, bounds: Bounds, seconds: number, dt = 1 / 60) => {
  const log = new FlightLog();
  let cur = b;
  let resting = false;
  for (let t = 0; t < seconds && !resting; t += dt) {
    const r = step(cur, bounds, dt, DEFAULT_PHYSICS);
    cur = r.body;
    resting = r.resting;
    log.add(r.bounces);
  }
  return { body: cur, resting, log };
};

describe('step', () => {
  it('falls under gravity and lands on the floor (bottom of the work area)', () => {
    const { body, resting } = run({ x: 500, y: 0, vx: 0, vy: 0 }, B, 6);
    expect(body.y).toBe(B.maxY);
    expect(resting).toBe(true);
    expect(body.vx).toBe(0);
    expect(body.vy).toBe(0);
  });

  it('bounces off the floor with restitution 0.55', () => {
    const r = step({ x: 100, y: 599.5, vx: 0, vy: 1000 }, B, 1 / 240, DEFAULT_PHYSICS); // one internal sub-step
    expect(r.bounces).toHaveLength(1);
    expect(r.bounces[0].surface).toBe('floor');
    // gravity is added before the impact: the bounce leaves at 0.55 of the impact speed
    expect(r.body.vy).toBeLessThan(0);
    expect(-r.body.vy / r.bounces[0].speed).toBeCloseTo(0.55, 5);
    expect(r.body.y).toBe(B.maxY);
  });

  it('bounces off the side walls and keeps the window inside the bounds', () => {
    const r = step({ x: 995, y: 300, vx: 2000, vy: 0 }, B, 1 / 240, DEFAULT_PHYSICS);
    expect(r.bounces.map((b) => b.surface)).toEqual(['right']);
    expect(r.body.x).toBe(B.maxX);
    expect(r.body.vx).toBeLessThan(0);
    const l = step({ x: 4, y: 300, vx: -2000, vy: 0 }, B, 1 / 240, DEFAULT_PHYSICS);
    expect(l.bounces.map((b) => b.surface)).toEqual(['left']);
    expect(l.body.x).toBe(B.minX);
  });

  it('bounces off the ceiling', () => {
    const r = step({ x: 300, y: 5, vx: 0, vy: -2500 }, B, 1 / 240, DEFAULT_PHYSICS);
    expect(r.bounces.map((b) => b.surface)).toEqual(['ceiling']);
    expect(r.body.y).toBe(B.minY);
    expect(r.body.vy).toBeGreaterThan(0);
  });

  it('never leaves the bounds, even with absurd speeds and a long frame', () => {
    const r = step({ x: 500, y: 300, vx: 90000, vy: -90000 }, B, 0.5, DEFAULT_PHYSICS);
    expect(r.body.x).toBeGreaterThanOrEqual(B.minX);
    expect(r.body.x).toBeLessThanOrEqual(B.maxX);
    expect(r.body.y).toBeGreaterThanOrEqual(B.minY);
    expect(r.body.y).toBeLessThanOrEqual(B.maxY);
  });

  it('slides along the floor with friction and then stops (rest needs low speed AND the floor)', () => {
    const { body, resting } = run({ x: 100, y: 600, vx: 900, vy: 0 }, B, 10);
    expect(resting).toBe(true);
    expect(body.x).toBeGreaterThan(100);
    expect(body.x).toBeLessThan(B.maxX);
    expect(body.y).toBe(B.maxY);
  });

  it('does not rest in mid-air at the apex of a throw', () => {
    const r = step({ x: 500, y: 300, vx: 0, vy: -30 }, B, 1 / 60, DEFAULT_PHYSICS);
    expect(r.resting).toBe(false);
  });

  it('a thrown body always comes to rest within a few seconds', () => {
    for (const [vx, vy] of [[3000, -2000], [-2500, 800], [0, -3200], [1500, 1500]]) {
      const { resting } = run({ x: 500, y: 300, vx, vy }, B, 15);
      expect(resting, `${vx},${vy}`).toBe(true);
    }
  });

  it('is stable at different frame rates (30 / 60 / 144 fps land in the same place within a few px)', () => {
    const land = (dt: number) => run({ x: 100, y: 100, vx: 700, vy: 0 }, B, 15, dt).body;
    const a = land(1 / 30);
    const b = land(1 / 144);
    expect(Math.abs(a.x - b.x)).toBeLessThan(60);
  });

  it('a degenerate area (smaller than the window) pins the body instead of producing NaN', () => {
    const tiny: Bounds = { minX: 10, minY: 10, maxX: 5, maxY: 5 };
    const r = step({ x: 7, y: 7, vx: 100, vy: 100 }, tiny, 1 / 60, DEFAULT_PHYSICS);
    expect(Number.isFinite(r.body.x) && Number.isFinite(r.body.y)).toBe(true);
  });
});

describe('scaleConfig', () => {
  it('scales length-based constants with the display scale factor, not the unitless ones', () => {
    const c = scaleConfig(DEFAULT_PHYSICS, 2);
    expect(c.gravity).toBe(DEFAULT_PHYSICS.gravity * 2);
    expect(c.restSpeed).toBe(DEFAULT_PHYSICS.restSpeed * 2);
    expect(c.restitution).toBe(0.55);
    expect(c.floorFriction).toBe(DEFAULT_PHYSICS.floorFriction);
  });
});

describe('boundsFor', () => {
  it('lets the window overhang the work area by its transparent margins, so the character touches the edges', () => {
    const b = boundsFor({ x: 100, y: 50, w: 1920, h: 1000 }, { w: 320, h: 380 }, { left: 112, right: 20, top: 130, bottom: 12 });
    expect(b.minX).toBe(100 - 112);
    expect(b.maxX).toBe(100 + 1920 - (320 - 20));
    expect(b.minY).toBe(50 - 130);
    expect(b.maxY).toBe(50 + 1000 - (380 - 12));
  });
});

describe('VelocityTracker', () => {
  it('measures the release velocity over the last 80 ms of moves', () => {
    const v = new VelocityTracker();
    v.push(0, 0, 0); // older than the window: ignored
    v.push(10, 0, 100);
    v.push(30, 0, 120);
    v.push(70, 0, 140);
    v.push(130, 0, 160);
    const r = v.release(165);
    expect(r).not.toBeNull();
    // window = [80, 160]: from (10 @100) to (130 @160) = 120 px in 60 ms = 2000 px/s
    expect(r!.vx).toBeCloseTo(2000, 0);
    expect(r!.vy).toBe(0);
    expect(r!.speed).toBeCloseTo(2000, 0);
  });

  it('a slow drag release has a low speed (below the throw threshold)', () => {
    const v = new VelocityTracker();
    for (let i = 0; i < 20; i++) v.push(i * 3, i * 2, i * 16); // ~225 px/s
    const r = v.release(20 * 16);
    expect(r!.speed).toBeLessThan(THROW_MIN_SPEED);
  });

  it('a pause before the release means he was held still: no throw velocity', () => {
    const v = new VelocityTracker();
    v.push(0, 0, 0);
    v.push(200, 0, 40);
    v.push(400, 0, 80);
    expect(v.release(80 + 400)).toBeNull(); // 400 ms of silence since the last move
  });

  it('a hard stop right before the release is not a throw (tail much slower than the window)', () => {
    const v = new VelocityTracker();
    v.push(0, 0, 0);
    v.push(100, 0, 20);
    v.push(200, 0, 40);
    v.push(201, 0, 60);
    v.push(202, 0, 80);
    const r = v.release(85);
    expect(r === null || r.speed < THROW_MIN_SPEED).toBe(true);
  });

  it('needs at least two samples and ignores a single jump', () => {
    const v = new VelocityTracker();
    expect(v.release(0)).toBeNull();
    v.push(5, 5, 10);
    expect(v.release(20)).toBeNull();
  });

  it('reset clears everything', () => {
    const v = new VelocityTracker();
    v.push(0, 0, 0);
    v.push(500, 0, 30);
    v.reset();
    expect(v.release(40)).toBeNull();
  });

  it('keeps only a bounded history', () => {
    const v = new VelocityTracker();
    for (let i = 0; i < 5000; i++) v.push(i, 0, i);
    expect(v.size).toBeLessThan(200);
  });
});

describe('landing', () => {
  it('two real bounces make a rough landing; a gentle one does not', () => {
    const rough = new FlightLog();
    rough.add([{ surface: 'floor', speed: 900 }]);
    rough.add([{ surface: 'left', speed: 500 }]);
    expect(isRoughLanding(rough)).toBe(true);
    const gentle = new FlightLog();
    gentle.add([{ surface: 'floor', speed: 700 }]);
    gentle.add([{ surface: 'floor', speed: 120 }]); // a tiny settle bounce does not count
    expect(isRoughLanding(gentle)).toBe(false);
  });

  it('one very hard impact is rough on its own', () => {
    const log = new FlightLog();
    log.add([{ surface: 'floor', speed: 2600 }]);
    expect(isRoughLanding(log)).toBe(true);
  });
});
