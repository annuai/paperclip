import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EyeFollow, EyeTracker, characterClick, computeTarget, pupilOffset } from './eyeFollow';

const EYE = { x: 100, y: 100 };

describe('pupilOffset', () => {
  it('points toward the cursor in each direction', () => {
    expect(pupilOffset(EYE, { x: 0, y: 100 }).x).toBeLessThan(-0.5);
    expect(pupilOffset(EYE, { x: 300, y: 100 }).x).toBeGreaterThan(0.5);
    expect(pupilOffset(EYE, { x: 100, y: 0 }).y).toBeLessThan(-0.5);
    expect(pupilOffset(EYE, { x: 100, y: 300 }).y).toBeGreaterThan(0.5);
    expect(Math.abs(pupilOffset(EYE, { x: 0, y: 100 }).y)).toBeLessThan(1e-9);
  });
  it('gives small offsets when the cursor is right on top of him', () => {
    const o = pupilOffset(EYE, { x: 105, y: 100 });
    expect(Math.hypot(o.x, o.y)).toBeLessThan(0.08);
    expect(pupilOffset(EYE, EYE)).toEqual({ x: 0, y: 0 });
  });
  it('falls off with distance and saturates far away', () => {
    const near = Math.hypot(...Object.values(pupilOffset(EYE, { x: 140, y: 100 })));
    const mid = Math.hypot(...Object.values(pupilOffset(EYE, { x: 180, y: 100 })));
    const far = pupilOffset(EYE, { x: 5000, y: 100 });
    expect(near).toBeLessThan(mid);
    expect(far.x).toBeCloseTo(1, 5);
  });
  it('is clamped to the unit disc (pupil range -1..1) for any cursor', () => {
    for (const c of [{ x: -1e6, y: 1e6 }, { x: 1e5, y: 1e5 }, { x: 1, y: 2 }]) {
      const o = pupilOffset(EYE, c);
      expect(Math.hypot(o.x, o.y)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});

describe('computeTarget', () => {
  const eyes = { l: { x: 90, y: 100 }, r: { x: 120, y: 98 } };
  it('tracks left/right/up/down', () => {
    expect(computeTarget(eyes, { x: -500, y: 100 }, false).px).toBeLessThan(-0.8);
    expect(computeTarget(eyes, { x: 700, y: 100 }, false).px).toBeGreaterThan(0.8);
    expect(computeTarget(eyes, { x: 100, y: -500 }, false).py).toBeLessThan(-0.8);
    expect(computeTarget(eyes, { x: 100, y: 700 }, false).py).toBeGreaterThan(0.8);
  });
  it('converges the eyes when the cursor is very close and centred, not when far away', () => {
    expect(computeTarget(eyes, { x: 105, y: 160 }, false).conv).toBeGreaterThan(0.1);
    expect(computeTarget(eyes, { x: 4000, y: 100 }, false).conv).toBeLessThan(0.02);
  });
  it('adds a subtle body tilt, which reduced motion removes', () => {
    const t = computeTarget(eyes, { x: 900, y: 100 }, false);
    expect(t.tilt).toBeGreaterThan(0);
    expect(t.tilt).toBeLessThanOrEqual(3);
    expect(computeTarget(eyes, { x: 900, y: 100 }, true).tilt).toBe(0);
    expect(computeTarget(eyes, { x: 900, y: 100 }, true).px).toBeGreaterThan(0.8); // pupils still track
  });
});

describe('EyeTracker', () => {
  it('eases toward the target and back to centre within ~200 ms', () => {
    const t = new EyeTracker();
    const target = { px: 1, py: 0, conv: 0, tilt: 2, ex: 1, ey: 0 };
    for (let i = 0; i < 30; i++) t.update(target, 16);
    expect(t.values.px).toBeGreaterThan(0.95);
    let ms = 0;
    while (!t.settled && ms < 1000) { t.decay(16); ms += 16; }
    expect(t.settled).toBe(true);
    expect(ms).toBeLessThanOrEqual(260);
  });
});

describe('EyeFollow state machine', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  function make(canStart = true) {
    const log: string[] = [];
    let can = canStart;
    const f = new EyeFollow({ canStart: () => can, onStart: () => log.push('start'), onEnd: (r) => log.push('end:' + r) });
    return { f, log, setCan: (v: boolean) => (can = v) };
  }
  it('a click starts follow; a second click ends it', () => {
    const { f, log } = make();
    f.click();
    expect(f.active).toBe(true);
    f.click();
    expect(f.active).toBe(false);
    expect(log).toEqual(['start', 'end:click']);
  });
  it('a drag (or any other interruption) ends it; ending twice is harmless', () => {
    const { f, log } = make();
    f.click();
    f.end('drag');
    f.end('drag');
    expect(log).toEqual(['start', 'end:drag']);
  });
  it('ends after 8 s without cursor movement; movement keeps it alive', () => {
    const { f, log } = make();
    f.click();
    vi.advanceTimersByTime(7000);
    f.cursorMoved();
    vi.advanceTimersByTime(7000);
    expect(f.active).toBe(true);
    vi.advanceTimersByTime(1100);
    expect(f.active).toBe(false);
    expect(log).toEqual(['start', 'end:idle']);
  });
  it('cannot start while asleep (or hidden)', () => {
    const { f, log } = make(false);
    expect(f.click()).toBe(false);
    expect(f.active).toBe(false);
    expect(log).toEqual([]);
  });
});

describe('characterClick (single click on the clip)', () => {
  it('while asleep: wakes him and does not start following', () => {
    const calls: string[] = [];
    const f = new EyeFollow({ canStart: () => false, onStart: () => calls.push('start'), onEnd: () => undefined });
    characterClick({ sleeping: true, follow: f, wake: () => calls.push('wake'), activity: () => calls.push('activity') });
    expect(calls).toEqual(['wake']);
  });
  it('awake: toggles follow and never triggers a random reaction animation', () => {
    const calls: string[] = [];
    const f = new EyeFollow({ canStart: () => true, onStart: () => calls.push('start'), onEnd: (r) => calls.push('end:' + r) });
    characterClick({ sleeping: false, follow: f, wake: () => calls.push('wake'), activity: () => calls.push('activity') });
    characterClick({ sleeping: false, follow: f, wake: () => calls.push('wake'), activity: () => calls.push('activity') });
    expect(calls).toEqual(['activity', 'start', 'activity', 'end:click']);
  });
  it('main.ts no longer has the old random single-click reaction', () => {
    const src = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
    expect(src).not.toContain('CLICK_REACTIONS');
    expect(src).not.toContain('QUIPS');
  });
});
