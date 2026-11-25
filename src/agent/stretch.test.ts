import { describe, expect, it } from 'vitest';
import { ANIMATIONS } from '../anim/animations';
import {
  DEFAULT_STRETCH_MIN, GUIDED_STEPS, SNOOZE_MIN, StretchBreaks, STRETCH_OPTIONS, guidedDurationMs,
} from './stretch';
import type { StretchCtx } from './stretch';

const MIN = 60_000;
const T0 = 1_700_000_000_000;
const ok = (now: number, over: Partial<StretchCtx> = {}): StretchCtx => ({
  now, hidden: false, quiet: false, focus: false, presenting: false, reminder: false, busy: false, ...over,
});

/** Feeds one active sample per minute starting at T0; returns the time of the last sample. */
function work(s: StretchBreaks, minutes: number, idle = 5, from = T0): number {
  let t = from;
  for (let i = 0; i <= minutes; i++) { s.sample(idle, t); t += MIN; }
  return t - MIN;
}

describe('StretchBreaks', () => {
  it('offers 30/45/60/90 and defaults to 60', () => {
    expect([...STRETCH_OPTIONS]).toEqual([30, 45, 60, 90]);
    expect(DEFAULT_STRETCH_MIN).toBe(60);
  });

  it('is due after N active minutes, not before', () => {
    const s = new StretchBreaks({ enabled: true, everyMin: 30 });
    const t = work(s, 29);
    expect(s.activeMinutes).toBe(29);
    expect(s.due(ok(t))).toBe(false);
    s.sample(5, t + MIN);
    expect(s.activeMinutes).toBe(30);
    expect(s.due(ok(t + MIN))).toBe(true);
  });

  it('a minute only counts while idleSecs < 60', () => {
    const s = new StretchBreaks({ enabled: true, everyMin: 30 });
    s.sample(0, T0);
    s.sample(59, T0 + MIN); // active
    s.sample(60, T0 + 2 * MIN); // away: not counted
    s.sample(120, T0 + 3 * MIN); // away: not counted
    expect(s.activeMinutes).toBe(1);
  });

  it('a pause of 5 min or more (idleSecs >= 300) resets the count; shorter pauses do not', () => {
    const s = new StretchBreaks({ enabled: true, everyMin: 30 });
    const t = work(s, 10);
    s.sample(299, t + MIN); // 4m59s away: still the same session
    expect(s.activeMinutes).toBe(10);
    s.sample(300, t + 2 * MIN);
    expect(s.activeMinutes).toBe(0);
    s.sample(2, t + 3 * MIN); // back at the desk: the minute they returned counts
    s.sample(2, t + 4 * MIN);
    expect(s.activeMinutes).toBe(2);
  });

  it('does not credit a long gap between samples (machine sleep, frozen timers)', () => {
    const s = new StretchBreaks({ enabled: true, everyMin: 30 });
    s.sample(5, T0);
    s.sample(5, T0 + MIN);
    s.sample(5, T0 + 3 * 60 * MIN); // woke up three hours later
    expect(s.activeMinutes).toBe(1);
  });

  it('never fires when disabled, and enabling starts from zero', () => {
    const s = new StretchBreaks({ enabled: false, everyMin: 30 });
    const t = work(s, 40);
    expect(s.due(ok(t))).toBe(false);
    s.setConfig({ enabled: true });
    expect(s.activeMinutes).toBe(0);
  });

  it('stays due (deferred) while focus, presenting, quiet, hidden, a water reminder or another balloon blocks it', () => {
    const s = new StretchBreaks({ enabled: true, everyMin: 30 });
    const t = work(s, 31);
    for (const block of [{ focus: true }, { presenting: true }, { quiet: true }, { hidden: true }, { reminder: true }, { busy: true }]) {
      expect(s.due(ok(t, block)), JSON.stringify(block)).toBe(false);
    }
    expect(s.due(ok(t))).toBe(true); // nothing was consumed
  });

  it('"Stretch with me" restarts the count', () => {
    const s = new StretchBreaks({ enabled: true, everyMin: 30 });
    const t = work(s, 31);
    s.completed();
    expect(s.activeMinutes).toBe(0);
    expect(s.due(ok(t))).toBe(false);
  });

  it('"Later" snoozes for 15 min, then it is due again without recounting', () => {
    expect(SNOOZE_MIN).toBe(15);
    const s = new StretchBreaks({ enabled: true, everyMin: 30 });
    const t = work(s, 31);
    s.later(t);
    expect(s.due(ok(t + 14 * MIN))).toBe(false);
    expect(s.due(ok(t + 15 * MIN))).toBe(true);
  });

  it('a real break (5+ min away) cancels a pending snooze too', () => {
    const s = new StretchBreaks({ enabled: true, everyMin: 30 });
    const t = work(s, 31);
    s.later(t);
    s.sample(400, t + MIN);
    work(s, 31, 5, t + 2 * MIN);
    expect(s.due(ok(t + 40 * MIN))).toBe(true);
  });
});

describe('guided stretch', () => {
  it('runs about 30 s and every pose is a real animation that returns to neutral', () => {
    const total = guidedDurationMs();
    expect(total).toBeGreaterThanOrEqual(25_000);
    expect(total).toBeLessThanOrEqual(36_000);
    for (const st of GUIDED_STEPS) {
      expect(ANIMATIONS[st.anim], st.anim).toBeDefined();
      expect(st.line.length).toBeLessThanOrEqual(80);
    }
  });
  it('lines follow the "reach up... and side..." pattern', () => {
    expect(GUIDED_STEPS[0].line.toLowerCase()).toContain('reach');
    expect(GUIDED_STEPS.some((s) => /side/i.test(s.line))).toBe(true);
  });
});
