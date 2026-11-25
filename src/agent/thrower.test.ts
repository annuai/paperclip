import { describe, expect, it } from 'vitest';
import { Thrower } from './thrower';
import type { ThrowDeps, ThrowLanding } from './thrower';
import type { Bounds } from './throwPhysics';

const BOUNDS: Bounds = { minX: 0, minY: 0, maxX: 2000, maxY: 800 };

function harness(over: Partial<ThrowDeps> = {}) {
  let clock = 0;
  let cb: ((t: number) => void) | null = null;
  const sets: { x: number; y: number }[] = [];
  const bounces: string[] = [];
  const lands: ThrowLanding[] = [];
  let launched = 0;
  const deps: ThrowDeps = {
    dpr: () => 1,
    locate: async () => ({ bounds: BOUNDS, scale: 1 }),
    setPosition: async (x, y) => { sets.push({ x, y }); },
    raf: (f) => { cb = f; return 1; },
    caf: () => { cb = null; },
    onLaunch: () => { launched++; },
    onBounce: (surface) => { bounces.push(surface); },
    onLand: (l) => { lands.push(l); },
    ...over,
  };
  const t = new Thrower(deps);
  /** Advances frames until the flight ends (or `max` frames). */
  const fly = async (max = 3000) => {
    let n = 0;
    for (;;) {
      for (let i = 0; i < 4; i++) await Promise.resolve(); // let the setPosition promise settle and queue the next frame
      if (!cb || n++ >= max) break;
      const f = cb;
      cb = null;
      clock += 16;
      f(clock);
    }
    return n;
  };
  return { t, sets, bounces, lands, fly, get launched() { return launched; }, get pending() { return cb !== null; }, tick: () => { clock += 16; return clock; } };
}
const flick = (t: Thrower, vx: number, vy: number, x0 = 500, y0 = 300) => {
  t.beginDrag();
  for (let i = 0; i <= 5; i++) t.move(x0 + (vx * i * 0.016), y0 + (vy * i * 0.016), 1000 + i * 16);
  return { at: 1000 + 5 * 16 + 70, pos: { x: x0 + vx * 5 * 0.016, y: y0 + vy * 5 * 0.016 } };
};

describe('Thrower', () => {
  it('a fast flick launches him, he bounces and lands, and the window follows via setPosition', async () => {
    const h = harness();
    const { at } = flick(h.t, 2200, -900);
    expect(await h.t.release(at)).toBe(true);
    expect(h.launched).toBe(1);
    expect(h.t.flying).toBe(true);
    await h.fly();
    expect(h.t.flying).toBe(false);
    expect(h.sets.length).toBeGreaterThan(5);
    expect(h.bounces.length).toBeGreaterThan(0);
    expect(h.lands).toHaveLength(1);
    const last = h.sets[h.sets.length - 1];
    expect(last.y).toBe(BOUNDS.maxY); // on the floor
    expect(h.lands[0]).toMatchObject({ x: last.x, y: last.y });
  });

  it('a slow release does nothing at all (exactly the old behaviour)', async () => {
    const h = harness();
    const { at } = flick(h.t, 300, 100);
    expect(await h.t.release(at)).toBe(false);
    expect(h.launched).toBe(0);
    expect(h.pending).toBe(false);
    expect(h.sets).toHaveLength(0);
    expect(h.lands).toHaveLength(0);
  });

  it('holding still before the release is not a throw', async () => {
    const h = harness();
    const { at } = flick(h.t, 3000, 0);
    expect(await h.t.release(at + 500)).toBe(false);
  });

  it('ignores moves that are not part of a drag (restorePosition, tray moves)', async () => {
    const h = harness();
    for (let i = 0; i < 6; i++) h.t.move(i * 80, 0, 1000 + i * 16);
    expect(await h.t.release(1100)).toBe(false);
  });

  it('ignores its own setPosition echoes while flying, and grabbing him mid-flight cancels the flight', async () => {
    const h = harness();
    const { at } = flick(h.t, 2200, -900);
    await h.t.release(at);
    h.t.move(1, 1, at + 10); // an onMoved echo of our own setPosition
    expect(h.t.flying).toBe(true);
    h.t.beginDrag();
    expect(h.t.flying).toBe(false);
    expect(h.pending).toBe(false);
    expect(h.lands).toHaveLength(0); // cancelled, not landed
  });

  it('a second drag that starts while the monitor lookup is pending wins', async () => {
    let resolve: (v: { bounds: Bounds; scale: number }) => void = () => undefined;
    const h = harness({ locate: () => new Promise((r) => { resolve = r; }) });
    const { at } = flick(h.t, 2200, 0);
    const p = h.t.release(at);
    h.t.beginDrag();
    resolve({ bounds: BOUNDS, scale: 1 });
    expect(await p).toBe(false);
    expect(h.t.flying).toBe(false);
  });

  it('uses the scale factor: a high-dpi release needs the same logical speed', async () => {
    const h = harness({ dpr: () => 2, locate: async () => ({ bounds: BOUNDS, scale: 2 }) });
    // 1400 physical px/s = 700 logical px/s: below the threshold
    expect(await h.t.release(flick(h.t, 1400, 0).at)).toBe(false);
    // 2000 physical px/s = 1000 logical px/s: a throw
    expect(await h.t.release(flick(h.t, 2000, 0).at)).toBe(true);
  });

  it('a rough landing is reported', async () => {
    const h = harness();
    const { at } = flick(h.t, 3000, -1500, 100, 700);
    await h.t.release(at);
    await h.fly();
    expect(h.lands[0].rough).toBe(true);
  });

  it('a gentle lob that just plops onto the floor is not rough', async () => {
    const h = harness();
    const { at } = flick(h.t, 900, 0, 100, 790); // already at the floor, slides to a stop
    await h.t.release(at);
    await h.fly();
    expect(h.lands[0].rough).toBe(false);
  });

  it('a failed setPosition ends the flight instead of looping forever', async () => {
    const h = harness({ setPosition: async () => { throw new Error('no window'); } });
    const { at } = flick(h.t, 2200, 0);
    await h.t.release(at);
    await h.fly(50);
    expect(h.t.flying).toBe(false);
  });
});
