import { describe, expect, it } from 'vitest';
import { AskFlow, AskHistory, DEFAULT_ASK_MODEL, MAX_QUESTION_CHARS, DEFAULT_ASK_PROVIDER, isValidModelId, normalizeAskModel, normalizeAskProvider, normalizeClaudeModel, providerName } from './ask';
import type { AskDeps, AskResult, Turn } from './ask';
import type { PromptOpts } from './agent';

describe('AskHistory', () => {
  it('keeps the last 6 exchanges as flat turns and clears', () => {
    const h = new AskHistory();
    for (let i = 0; i < 9; i++) h.add(`q${i}`, `a${i}`);
    const t = h.turns();
    expect(t).toHaveLength(12);
    expect(t[0]).toEqual({ role: 'user', text: 'q3' });
    expect(t[11]).toEqual({ role: 'assistant', text: 'a8' });
    h.clear();
    expect(h.turns()).toEqual([]);
  });
});

describe('provider and model normalizing', () => {
  it('provider defaults to openrouter; only "anthropic" switches', () => {
    expect(DEFAULT_ASK_PROVIDER).toBe('openrouter');
    expect(normalizeAskProvider(undefined)).toBe('openrouter');
    expect(normalizeAskProvider('x')).toBe('openrouter');
    expect(normalizeAskProvider('anthropic')).toBe('anthropic');
    expect(providerName('openrouter')).toBe('OpenRouter');
    expect(providerName('anthropic')).toBe('Claude');
  });
  it('OpenRouter model: free default, any valid id kept, old claude-* ids and junk become the default', () => {
    expect(DEFAULT_ASK_MODEL).toBe('google/gemma-4-31b-it:free');
    expect(normalizeAskModel('anthropic/claude-haiku-5.5')).toBe('anthropic/claude-haiku-5.5');
    expect(normalizeAskModel('mistralai/mistral-small:free')).toBe('mistralai/mistral-small:free');
    expect(normalizeAskModel('claude-haiku-5-5')).toBe('google/gemma-4-31b-it:free');
    expect(normalizeAskModel('claude-sonnet-5-5')).toBe('google/gemma-4-31b-it:free');
    expect(normalizeAskModel(undefined)).toBe('google/gemma-4-31b-it:free');
  });
  it('Claude model: the two ids, anything else is Haiku', () => {
    expect(normalizeClaudeModel('claude-sonnet-5-5')).toBe('claude-sonnet-5-5');
    expect(normalizeClaudeModel('claude-haiku-5-5')).toBe('claude-haiku-5-5');
    expect(normalizeClaudeModel('claude-opus-5-5')).toBe('claude-haiku-5-5');
    expect(normalizeClaudeModel('anthropic/claude-sonnet-5.5')).toBe('claude-haiku-5-5');
  });
  it('validates model ids', () => {
    for (const ok of ['openai/gpt-5', 'a/b', 'x~y/z.1:free']) expect(isValidModelId(ok), ok).toBe(true);
    for (const bad of ['', 'nogroup', 'a/b/c', 'a /b', 'a/b c', '/b', 'a/', `a/${'b'.repeat(100)}`, 5]) expect(isValidModelId(bad), String(bad)).toBe(false);
  });
});

const ok = (answer: string): AskResult => ({ ok: true, answer });
const fail = (kind: string, message = `msg-${kind}`): AskResult => ({ ok: false, failure: { kind, message } as never });

interface Rig {
  flow: AskFlow;
  log: string[];
  prompts: { text: string; opts: PromptOpts }[];
  queries: { q: string; turns: Turn[] }[];
  state: { key: boolean; intro: boolean; epoch: number; savedKeys: string[]; saveOk: boolean; models: string[] };
  /** answers the next prompt()s with these values */
  typed: (string | null)[];
  choices: string[];
  results: AskResult[];
  history: AskHistory;
}

function rig(): Rig {
  const r = {
    log: [] as string[],
    prompts: [] as Rig['prompts'],
    queries: [] as Rig['queries'],
    state: { key: true, intro: true, epoch: 0, savedKeys: [] as string[], saveOk: true, models: [] as string[] },
    typed: [] as (string | null)[],
    choices: [] as string[],
    results: [] as AskResult[],
  } as Rig;
  r.history = new AskHistory();
  const deps: AskDeps = {
    hasKey: () => r.state.key,
    introSeen: () => r.state.intro,
    markIntroSeen: () => { r.state.intro = true; r.log.push('introSeen'); },
    line: async (kind) => `line:${kind}`,
    prompt: async (text, opts) => { r.prompts.push({ text, opts }); r.log.push('prompt'); return r.typed.shift() ?? null; },
    say: async (t) => { r.log.push(`say:${t}`); },
    choose: async (t, actions) => { r.log.push(`choose:${t}|${actions.map((a) => a.id).join(',')}`); return r.choices.shift() ?? 'done'; },
    think: () => { r.log.push('think'); return () => r.log.push('settle'); },
    query: async (q, turns) => { r.queries.push({ q, turns }); r.log.push('query'); return r.results.shift() ?? ok('default answer'); },
    saveKey: async (k) => { r.state.savedKeys.push(k); return r.state.saveOk; },
    removeKey: async () => { r.state.key = false; r.log.push('removeKey'); },
    setModel: (id) => { r.state.models.push(id); },
    epoch: () => r.state.epoch,
  };
  r.flow = new AskFlow(deps, r.history);
  return r;
}

