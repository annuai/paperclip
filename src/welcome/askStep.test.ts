import { describe, expect, it } from 'vitest';
import { viewFor } from './askStep';
import type { FailureKind } from '../agent/ask';

const fail = (kind: FailureKind, p: 'openrouter' | 'groq' = 'openrouter') => {
  const v = viewFor({ ok: false, failure: { kind, message: 'rust says' } }, p);
  if (v.kind !== 'failure') throw new Error('expected failure');
  return v;
};

describe('ask step view', () => {
  it('shows an answer', () => {
    expect(viewFor({ ok: true, answer: 'Hi' }, 'groq')).toEqual({ kind: 'answer', text: 'Hi' });
  });
  it('maps each failure to its actions', () => {
    expect(fail('unauthorized')).toMatchObject({ message: "That key didn't work. Want to try a different one?", actions: ['fixKey', 'finish'] });
    expect(fail('noKey')).toMatchObject({ message: 'rust says', actions: ['fixKey', 'finish'] });
    expect(fail('outOfCredits').actions).toEqual(['otherService', 'freeModel', 'finish']);
    expect(fail('outOfCredits', 'groq').actions).toEqual(['otherService', 'finish']);
    expect(fail('badModel').actions).toEqual(['freeModel', 'finish']);
    expect(fail('tooLong').actions).toEqual(['backToInput', 'finish']);
    expect(fail('rateLimited')).toMatchObject({ actions: ['retry', 'finish'], retryAfterMs: 10000 });
    expect(fail('overloaded').retryAfterMs).toBe(10000);
    expect(fail('offline')).toMatchObject({ actions: ['retry', 'finish'], retryAfterMs: 0 });
  });
  it('always offers finish', () => {
    const kinds: FailureKind[] = ['noKey', 'unauthorized', 'outOfCredits', 'badModel', 'rateLimited', 'overloaded', 'offline', 'timeout', 'tooLong', 'refused', 'empty', 'other'];
    for (const kind of kinds) expect(fail(kind).actions).toContain('finish');
  });
});
