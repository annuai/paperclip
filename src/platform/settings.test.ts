import { describe, expect, it } from 'vitest';
import { DEFAULTS, parseSettings, parseWater } from './settingsParse';
import { normalizeStyle } from '../art/style';

describe('style persistence', () => {
  it('defaults to classic', () => {
    expect(DEFAULTS.style).toBe('classic');
    expect(parseSettings({}).style).toBe('classic');
  });
  it('round-trips a saved style and rejects junk', () => {
    expect(parseSettings({ style: 'flat' }).style).toBe('flat');
    expect(parseSettings({ style: 'classic' }).style).toBe('classic');
    expect(parseSettings({ style: 'neon' }).style).toBe('classic');
    expect(normalizeStyle(42)).toBe('classic');
  });
  it('keeps the other settings valid', () => {
    const s = parseSettings({ quiet: true, hidden: true, position: { x: 1, y: 2 }, style: 'flat' });
    expect(s).toMatchObject({ quiet: true, hidden: true, position: { x: 1, y: 2 }, style: 'flat' });
    expect(parseSettings({ position: { x: 'a', y: 1 } }).position).toBeNull();
  });
});

describe('water settings', () => {
  it('defaults: reminders on, every 45 min, no glasses', () => {
    expect(DEFAULTS.water).toMatchObject({ enabled: true, intervalMin: 45, lastReminderAt: null, glasses: 0 });
    expect(parseSettings({}).water.enabled).toBe(true);
  });
  it('round-trips valid values and rejects junk', () => {
    const w = parseWater({ enabled: false, intervalMin: 60, lastReminderAt: 123, glasses: 4, glassesDate: '2026-01-05' });
    expect(w).toEqual({ enabled: false, intervalMin: 60, lastReminderAt: 123, glasses: 4, glassesDate: '2026-01-05' });
    expect(parseWater({ intervalMin: 17, glasses: -2, lastReminderAt: 'x' })).toMatchObject({ intervalMin: 45, glasses: 0, lastReminderAt: null });
    expect(parseWater(null).enabled).toBe(true);
  });
});

describe('greet-on-unlock setting', () => {
  it('is on by default and persists an explicit off', () => {
    expect(DEFAULTS.greetOnUnlock).toBe(true);
    expect(parseSettings({}).greetOnUnlock).toBe(true);
    expect(parseSettings({ greetOnUnlock: false }).greetOnUnlock).toBe(false);
    expect(parseSettings({ greetOnUnlock: true }).greetOnUnlock).toBe(true);
  });
});