describe('AskFlow: asking', () => {
  it('prompts, thinks while waiting, shows the answer with Reply/Done, then goes idle on Done', async () => {
    const r = rig();
    r.typed.push('  what is rust?  ');
    r.results.push(ok('A language.'));
    await r.flow.ask();
    expect(r.log).toEqual(['prompt', 'think', 'query', 'settle', 'choose:A language.|reply,done']);
    expect(r.prompts[0].opts.secret).toBe(false);
    expect(r.queries[0].q).toBe('what is rust?');
    expect(r.flow.state).toBe('idle');
    expect(r.history.turns()).toEqual([{ role: 'user', text: 'what is rust?' }, { role: 'assistant', text: 'A language.' }]);
  });

  it('Reply continues the thread: the next prompt is a follow-up and the history is sent', async () => {
    const r = rig();
    r.typed.push('one', 'two');
    r.results.push(ok('first'), ok('second'));
    r.choices.push('reply', 'done');
    await r.flow.ask();
    expect(r.queries).toHaveLength(2);
    expect(r.queries[1].turns).toEqual([{ role: 'user', text: 'one' }, { role: 'assistant', text: 'first' }]);
    expect(r.prompts[1].text).toBe('line:again');
  });

  it('Esc (null), a blank line or an over-long line never calls Claude / is clipped', async () => {
    const a = rig();
    a.typed.push(null);
    await a.flow.ask();
    expect(a.queries).toHaveLength(0);
    expect(a.flow.state).toBe('idle');
    const b = rig();
    b.typed.push('   ');
    await b.flow.ask();
    expect(b.queries).toHaveLength(0);
    const c = rig();
    c.typed.push('x'.repeat(MAX_QUESTION_CHARS + 100));
    await c.flow.ask();
    expect(c.queries[0].q).toHaveLength(MAX_QUESTION_CHARS);
  });

  it('the first prompt carries the privacy line, once, and remembers it was shown', async () => {
    const r = rig();
    r.state.intro = false;
    r.typed.push(null);
    await r.flow.ask();
    expect(r.prompts[0].text).toBe('line:intro');
    expect(r.state.intro).toBe(true);
    r.typed.push(null);
    await r.flow.ask();
    expect(r.prompts[1].text).toBe('line:prompt');
  });

  it('state is waiting while the query is in flight', async () => {
    const r = rig();
    const seen: string[] = [];
    const deps = (r.flow as unknown as { deps: AskDeps }).deps;
    const q = deps.query;
    deps.query = async (a, b) => { seen.push(r.flow.state); return q(a, b); };
    r.typed.push('hi');
    await r.flow.ask();
    expect(seen).toEqual(['waiting']);
  });
});

describe('AskFlow: errors', () => {
  it('a network-ish failure is spoken and the flow ends (history untouched)', async () => {
    const r = rig();
    r.typed.push('hi');
    r.results.push(fail('offline'));
    await r.flow.ask();
    expect(r.log).toContain('say:msg-offline');
    expect(r.history.turns()).toEqual([]);
    expect(r.flow.state).toBe('idle');
  });

  it('a rejected key offers "Set key"; entering a new key retries the same question', async () => {
    const r = rig();
    r.typed.push('hi', 'sk-new');
    r.results.push(fail('unauthorized'), ok('worked'));
    r.choices.push('key', 'done');
    await r.flow.ask();
    expect(r.log).toContain('choose:msg-unauthorized|key,done');
    expect(r.state.savedKeys).toEqual(['sk-new']);
    expect(r.prompts[1].opts.secret).toBe(true);
    expect(r.queries.map((q) => q.q)).toEqual(['hi', 'hi']);
    expect(r.history.turns()[1]).toEqual({ role: 'assistant', text: 'worked' });
  });

  it('declining "Set key" just ends', async () => {
    const r = rig();
    r.typed.push('hi');
    r.results.push(fail('unauthorized'));
    r.choices.push('done');
    await r.flow.ask();
    expect(r.queries).toHaveLength(1);
    expect(r.state.savedKeys).toEqual([]);
  });
});

