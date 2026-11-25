import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SCHEDULER, IdleScheduler } from './scheduler';
import { DEFAULT_SLEEP, SleepController } from './sleep';
import type { WakeReason } from './sleep';
import { mulberry32 } from '../util/rng';

function make(cfg = {}, rng = mulberry32(5)) {
  const log: string[] = [];
  let busy = false;
  const sleep = new SleepController({ ...DEFAULT_SLEEP, ...cfg }, {
    fallAsleep: async () => { log.push('fall'); await new Promise((r) => setTimeout(r, 100)); },
    wake: async (r: WakeReason) => { log.push('wake:' + r); await new Promise((r2) => setTimeout(r2, 100)); },
    isBusy: () => busy,
  }, rng);
  return { sleep, log, setBusy: (b: boolean) => (busy = b) };
}

describe('SleepController', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('naps after 4-8 minutes of inactivity', async () => {
    const { sleep, log } = make();
    sleep.start();
    await vi.advanceTimersByTimeAsync(4 * 60_000 - 1000);
    expect(sleep.state).toBe('awake');
    await vi.advanceTimersByTimeAsync(4 * 60_000 + 1000);
    expect(log).toEqual(['fall']);
    expect(sleep.state).toBe('asleep');
  });

  it('user activity postpones the nap', async () => {
    const { sleep, log } = make({ inactivityMinMs: 100_000, inactivityMaxMs: 100_000 });
    sleep.start();
    await vi.advanceTimersByTimeAsync(90_000);
    sleep.notifyActivity();
    await vi.advanceTimersByTimeAsync(90_000);
    expect(log).toEqual([]);
    await vi.advanceTimersByTimeAsync(11_000);
    expect(log).toEqual(['fall']);
  });

  it('does not nap while busy; retries', async () => {
    const { sleep, log, setBusy } = make({ inactivityMinMs: 1000, inactivityMaxMs: 1000 });
    setBusy(true);
    sleep.start();
    await vi.advanceTimersByTimeAsync(5000);
    expect(log).toEqual([]);
    setBusy(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(log).toEqual(['fall']);
  });

  it('idle choice can become a nap (chance configurable)', async () => {
    const never = make({ idleChance: 0 });
    never.sleep.start();
    expect(never.sleep.maybeIdleSleep()).toBe(false);
    const always = make({ idleChance: 1 });
    always.sleep.start();
    expect(always.sleep.maybeIdleSleep()).toBe(true);
    await vi.advanceTimersByTimeAsync(200);
    expect(always.sleep.asleep).toBe(true);
  });

  it('no scheduled animations or utterances while asleep', async () => {
    const { sleep } = make({ inactivityMinMs: 1000, inactivityMaxMs: 1000 });
    const calls: string[] = [];
    const sched = new IdleScheduler({ ...DEFAULT_SCHEDULER, blinkMinMs: 1000, blinkMaxMs: 1000, idleMinMs: 1000, idleMaxMs: 1000, talkMinMs: 1000, talkMaxMs: 1000 }, {
      blink: () => calls.push('blink'), idleAnim: () => calls.push('idle'), talk: () => calls.push('talk'),
      isBusy: () => sleep.sleeping,
    }, mulberry32(1));
    sleep.start();
    await vi.advanceTimersByTimeAsync(1150); // falling
    sched.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sleep.asleep).toBe(true);
    expect(calls).toEqual([]);
  });

  for (const reason of ['click', 'doubleClick', 'drag'] as const) {
    it(`wakes on ${reason}`, async () => {
      const { sleep, log } = make();
      void sleep.sleepNow();
      await vi.advanceTimersByTimeAsync(150);
      expect(sleep.asleep).toBe(true);
      const p = sleep.wake(reason);
      expect(sleep.state).toBe('waking');
      await vi.advanceTimersByTimeAsync(150);
      await p;
      expect(sleep.state).toBe('awake');
      expect(log).toEqual(['fall', 'wake:' + reason]);
    });
  }

  it('wakes after hovering 600 ms; leaving cancels', async () => {
    const { sleep, log } = make();
    void sleep.sleepNow();
    await vi.advanceTimersByTimeAsync(150);
    sleep.hoverStart();
    await vi.advanceTimersByTimeAsync(500);
    sleep.hoverEnd();
    await vi.advanceTimersByTimeAsync(500);
    expect(sleep.asleep).toBe(true);
    sleep.hoverStart();
    await vi.advanceTimersByTimeAsync(650);
    await vi.advanceTimersByTimeAsync(150);
    expect(log).toContain('wake:hover');
    expect(sleep.state).toBe('awake');
  });

  it('a wake requested while falling asleep happens right after', async () => {
    const { sleep, log } = make();
    void sleep.sleepNow();
    await vi.advanceTimersByTimeAsync(10);
    expect(sleep.state).toBe('falling');
    void sleep.wake('click');
    await vi.advanceTimersByTimeAsync(400);
    expect(log).toEqual(['fall', 'wake:click']);
    expect(sleep.state).toBe('awake');
  });

  it('re-arms the inactivity timer after waking', async () => {
    const { sleep, log } = make({ inactivityMinMs: 5000, inactivityMaxMs: 5000 });
    sleep.start();
    void sleep.sleepNow();
    await vi.advanceTimersByTimeAsync(150);
    void sleep.wake('click');
    await vi.advanceTimersByTimeAsync(150);
    await vi.advanceTimersByTimeAsync(5100 + 150);
    expect(log.filter((l) => l === 'fall')).toHaveLength(2);
  });
});
