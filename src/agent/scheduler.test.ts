import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SCHEDULER, IdleScheduler } from './scheduler';
import { mulberry32 } from '../util/rng';

function make(busy = false, cfg = {}) {
  const calls: { kind: string; at: number }[] = [];
  let isBusy = busy;
  const h = {
    blink: () => calls.push({ kind: 'blink', at: Date.now() }),
    idleAnim: () => calls.push({ kind: 'idle', at: Date.now() }),
    talk: () => calls.push({ kind: 'talk', at: Date.now() }),
    isBusy: () => isBusy,
  };
  const s = new IdleScheduler({ ...DEFAULT_SCHEDULER, ...cfg }, h, mulberry32(42));
  return { s, calls, setBusy: (b: boolean) => (isBusy = b) };
}

describe('IdleScheduler', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
  afterEach(() => vi.useRealTimers());

  it('fires blink/idle/talk within their windows', () => {
    const { s, calls } = make();
    s.start();
    vi.advanceTimersByTime(7000);
    const blink = calls.find((c) => c.kind === 'blink');
    expect(blink && blink.at >= 3000 && blink.at <= 7000).toBe(true);
    vi.advanceTimersByTime(13000);
    const idle = calls.find((c) => c.kind === 'idle');
    expect(idle && idle.at >= 8000 && idle.at <= 20000).toBe(true);
    expect(calls.some((c) => c.kind === 'talk')).toBe(false);
    vi.advanceTimersByTime(280000);
    const talk = calls.find((c) => c.kind === 'talk');
    expect(talk && talk.at >= 120000 && talk.at <= 300000).toBe(true);
  });

  it('retries blink after 1 s when busy', () => {
    const { s, calls, setBusy } = make(true, { blinkMinMs: 3000, blinkMaxMs: 3000 });
    s.start();
    vi.advanceTimersByTime(3000);
    expect(calls.filter((c) => c.kind === 'blink')).toHaveLength(0);
    setBusy(false);
    vi.advanceTimersByTime(999);
    expect(calls.filter((c) => c.kind === 'blink')).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(calls.filter((c) => c.kind === 'blink')).toHaveLength(1);
  });

  it('quiet: no talk in 30 min, idle interval doubled', () => {
    const { s, calls } = make(false, { quiet: true, idleMinMs: 10000, idleMaxMs: 10000 });
    s.start();
    vi.advanceTimersByTime(19999);
    expect(calls.filter((c) => c.kind === 'idle')).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(calls.filter((c) => c.kind === 'idle')).toHaveLength(1);
    vi.advanceTimersByTime(30 * 60 * 1000);
    expect(calls.some((c) => c.kind === 'talk')).toBe(false);
    expect(calls.some((c) => c.kind === 'blink')).toBe(true);
  });

  it('setConfig quiet true stops talk', () => {
    const { s, calls } = make();
    s.start();
    s.setConfig({ quiet: true });
    vi.advanceTimersByTime(30 * 60 * 1000);
    expect(calls.some((c) => c.kind === 'talk')).toBe(false);
  });

  it('stop halts all handlers; start is idempotent', () => {
    const { s, calls } = make();
    s.start();
    s.start();
    s.stop();
    expect(s.running).toBe(false);
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(calls).toHaveLength(0);
  });

  it('notifyActivity postpones idle', () => {
    const { s, calls } = make(false, { idleMinMs: 10000, idleMaxMs: 10000 });
    s.start();
    vi.advanceTimersByTime(8000);
    s.notifyActivity();
    vi.advanceTimersByTime(8000);
    expect(calls.filter((c) => c.kind === 'idle')).toHaveLength(0);
    vi.advanceTimersByTime(2000);
    expect(calls.filter((c) => c.kind === 'idle')).toHaveLength(1);
  });
});
