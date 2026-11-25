import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FOCUS_OPTIONS, FocusTimer, focusLabel } from './focus';

const MIN = 60_000;
const last = <T>(xs: T[]): T | undefined => xs[xs.length - 1];

function make(now = () => Date.now()) {
  const ticks: number[] = [];
  const saves: ({ endsAt: number; minutes: number } | null)[] = [];
  let done = 0;
  const f = new FocusTimer(
    { onTick: (m) => ticks.push(m), onDone: () => { done++; }, save: (s) => saves.push(s) },
    now,
  );
  return { f, ticks, saves, done: () => done };
}

describe('FocusTimer', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_700_000_000_000); });
  afterEach(() => vi.useRealTimers());

  it('offers 15/25/45/60', () => {
    expect([...FOCUS_OPTIONS]).toEqual([15, 25, 45, 60]);
  });

  it('counts down once a minute and finishes exactly at the end', async () => {
    const { f, ticks, done } = make();
    f.start(25);
    expect(f.active).toBe(true);
    expect(f.minutesLeft()).toBe(25);
    await vi.advanceTimersByTimeAsync(MIN);
    expect(ticks).toEqual([24]);
    await vi.advanceTimersByTimeAsync(23 * MIN);
    expect(last(ticks)).toBe(1);
    expect(done()).toBe(0);
    await vi.advanceTimersByTimeAsync(MIN);
    expect(done()).toBe(1);
    expect(f.active).toBe(false);
    expect(ticks).toHaveLength(24); // 24..1, one per minute: no per-second updates
  });

  it('stores the end timestamp and clears it on stop and on done', async () => {
    const { f, saves } = make();
    f.start(15);
    expect(saves[0]).toEqual({ endsAt: Date.now() + 15 * MIN, minutes: 15 });
    f.stop();
    expect(last(saves)).toBeNull();
    expect(f.active).toBe(false);
    f.start(15);
    await vi.advanceTimersByTimeAsync(15 * MIN);
    expect(last(saves)).toBeNull();
  });

  it('stop never fires onDone', async () => {
    const { f, done } = make();
    f.start(15);
    f.stop();
    await vi.advanceTimersByTimeAsync(20 * MIN);
    expect(done()).toBe(0);
  });

  it('survives machine sleep: late timers still finish from the stored end time', async () => {
    const { f, ticks, done } = make();
    f.start(25);
    vi.setSystemTime(Date.now() + 40 * MIN); // lid closed for 40 min, timers frozen
    await vi.advanceTimersByTimeAsync(MIN); // the pending timer is never more than a minute out
    expect(done()).toBe(1);
    expect(ticks).toEqual([]);
    expect(f.active).toBe(false);
  });

  it('check() (called on unlock / wake) finishes at once instead of waiting for the timer', () => {
    const { f, done } = make();
    f.start(25);
    vi.setSystemTime(Date.now() + 40 * MIN);
    f.check();
    expect(done()).toBe(1);
    expect(f.active).toBe(false);
  });

  it('after a shorter sleep the label jumps to the true time left', async () => {
    const { f, ticks } = make();
    f.start(25);
    vi.setSystemTime(Date.now() + 10 * MIN); // wall clock jumps, the pending timer is still a minute away
    await vi.advanceTimersByTimeAsync(MIN);
    expect(last(ticks)).toBe(14); // 25 - 11 min of real time, not 24
    expect(f.minutesLeft()).toBe(14);
  });

  it('resumes a persisted end time (app restart) and ignores a stale one', async () => {
    const a = make();
    expect(a.f.resume(Date.now() + 7 * MIN + 1000, 25)).toBe(true);
    expect(a.f.minutesLeft()).toBe(8);
    const b = make();
    expect(b.f.resume(Date.now() - 1000, 25)).toBe(false);
    expect(b.f.active).toBe(false);
    expect(last(b.saves)).toBeNull();
  });

  it('restarting replaces the running timer', async () => {
    const { f, done } = make();
    f.start(15);
    await vi.advanceTimersByTimeAsync(5 * MIN);
    f.start(25);
    expect(f.minutesLeft()).toBe(25);
    await vi.advanceTimersByTimeAsync(16 * MIN);
    expect(done()).toBe(0);
  });
});

describe('any length from 1 to 180 minutes (Ask Paperclip can start them)', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_700_000_000_000); });
  afterEach(() => vi.useRealTimers());

  it.each([1, 7, 137, 180])('%d minutes counts down and finishes', async (n) => {
    const { f, ticks, saves, done } = make();
    f.start(n);
    expect(saves[0]).toEqual({ endsAt: Date.now() + n * MIN, minutes: n });
    expect(f.minutesLeft()).toBe(n);
    await vi.advanceTimersByTimeAsync((n - 1) * MIN);
    expect(f.minutesLeft()).toBe(1);
    expect(done()).toBe(0);
    await vi.advanceTimersByTimeAsync(MIN);
    expect(done()).toBe(1);
    expect(ticks).toHaveLength(n - 1);
  });
  it('a long one resumes after a restart', () => {
    const { f } = make();
    expect(f.resume(Date.now() + 137 * MIN, 137)).toBe(true);
    expect(f.minutesLeft()).toBe(137);
    expect(f.totalMinutes).toBe(137);
  });
});

describe('focusLabel', () => {
  it('shows whole minutes, at least 1', () => {
    expect(focusLabel(25)).toBe('25');
    expect(focusLabel(1)).toBe('1');
    expect(focusLabel(0)).toBe('1');
    expect(focusLabel(137)).toBe('137');
  });
});
