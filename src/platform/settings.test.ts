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

describe('update settings', () => {
  it('default to never checked and nothing mentioned; keep valid values, drop junk', () => {
    expect(DEFAULTS.updates).toEqual({ lastCheckAt: null, mentionedVersion: null });
    expect(parseSettings({}).updates).toEqual({ lastCheckAt: null, mentionedVersion: null });
    expect(parseSettings({ updates: { lastCheckAt: 1700000000000, mentionedVersion: '0.2.0' } }).updates).toEqual({ lastCheckAt: 1700000000000, mentionedVersion: '0.2.0' });
    expect(parseSettings({ updates: 'x' }).updates).toEqual({ lastCheckAt: null, mentionedVersion: null });
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

describe('outfits setting', () => {
  it('defaults to auto; only an explicit off persists', () => {
    expect(DEFAULTS.outfits).toBe('auto');
    expect(parseSettings({}).outfits).toBe('auto');
    expect(parseSettings({ outfits: 'off' }).outfits).toBe('off');
    expect(parseSettings({ outfits: 'santa-hat' }).outfits).toBe('auto');
  });
});

describe('ask settings', () => {
  it('defaults: OpenRouter, the free model, Claude Haiku for the optional provider, intro not yet shown', () => {
    expect(DEFAULTS.askProvider).toBe('openrouter');
    expect(DEFAULTS.askModel).toBe('google/gemma-4-31b-it:free');
    expect(DEFAULTS.askClaudeModel).toBe('claude-haiku-5-5');
    expect(DEFAULTS.askIntroSeen).toBe(false);
    const p = parseSettings({});
    expect([p.askProvider, p.askModel, p.askClaudeModel]).toEqual(['openrouter', 'google/gemma-4-31b-it:free', 'claude-haiku-5-5']);
  });
  it('existing users with an old claude-* askModel: provider openrouter + free model, the Claude choice is kept', () => {
    const a = parseSettings({ askModel: 'claude-sonnet-5-5' });
    expect([a.askProvider, a.askModel, a.askClaudeModel]).toEqual(['openrouter', 'google/gemma-4-31b-it:free', 'claude-sonnet-5-5']);
    const b = parseSettings({ askModel: 'claude-haiku-5-5' });
    expect([b.askProvider, b.askModel, b.askClaudeModel]).toEqual(['openrouter', 'google/gemma-4-31b-it:free', 'claude-haiku-5-5']);
  });
  it('new values: valid OpenRouter ids kept, explicit claude model wins, provider anthropic is honoured, junk defaults', () => {
    const a = parseSettings({ askProvider: 'anthropic', askClaudeModel: 'claude-sonnet-5-5', askModel: 'openai/gpt-5-mini' });
    expect([a.askProvider, a.askModel, a.askClaudeModel]).toEqual(['anthropic', 'openai/gpt-5-mini', 'claude-sonnet-5-5']);
    expect(parseSettings({ askModel: 'meta-llama/llama-3:free' }).askModel).toBe('meta-llama/llama-3:free');
    expect(parseSettings({ askModel: 'a b/c' }).askModel).toBe('google/gemma-4-31b-it:free');
    expect(parseSettings({ askModel: 42, askProvider: 'bing' }).askProvider).toBe('openrouter');
    expect(parseSettings({ askIntroSeen: true }).askIntroSeen).toBe(true);
    expect(parseSettings({ askIntroSeen: 'yes' }).askIntroSeen).toBe(false);
  });
  it('no API key field exists in settings (it lives in the keychain)', () => {
    expect(Object.keys(parseSettings({ apiKey: 'sk-ant-x', askKey: 'sk-ant-x' })).join(' ')).not.toMatch(/key/i);
  });
});
