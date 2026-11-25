import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WelcomeBack, WelcomeLines, awayGroup, isMorning } from './welcomeBack';
import type { AwayGroup, WelcomeDeps } from './welcomeBack';
import welcome from '../content/welcome.json';
import { mulberry32 } from '../util/rng';

const at = (h: number, m = 0) => new Date(2026, 0, 5, h, m, 0).getTime();

function make(over: Partial<{ enabled: boolean; hidden: boolean; asleep: boolean; quiet: boolean; reminder: Promise<void> }> = {}) {
  const log: string[] = [];
  const state = { enabled: true, hidden: false, asleep: false, quiet: false, reminder: Promise.resolve() as Promise<void>, ...over };
  const lines = { pick: vi.fn((g: AwayGroup | 'morning') => `line:${g}`) };
  const deps: WelcomeDeps = {
    enabled: () => state.enabled,
    isHidden: () => state.hidden,
    isAsleep: () => state.asleep,
    isQuiet: () => state.quiet,
    waitForReminder: () => state.reminder,
    wake: async () => { log.push('wake'); state.asleep = false; },
    endFollow: () => log.push('endFollow'),
    interrupt: () => log.push('interrupt'),
    wave: async () => { log.push('wave'); },
    speak: async (t) => { log.push('speak:' + t); },
  };
  const w = new WelcomeBack(deps, lines, () => Date.now());
  return { w, log, state, lines };
}

describe('awayGroup / isMorning', () => {
  it('groups away time: short < 10 min, medium 10 min to 2 h, long beyond or unknown', () => {
    expect(awayGroup(0)).toBe('short');
    expect(awayGroup(9 * 60 + 59)).toBe('short');
    expect(awayGroup(10 * 60)).toBe('medium');
    expect(awayGroup(2 * 3600)).toBe('medium');
    expect(awayGroup(2 * 3600 + 1)).toBe('long');
    expect(awayGroup(null)).toBe('long');
  });
  it('morning is 05:00-11:00', () => {
    expect(isMorning(new Date(2026, 0, 5, 4, 59))).toBe(false);
    expect(isMorning(new Date(2026, 0, 5, 5, 0))).toBe(true);
    expect(isMorning(new Date(2026, 0, 5, 10, 59))).toBe(true);
    expect(isMorning(new Date(2026, 0, 5, 11, 0))).toBe(false);
  });
});

describe('WelcomeLines', () => {
  it('has ~20 original lines across short/medium/long/morning, all short enough', () => {
    expect(welcome.length).toBeGreaterThanOrEqual(20);
    for (const g of ['short', 'medium', 'long', 'morning']) expect(welcome.filter((x) => x.group === g).length).toBeGreaterThanOrEqual(3);
    expect(welcome.every((x) => x.text.length > 0 && x.text.length <= 100)).toBe(true);
    expect(new Set(welcome.map((x) => x.text)).size).toBe(welcome.length);
  });
  it('never repeats back-to-back within a group', () => {
    const l = new WelcomeLines(mulberry32(3));
    let prev = l.pick('short');
    for (let i = 0; i < 100; i++) {
      const v = l.pick('short');
      expect(v).not.toBe(prev);
      prev = v;
    }
  });
  it('returns lines belonging to the requested group', () => {
    const l = new WelcomeLines(mulberry32(1));
    for (const g of ['short', 'medium', 'long', 'morning'] as const) {
      const text = l.pick(g);
      expect(welcome.find((x) => x.text === text)?.group).toBe(g);
    }
  });
});

describe('WelcomeBack', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(at(14)); });
  afterEach(() => vi.useRealTimers());

  it('greets: ends eye-follow, interrupts idle animations, waves and speaks a line for the away time', async () => {
    const { w, log, lines } = make();
    expect(await w.onUnlock(5 * 60)).toBe('greeted');
    expect(log).toEqual(['endFollow', 'interrupt', 'wave', 'speak:line:short']);
    await w.onUnlock(null);
    expect(lines.pick).not.toHaveBeenCalledWith('morning');
  });
  it('uses the medium and long groups', async () => {
    const a = make();
    await a.w.onUnlock(30 * 60);
    expect(a.lines.pick).toHaveBeenCalledWith('medium');
    const b = make();
    await b.w.onUnlock(5 * 3600);
    expect(b.lines.pick).toHaveBeenCalledWith('long');
  });
  it('first unlock of the morning (05:00-11:00) gets the morning variant, later ones do not', async () => {
    vi.setSystemTime(at(8));
    const { w, lines } = make();
    await w.onUnlock(8 * 3600);
    expect(lines.pick).toHaveBeenLastCalledWith('morning');
    vi.setSystemTime(at(8, 30));
    await w.onUnlock(20 * 60);
    expect(lines.pick).toHaveBeenLastCalledWith('medium');
  });
  it('cooldown: at most one greeting per 2 minutes', async () => {
    const { w, log } = make();
    expect(await w.onUnlock(30)).toBe('greeted');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await w.onUnlock(30)).toBe('skipped');
    await vi.advanceTimersByTimeAsync(61_000);
    expect(await w.onUnlock(30)).toBe('greeted');
    expect(log.filter((l) => l === 'wave')).toHaveLength(2);
  });
  it('quiet mode still waves but shows no speech balloon', async () => {
    const { w, log } = make({ quiet: true });
    expect(await w.onUnlock(30 * 60)).toBe('waved');
    expect(log).toContain('wave');
    expect(log.some((l) => l.startsWith('speak'))).toBe(false);
  });
  it('does nothing when hidden by the user', async () => {
    const { w, log } = make({ hidden: true });
    expect(await w.onUnlock(600)).toBe('skipped');
    expect(log).toEqual([]);
  });
  it('does nothing when the setting is off', async () => {
    const { w, log } = make({ enabled: false });
    expect(await w.onUnlock(600)).toBe('skipped');
    expect(log).toEqual([]);
  });
  it('asleep: wakes him first (no sleep line), then greets', async () => {
    const { w, log } = make({ asleep: true });
    expect(await w.onUnlock(3 * 3600)).toBe('greeted');
    expect(log.slice(0, 3)).toEqual(['wake', 'endFollow', 'interrupt']);
    expect(log.indexOf('wake')).toBeLessThan(log.indexOf('wave'));
  });
  it('queues behind an open hydration reminder instead of interrupting it', async () => {
    let release!: () => void;
    const reminder = new Promise<void>((r) => (release = r));
    const { w, log } = make({ reminder });
    const p = w.onUnlock(600);
    await vi.advanceTimersByTimeAsync(1000);
    expect(log).toEqual([]); // nothing yet: the reminder is still open
    release();
    expect(await p).toBe('greeted');
    expect(log).toContain('wave');
  });
});