describe('AskFlow: API key entry', () => {
  it('no key: asks for it with a secret prompt first, then goes on to the question', async () => {
    const r = rig();
    r.state.key = false;
    r.typed.push('  sk-ant-abc  ', 'a question');
    await r.flow.ask();
    expect(r.prompts[0]).toMatchObject({ text: 'line:keyPrompt', opts: { secret: true } });
    expect(r.state.savedKeys).toEqual(['sk-ant-abc']);
    expect(r.prompts[1].opts.secret).toBe(false);
    expect(r.queries).toHaveLength(1);
  });

  it('cancelling or leaving the key blank stops without a question', async () => {
    const r = rig();
    r.state.key = false;
    r.typed.push(null);
    await r.flow.ask();
    expect(r.prompts).toHaveLength(1);
    expect(r.queries).toHaveLength(0);
    r.typed.push('   ');
    await r.flow.ask();
    expect(r.state.savedKeys).toEqual([]);
  });

  it('a failed keychain write is reported and stops', async () => {
    const r = rig();
    r.state.key = false;
    r.state.saveOk = false;
    r.typed.push('sk-ant-abc');
    await r.flow.ask();
    expect(r.log.some((l) => l.startsWith('say:') && l.includes('keyFailed'))).toBe(true);
    expect(r.queries).toHaveLength(0);
  });

  it('setKey() from the menu: secret prompt, then confirms; it does not start a question', async () => {
    const r = rig();
    r.typed.push('sk-ant-xyz');
    await r.flow.setKey();
    expect(r.prompts[0].opts.secret).toBe(true);
    expect(r.log).toContain('say:line:keySaved');
    expect(r.queries).toHaveLength(0);
  });

  it('removeKey() deletes it, confirms and forgets the conversation', async () => {
    const r = rig();
    r.history.add('q', 'a');
    await r.flow.removeKey();
    expect(r.log).toEqual(['removeKey', 'say:line:keyRemoved']);
    expect(r.history.turns()).toEqual([]);
  });
});

describe('AskFlow: other model', () => {
  it('a valid id is stored and confirmed', async () => {
    const r = rig();
    r.typed.push('  openai/gpt-5-mini ');
    await r.flow.chooseModel();
    expect(r.state.models).toEqual(['openai/gpt-5-mini']);
    expect(r.log).toContain('say:line:modelSaved');
    expect(r.prompts[0].opts.secret).toBe(false);
    expect(r.queries).toHaveLength(0);
  });
  it('an invalid id is refused; Esc and blank do nothing', async () => {
    const r = rig();
    r.typed.push('not a model');
    await r.flow.chooseModel();
    expect(r.log).toContain('say:line:modelInvalid');
    r.typed.push(null);
    await r.flow.chooseModel();
    r.typed.push('  ');
    await r.flow.chooseModel();
    expect(r.state.models).toEqual([]);
    expect(r.flow.state).toBe('idle');
  });
});

describe('AskFlow: being taken over', () => {
  it('an interrupt (epoch change) while waiting drops the answer silently', async () => {
    const r = rig();
    const deps = (r.flow as unknown as { deps: AskDeps }).deps;
    const q = deps.query;
    deps.query = async (a, b) => { r.state.epoch++; return q(a, b); };
    r.typed.push('hi');
    await r.flow.ask();
    expect(r.log.some((l) => l.startsWith('choose:'))).toBe(false);
    expect(r.log).toContain('settle'); // the thinking animation is always stopped
    expect(r.history.turns()).toEqual([]);
    expect(r.flow.state).toBe('idle');
  });

  it('a newer ask() supersedes an older one that is still waiting', async () => {
    const r = rig();
    let release: (v: AskResult) => void = () => undefined;
    const deps = (r.flow as unknown as { deps: AskDeps }).deps;
    let n = 0;
    deps.query = (q) => { r.queries.push({ q, turns: [] }); return n++ === 0 ? new Promise<AskResult>((res) => { release = res; }) : Promise.resolve(ok('new')); };
    r.typed.push('old', 'new');
    const first = r.flow.ask();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    const second = r.flow.ask();
    await second;
    release(ok('stale answer'));
    await first;
    expect(r.log.filter((l) => l.startsWith('choose:'))).toEqual(['choose:new|reply,done']);
    expect(r.history.turns()).toEqual([{ role: 'user', text: 'new' }, { role: 'assistant', text: 'new' }]);
  });

  it('reset() (he was hidden) clears the conversation', () => {
    const r = rig();
    r.history.add('q', 'a');
    r.flow.reset();
    expect(r.history.turns()).toEqual([]);
  });
});
