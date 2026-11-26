import { MAX_KEY_CHARS, providerName } from '../agent/ask';
import type { AskProvider } from '../agent/ask';

export type Platform = 'macos' | 'windows' | 'linux';

/** Everything the key screen says about one service. The drawing it feeds is our own illustration, not their site. */
export interface ProviderGuide {
  id: AskProvider;
  tab: string;
  host: string;
  signInTitle: string;
  createLabel: string;
  steps: [string, string, string];
  note: string;
  prefix: string;
  keyRow: string;
  flyChip: string;
  practiceKey: string;
  placeholder: string;
  name: string;
}

export const PROVIDER_GUIDES: Record<AskProvider, ProviderGuide> = {
  openrouter: {
    id: 'openrouter', tab: 'OpenRouter · free', host: 'openrouter.ai/keys', signInTitle: 'OpenRouter account', createLabel: 'Create key',
    steps: ['Sign in (or make a free account)', 'Create a key, any name', 'Copy it (starts with sk-or-)'],
    note: 'Free models need no credit card.', prefix: 'sk-or-', keyRow: 'sk-or-v1-••••••••', flyChip: 'sk-or-••••',
    practiceKey: 'sk-or-PRACTICE-not-a-real-key', placeholder: 'Paste your OpenRouter key', name: providerName('openrouter'),
  },
  groq: {
    id: 'groq', tab: 'Groq · free', host: 'console.groq.com/keys', signInTitle: 'GroqCloud', createLabel: 'Create API key',
    steps: ['Sign in (or make a free account)', 'Create API Key, any name', "Copy it, it's shown only once"],
    note: 'Free tier, no credit card.', prefix: 'gsk_', keyRow: 'gsk_••••••••', flyChip: 'gsk_••••',
    practiceKey: 'gsk_PRACTICE-not-a-real-key', placeholder: 'Paste your Groq key', name: providerName('groq'),
  },
  anthropic: {
    id: 'anthropic', tab: 'Claude · paid', host: 'platform.claude.com/settings/keys', signInTitle: 'Claude Console', createLabel: 'Create key',
    steps: ['Sign in to the Claude Console', 'Create key, name it', 'Copy it (starts with sk-ant-), shown only once'],
    note: 'Needs prepaid credits on your Claude account.', prefix: 'sk-ant-', keyRow: 'sk-ant-••••••••', flyChip: 'sk-ant-••••',
    practiceKey: 'sk-ant-PRACTICE-not-a-real-key', placeholder: 'Paste your Claude key', name: providerName('anthropic'),
  },
};

export type KeyCheck = 'empty' | 'invalid' | 'practice' | 'unexpectedPrefix' | 'ok';

/** A friendly first look at a pasted key. Rust stays the authority on what is saved. */
export function keyLooksRight(p: AskProvider, raw: string): KeyCheck {
  const key = raw.trim();
  if (!key) return 'empty';
  if (key.includes('PRACTICE')) return 'practice';
  if (key.length > MAX_KEY_CHARS || !/^[\x21-\x7e]+$/.test(key)) return 'invalid';
  return key.startsWith(PROVIDER_GUIDES[p].prefix) ? 'ok' : 'unexpectedPrefix';
}

export function keyCheckMessage(p: AskProvider, c: KeyCheck): string | null {
  const g = PROVIDER_GUIDES[p];
  if (c === 'invalid') return "That doesn't look like an API key.";
  if (c === 'practice') return `That's the practice key. Paste the one you copied from ${g.name}.`;
  if (c === 'unexpectedPrefix') {
    const article = /^[AEIOU]/.test(g.name) ? 'an' : 'a';
    return `That doesn't look like ${article} ${g.name} key (they start with ${g.prefix}). Save anyway?`;
  }
  return null;
}
