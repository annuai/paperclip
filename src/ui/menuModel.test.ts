import { describe, expect, it } from 'vitest';
import { buildMenu } from './menuModel';
import type { MenuState } from './menuModel';
import type { MenuItem } from './contextMenu';

const base: MenuState = {
  sleeping: false, quiet: false, greetOnUnlock: true, hideWhenPresenting: true, reactToMusic: true, outfits: true, style: 'classic',
  water: { enabled: true, intervalMin: 45, glassesToday: 2 },
  stretch: { enabled: true, everyMin: 60 }, focusLeft: null, calendarSupported: true, meetingHeadsUp: false,
  ask: { keySet: false, provider: 'openrouter', model: 'google/gemma-4-31b-it:free', groqModel: 'llama-3.3-70b-versatile', claudeModel: 'claude-haiku-5-5' },
};
const flat = (items: MenuItem[]): MenuItem[] => items.flatMap((i) => [i, ...flat(i.children ?? [])]);
const find = (items: MenuItem[], id: string) => flat(items).find((i) => i.id === id);

describe('main menu', () => {
  it('has 14 top-level rows: the single new row is "Ask Paperclip" (a headline action; its key and model settings are inside it)', () => {
    const m = buildMenu(base);
    expect(m.map((i) => i.id)).toEqual(['hi', 'joke', 'quote', 'tip', 'ask', 'animate', 'nap', 'quiet', 'greet', 'presence', 'style', 'wellbeing', 'hide', 'quit']);
  });

  it('Ask Paperclip (OpenRouter): ask, provider radios, key, free / paid / other model radios; "Remove API key" only with a key', () => {
    const ids = (m: MenuState) => find(buildMenu(m), 'ask')?.children?.map((c) => c.id);
    expect(ids(base)).toEqual(['ask-open', 'ask-provider-openrouter', 'ask-provider-groq', 'ask-provider-anthropic', 'ask-key', 'ask-model-free', 'ask-model-haiku', 'ask-model-other']);
    expect(ids({ ...base, ask: { ...base.ask, keySet: true } })).toEqual(['ask-open', 'ask-provider-openrouter', 'ask-provider-groq', 'ask-provider-anthropic', 'ask-key', 'ask-remove', 'ask-model-free', 'ask-model-haiku', 'ask-model-other']);
    const m = buildMenu(base);
    expect(find(m, 'ask-provider-openrouter')?.checked).toBe(true);
    expect(find(m, 'ask-provider-anthropic')?.checked).toBe(false);
    expect(find(m, 'ask-model-free')?.checked).toBe(true);
    expect(find(m, 'ask-model-free')?.label).toBe('Free (Gemma 4 31B)');
    expect(find(m, 'ask-model-haiku')?.label).toBe('Claude Haiku 5.5 (paid)');
    expect(find(m, 'ask-model-haiku')?.checked).toBe(false);
    expect(find(m, 'ask-model-other')?.checked).toBe(false);
    expect(find(m, 'ask-model-other')?.label).toBe('Other model…');
    expect(find(m, 'ask-key')?.label).toBe('Set OpenRouter API key…');
    expect(find(m, 'ask-open')?.label).toBe('Ask a question…');
    const paid = buildMenu({ ...base, ask: { ...base.ask, model: 'anthropic/claude-haiku-5.5' } });
    expect(find(paid, 'ask-model-haiku')?.checked).toBe(true);
    expect(find(paid, 'ask-model-free')?.checked).toBe(false);
    const custom = buildMenu({ ...base, ask: { ...base.ask, model: 'openai/gpt-5-mini' } });
    expect(find(custom, 'ask-model-other')?.checked).toBe(true);
    expect(find(custom, 'ask-model-other')?.label).toBe('openai/gpt-5-mini');
    expect(find(custom, 'ask-model-free')?.checked).toBe(false);
    expect(find(custom, 'ask-model-haiku')?.checked).toBe(false);
  });

  it('Ask Paperclip (Groq): provider radios in order, Groq key label, Groq model radios only', () => {
    const g = buildMenu({ ...base, ask: { ...base.ask, keySet: true, provider: 'groq' } });
    expect(find(g, 'ask')?.children?.map((c) => c.id)).toEqual(['ask-open', 'ask-provider-openrouter', 'ask-provider-groq', 'ask-provider-anthropic', 'ask-key', 'ask-remove', 'ask-groq-fast', 'ask-groq-smart', 'ask-groq-other']);
    expect(find(g, 'ask-provider-groq')?.checked).toBe(true);
    expect(find(g, 'ask-provider-groq')?.label).toBe('Groq');
    expect(find(g, 'ask-provider-openrouter')?.checked).toBe(false);
    expect(find(g, 'ask-provider-anthropic')?.checked).toBe(false);
    expect(find(g, 'ask-key')?.label).toBe('Set Groq API key…');
    expect(find(g, 'ask-groq-fast')?.checked).toBe(true);
    expect(find(g, 'ask-groq-smart')?.checked).toBe(false);
    expect(find(g, 'ask-groq-other')?.label).toBe('Other model…');
    expect(find(g, 'ask-model-free')).toBeUndefined();
    expect(find(g, 'ask-claude-haiku')).toBeUndefined();
    const smart = buildMenu({ ...base, ask: { ...base.ask, provider: 'groq', groqModel: 'openai/gpt-oss-120b' } });
    expect(find(smart, 'ask-groq-smart')?.checked).toBe(true);
    expect(find(smart, 'ask-groq-fast')?.checked).toBe(false);
    const custom = buildMenu({ ...base, ask: { ...base.ask, provider: 'groq', groqModel: 'openai/gpt-oss-20b' } });
    expect(find(custom, 'ask-groq-other')?.checked).toBe(true);
    expect(find(custom, 'ask-groq-other')?.label).toBe('openai/gpt-oss-20b');
    expect(find(custom, 'ask-groq-fast')?.checked).toBe(false);
    expect(buildMenu({ ...base, ask: { ...base.ask, provider: 'groq' } })).toHaveLength(14);
  });
  it('Ask Paperclip (Claude): only the Claude model radios, and the key item names Claude', () => {
    const a = buildMenu({ ...base, ask: { keySet: true, provider: 'anthropic', model: 'google/gemma-4-31b-it:free', groqModel: 'llama-3.3-70b-versatile', claudeModel: 'claude-sonnet-5-5' } });
    expect(find(a, 'ask')?.children?.map((c) => c.id)).toEqual(['ask-open', 'ask-provider-openrouter', 'ask-provider-groq', 'ask-provider-anthropic', 'ask-key', 'ask-remove', 'ask-claude-haiku', 'ask-claude-sonnet']);
    expect(find(a, 'ask-provider-anthropic')?.checked).toBe(true);
    expect(find(a, 'ask-provider-openrouter')?.checked).toBe(false);
    expect(find(a, 'ask-key')?.label).toBe('Set Claude API key…');
    expect(find(a, 'ask-claude-sonnet')?.checked).toBe(true);
    expect(find(a, 'ask-claude-haiku')?.checked).toBe(false);
    expect(find(a, 'ask-model-free')).toBeUndefined();
  });

  it('"Check for updates…" lives inside the Presence submenu, not as a new top-level row', () => {
    expect(find(buildMenu(base), 'presence')?.children?.map((c) => c.id)).toEqual(['presence-hide', 'presence-music', 'update-check']);
    expect(find(buildMenu(base), 'update-check')?.label).toBe('Check for updates…');
  });

  it('groups water, stretch, focus and meeting heads-up under Wellbeing', () => {
    const w = find(buildMenu(base), 'wellbeing');
    expect(w?.children?.map((c) => c.id)).toEqual(['water', 'stretch', 'focus', 'meeting']);
    expect(find(buildMenu(base), 'water')?.children?.map((c) => c.id)).toEqual(
      ['water-enabled', 'water-30', 'water-45', 'water-60', 'water-90', 'water-now', 'water-info']);
    expect(find(buildMenu(base), 'stretch')?.children?.map((c) => c.id)).toEqual(
      ['stretch-enabled', 'stretch-30', 'stretch-45', 'stretch-60', 'stretch-90', 'stretch-now']);
  });

  it('seasonal outfits live in the Style submenu (no new top-level row), as a checkbox', () => {
    const style = find(buildMenu(base), 'style');
    expect(style?.children?.map((c) => c.id)).toEqual(['style-classic', 'style-flat', 'style-outfits']);
    expect(find(buildMenu(base), 'style-outfits')).toMatchObject({ label: 'Seasonal outfits', role: 'checkbox', checked: true });
    expect(find(buildMenu({ ...base, outfits: false }), 'style-outfits')?.checked).toBe(false);
  });

  it('every id is unique (the tray and the menu share them)', () => {
    const ids = flat(buildMenu({ ...base, focusLeft: 12 })).map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('focus: four lengths, Stop and the time left only while running', () => {
    const idle = find(buildMenu(base), 'focus');
    expect(idle?.label).toBe('Focus timer');
    expect(idle?.children?.map((c) => c.id)).toEqual(['focus-15', 'focus-25', 'focus-45', 'focus-60']);
    const running = find(buildMenu({ ...base, focusLeft: 18 }), 'focus');
    expect(running?.label).toBe('Focus: 18 min left');
    expect(running?.children?.map((c) => c.id)).toEqual(['focus-15', 'focus-25', 'focus-45', 'focus-60', 'focus-stop']);
  });

  it('meeting heads-up is hidden where the calendar is unsupported', () => {
    expect(find(buildMenu({ ...base, calendarSupported: false }), 'meeting')).toBeUndefined();
    expect(find(buildMenu({ ...base, meetingHeadsUp: true }), 'meeting')?.checked).toBe(true);
  });

  it('reflects the stretch interval and enabled flag', () => {
    const m = buildMenu({ ...base, stretch: { enabled: false, everyMin: 90 } });
    expect(find(m, 'stretch-enabled')?.checked).toBe(false);
    expect(find(m, 'stretch-90')?.checked).toBe(true);
    expect(find(m, 'stretch-60')?.checked).toBe(false);
  });

  it('the deepest level is two submenus (Wellbeing > Water) so the drill-down covers it', () => {
    const depth = (i: MenuItem): number => 1 + Math.max(0, ...(i.children ?? []).map(depth));
    expect(Math.max(...buildMenu(base).map(depth))).toBe(3);
  });
});
