import { describe, expect, it } from 'vitest';
import { DEFAULTS, parseFocus, parseSettings, parseStretch, parseWater } from './settingsParse';
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

describe('presence settings', () => {
  it('hide-when-presenting and react-to-music are on by default', () => {
    expect(DEFAULTS.hideWhenPresenting).toBe(true);
    expect(DEFAULTS.reactToMusic).toBe(true);
    const s = parseSettings({});
    expect(s.hideWhenPresenting).toBe(true);
    expect(s.reactToMusic).toBe(true);
  });
  it('persist an explicit off and an explicit on; junk falls back to on', () => {
    expect(parseSettings({ hideWhenPresenting: false }).hideWhenPresenting).toBe(false);
    expect(parseSettings({ reactToMusic: false }).reactToMusic).toBe(false);
    expect(parseSettings({ hideWhenPresenting: true, reactToMusic: true })).toMatchObject({ hideWhenPresenting: true, reactToMusic: true });
    expect(parseSettings({ hideWhenPresenting: 'no', reactToMusic: 0 })).toMatchObject({ hideWhenPresenting: true, reactToMusic: true });
  });
  it('does not disturb the other settings', () => {
    expect(parseSettings({ hideWhenPresenting: false, quiet: true, style: 'flat' })).toMatchObject({ quiet: true, style: 'flat', greetOnUnlock: true });
  });
});

describe('wellbeing settings', () => {
  it('defaults: stretch on every 60 min, no focus session, meeting heads-up off', () => {
    expect(DEFAULTS.stretch).toEqual({ enabled: true, everyMin: 60 });
    expect(DEFAULTS.focus).toBeNull();
    expect(DEFAULTS.meetingHeadsUp).toBe(false);
    const s = parseSettings({});
    expect(s.stretch).toEqual({ enabled: true, everyMin: 60 });
    expect(s.meetingHeadsUp).toBe(false);
  });
  it('round-trips valid stretch values and rejects junk', () => {
    expect(parseStretch({ enabled: false, everyMin: 30 })).toEqual({ enabled: false, everyMin: 30 });
    expect(parseStretch({ enabled: true, everyMin: 75 }).everyMin).toBe(60);
    expect(parseStretch('nope')).toEqual({ enabled: true, everyMin: 60 });
  });
  it('meeting heads-up is only on when explicitly true', () => {
    expect(parseSettings({ meetingHeadsUp: true }).meetingHeadsUp).toBe(true);
    expect(parseSettings({ meetingHeadsUp: 'yes' }).meetingHeadsUp).toBe(false);
  });
  it('keeps a stored focus end time and drops garbage', () => {
    expect(parseFocus({ endsAt: 1700000000000, minutes: 25 })).toEqual({ endsAt: 1700000000000, minutes: 25 });
    expect(parseFocus({ endsAt: 'soon', minutes: 25 })).toBeNull();
    expect(parseFocus({ endsAt: 5, minutes: -1 })).toBeNull();
    expect(parseFocus(null)).toBeNull();
  });
});
