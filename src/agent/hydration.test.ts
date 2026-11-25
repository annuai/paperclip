import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HydrationScheduler, ACTIVE_START_HOUR, ACTIVE_END_HOUR, dateKey } from './hydration';
import type { HydrationState } from './hydration';

const MIN = 60_000;
const at = (h: number, m = 0, d = 5) => new Date(2026, 0, d, h, m, 0).getTime();

function make(opts: { state?: Partial<HydrationState>; interval?: 30 | 45 | 60 | 90; results?: ('drank' | 'later')[]; hidden?: boolean; blocked?: boolean; enabled?: boolean } = {}) {
  const reminders: number[] = [];
  const saves: HydrationState[] = [];
  const results = [...(opts.results ?? [])];
  let hidden = opts.hidden ?? false;
  let blocked = opts.blocked ?? false;
  const state: HydrationState = { lastReminderAt: null, glasses: 0, glassesDate: '', ...opts.state };
  const s = new HydrationScheduler({ enabled: opts.enabled ?? true, intervalMin: opts.interval ?? 45 }, state, {
    remind: async () => { reminders.push(Date.now()); return results.shift() ?? 'drank'; },
    isHidden: () => hidden,
    isBlocked: () => blocked,
    save: (st) => saves.push({ ...st }),
  });
  return { s, reminders, saves, state, setHidden: (h: boolean) => (hidden = h), setBlocked: (b: boolean) => (blocked = b) };
}

