import { describe, expect, it, vi } from 'vitest';
import { FocusLease, RELEASE_DELAY_MS } from './focusLease';

function setup() {
  const setFocus = vi.fn((_on: boolean) => Promise.resolve());
  return { setFocus, lease: new FocusLease(setFocus) };
}

describe('FocusLease', () => {
  it('the menu opening takes focus, and closing gives it back after a short delay', () => {
    vi.useFakeTimers();
    const { setFocus, lease } = setup();
    void lease.acquire('menu');
    expect(setFocus).toHaveBeenLastCalledWith(true);
    lease.release('menu');
    expect(setFocus).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(RELEASE_DELAY_MS);
    expect(setFocus).toHaveBeenLastCalledWith(false);
    expect(setFocus).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('menu -> Ask input hand-over keeps focus without flicker', () => {
    vi.useFakeTimers();
    const { setFocus, lease } = setup();
    void lease.acquire('menu');
    lease.release('menu');
    vi.advanceTimersByTime(50);
    void lease.acquire('prompt');
    vi.advanceTimersByTime(1000);
    expect(setFocus.mock.calls).toEqual([[true]]);
    lease.release('prompt');
    vi.advanceTimersByTime(RELEASE_DELAY_MS);
    expect(setFocus.mock.calls).toEqual([[true], [false]]);
    vi.useRealTimers();
  });

  it('focus is only given back when every holder has let go', () => {
    vi.useFakeTimers();
    const { setFocus, lease } = setup();
    void lease.acquire('prompt');
    void lease.acquire('menu');
    lease.release('menu');
    vi.advanceTimersByTime(1000);
    expect(setFocus.mock.calls).toEqual([[true]]);
    expect(lease.held('prompt')).toBe(true);
    lease.release('prompt');
    vi.advanceTimersByTime(RELEASE_DELAY_MS);
    expect(setFocus.mock.calls).toEqual([[true], [false]]);
    vi.useRealTimers();
  });

  it('releasing something never acquired does nothing', () => {
    vi.useFakeTimers();
    const { setFocus, lease } = setup();
    lease.release('menu');
    vi.advanceTimersByTime(1000);
    expect(setFocus).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('acquire twice focuses once', () => {
    const { setFocus, lease } = setup();
    void lease.acquire('menu');
    void lease.acquire('menu');
    expect(setFocus).toHaveBeenCalledTimes(1);
  });
});
