import { describe, expect, it } from 'vitest';
import { PROVIDER_GUIDES, keyCheckMessage, keyLooksRight } from './providers';

describe('provider guides', () => {
  it('has the spec data for each provider', () => {
    expect(PROVIDER_GUIDES.openrouter.host).toBe('openrouter.ai/keys');
    expect(PROVIDER_GUIDES.groq.host).toBe('console.groq.com/keys');
    expect(PROVIDER_GUIDES.anthropic.host).toBe('platform.claude.com/settings/keys');
    expect(PROVIDER_GUIDES.groq.createLabel).toBe('Create API key');
    expect(Object.keys(PROVIDER_GUIDES).sort()).toEqual(['anthropic', 'groq', 'openrouter']);
  });
  it('keyLooksRight mirrors Rust validate_key', () => {
    expect(keyLooksRight('openrouter', '   ')).toBe('empty');
    expect(keyLooksRight('openrouter', 'sk-or-a b')).toBe('invalid');
    expect(keyLooksRight('openrouter', 'sk-or-é')).toBe('invalid');
    expect(keyLooksRight('openrouter', 'sk-or-' + 'a'.repeat(507))).toBe('invalid'); // 513 chars
    expect(keyLooksRight('openrouter', '  sk-or-v1-abc  ')).toBe('ok');
  });
  it('refuses practice keys', () => {
    for (const p of ['openrouter', 'groq', 'anthropic'] as const) expect(keyLooksRight(p, PROVIDER_GUIDES[p].practiceKey)).toBe('practice');
    expect(keyCheckMessage('openrouter', 'practice')).toBe("That's the practice key. Paste the one you copied from OpenRouter.");
  });
  it('soft prefix warning', () => {
    expect(keyLooksRight('groq', 'sk-or-v1-abc')).toBe('unexpectedPrefix');
    expect(keyCheckMessage('openrouter', 'unexpectedPrefix')).toBe("That doesn't look like an OpenRouter key (they start with sk-or-). Save anyway?");
    expect(keyCheckMessage('openrouter', 'invalid')).toBe("That doesn't look like an API key.");
    expect(keyCheckMessage('openrouter', 'ok')).toBeNull();
  });
});