describe('HydrationScheduler', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(at(9)); });
  afterEach(() => vi.useRealTimers());

  it('uses 8:00-22:00 as active hours', () => {
    expect([ACTIVE_START_HOUR, ACTIVE_END_HOUR]).toEqual([8, 22]);
  });

  it('reminds after the interval (default 45 min), not before', async () => {
    const { s, reminders } = make();
    s.start();
    await vi.advanceTimersByTimeAsync(45 * MIN - 1000);
    expect(reminders).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(reminders).toHaveLength(1);
  });

  for (const n of [30, 60, 90] as const) {
    it(`honours a ${n} minute interval`, async () => {
      const { s, reminders } = make({ interval: n });
      s.start();
      await vi.advanceTimersByTimeAsync(n * MIN - 1000);
      expect(reminders).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(2000);
      expect(reminders).toHaveLength(1);
    });
  }

  it('does not remind outside active hours; reminds at 08:00 next day', async () => {
    vi.setSystemTime(at(21, 30));
    const { s, reminders } = make({ interval: 30 });
    s.start();
    await vi.advanceTimersByTimeAsync(30 * MIN + 1000); // 22:00 = outside
    expect(reminders).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(5 * 60 * MIN); // 03:00
    expect(reminders).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(5 * 60 * MIN + 15 * MIN); // 08:15
    expect(reminders).toHaveLength(1);
    expect(new Date(reminders[0]).getHours()).toBe(8);
  });

  it('skips while hidden and fires shortly after becoming visible', async () => {
    const { s, reminders, setHidden } = make({ hidden: true });
    s.start();
    await vi.advanceTimersByTimeAsync(46 * MIN);
    expect(reminders).toHaveLength(0);
    setHidden(false);
    await vi.advanceTimersByTimeAsync(61_000);
    expect(reminders).toHaveLength(1);
  });

  it('skips while a reminder balloon is already open', async () => {
    const { s, reminders, setBlocked } = make({ blocked: true });
    s.start();
    await vi.advanceTimersByTimeAsync(50 * MIN);
    expect(reminders).toHaveLength(0);
    setBlocked(false);
    await vi.advanceTimersByTimeAsync(61_000);
    expect(reminders).toHaveLength(1);
  });

  it('does nothing when disabled, and re-enabling schedules again', async () => {
    const { s, reminders } = make({ enabled: false });
    s.start();
    await vi.advanceTimersByTimeAsync(3 * 60 * MIN);
    expect(reminders).toHaveLength(0);
    s.setConfig({ enabled: true });
    await vi.advanceTimersByTimeAsync(46 * MIN);
    expect(reminders).toHaveLength(1);
  });

  it('Later snoozes 10 min once, then falls back to the normal interval', async () => {
    const { s, reminders } = make({ results: ['later', 'later', 'drank'] });
    s.start();
    await vi.advanceTimersByTimeAsync(45 * MIN + 1000);
    expect(reminders).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(reminders).toHaveLength(2); // the one snoozed reminder
    await vi.advanceTimersByTimeAsync(20 * MIN); // would be another snooze if it were repeated
    expect(reminders).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(26 * MIN); // 45 min after the second
    expect(reminders).toHaveLength(3);
  });

  it('Drank some counts a glass and waits the normal interval', async () => {
    const { s, reminders } = make({ results: ['drank'] });
    s.start();
    await vi.advanceTimersByTimeAsync(45 * MIN + 1000);
    expect(s.glassesToday).toBe(1);
    await vi.advanceTimersByTimeAsync(44 * MIN);
    expect(reminders).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2 * MIN);
    expect(reminders).toHaveLength(2);
  });

  it('persists the last reminder so a restart neither re-fires nor resets the interval', async () => {
    const a = make();
    a.s.start();
    await vi.advanceTimersByTimeAsync(45 * MIN + 1000); // reminder at 09:45
    const lastSaved = a.saves[a.saves.length - 1];
    expect(lastSaved.lastReminderAt).not.toBeNull();
    a.s.stop();
    // restart 5 minutes later with the persisted state
    await vi.advanceTimersByTimeAsync(5 * MIN);
    const b = make({ state: lastSaved });
    b.s.start();
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(b.reminders).toHaveLength(0); // no instant re-fire
    await vi.advanceTimersByTimeAsync(31 * MIN); // ~45 min after the persisted reminder (not after the restart)
    expect(b.reminders).toHaveLength(1);
  });

  it('first ever start records a baseline instead of firing', async () => {
    const { s, reminders, saves } = make();
    s.start();
    expect(reminders).toHaveLength(0);
    expect(saves.length).toBeGreaterThan(0);
  });

  it('an overdue persisted reminder waits a short grace period after launch', async () => {
    const { s, reminders } = make({ state: { lastReminderAt: at(6) } });
    s.start();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(reminders).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(31_000);
    expect(reminders).toHaveLength(1);
  });

  it("resets today's glass count at local midnight", () => {
    vi.setSystemTime(at(20));
    const { s } = make({ state: { glasses: 3, glassesDate: dateKey(at(20)) } });
    expect(s.glassesToday).toBe(3);
    vi.setSystemTime(at(0, 5, 6));
    expect(s.glassesToday).toBe(0);
  });

  it('remindNow works outside active hours and while hidden', async () => {
    vi.setSystemTime(at(3));
    const { s, reminders } = make({ hidden: true });
    s.start();
    await s.remindNow();
    expect(reminders).toHaveLength(1);
  });

  describe('logGlass (a glass logged outside a reminder)', () => {
    it('counts today, restarts the interval, saves and notifies', async () => {
      const { s, saves, reminders } = make({ state: { lastReminderAt: at(8, 30), glasses: 2, glassesDate: dateKey(at(9)) } });
      let changed = 0;
      s.onChange(() => changed++);
      s.start();
      expect(s.logGlass()).toBe(3);
      expect(s.glassesToday).toBe(3);
      expect(changed).toBe(1);
      expect(saves[saves.length - 1]).toMatchObject({ glasses: 3, lastReminderAt: at(9) });
      await vi.advanceTimersByTimeAsync(44 * MIN); // the interval counts from the logged glass, not the old reminder
      expect(reminders).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(2 * MIN);
      expect(reminders).toHaveLength(1);
    });
    it('starts a new count on a new day, and clears a pending snooze', () => {
      const { s } = make({ state: { lastReminderAt: at(8), glasses: 5, glassesDate: dateKey(at(9, 0, 4)) } });
      expect(s.glassesToday).toBe(0);
      expect(s.logGlass()).toBe(1);
      expect(s.snapshot.glassesDate).toBe(dateKey(at(9)));
    });
    it('works while reminders are off', () => {
      const { s } = make({ enabled: false });
      expect(s.logGlass()).toBe(1);
    });
  });
});
