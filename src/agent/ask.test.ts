import { describe, expect, it } from 'vitest';
import { AskFlow, AskHistory, DEFAULT_ASK_MODEL, MAX_QUESTION_CHARS, DEFAULT_ASK_PROVIDER, isValidModelId, normalizeAskModel, normalizeAskProvider, normalizeClaudeModel, providerName, DEFAULT_GROQ_MODEL, isValidGroqModelId, isPresetGroqModel, normalizeGroqModel } from './ask';
import type { AskProvider } from './ask';
import type { AskDeps, AskResult, LocalAnswer, Turn } from './ask';
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
  it('Groq: provider name, normalization and model ids (vendor prefix optional)', () => {
    expect(providerName('groq')).toBe('Groq');
    expect(normalizeAskProvider('groq')).toBe('groq');
    expect(DEFAULT_GROQ_MODEL).toBe('qwen/qwen3.8-27b');
    for (const ok of ['llama-3.3-70b-versatile', 'openai/gpt-oss-20b', 'llama-3.1-8b-instant', 'meta-llama/llama-4-scout-17b-16e-instruct']) expect(isValidGroqModelId(ok), ok).toBe(true);
    for (const bad of ['', 'a b', 'a/b/c', '/b', 'a/', '-x', `a${'b'.repeat(100)}`, 5]) expect(isValidGroqModelId(bad), String(bad)).toBe(false);
    expect(normalizeGroqModel('openai/gpt-oss-20b')).toBe('openai/gpt-oss-20b');
    expect(normalizeGroqModel('a b')).toBe('qwen/qwen3.8-27b');
    expect(normalizeGroqModel(undefined)).toBe('qwen/qwen3.8-27b');
    expect(normalizeGroqModel('llama-3.3-70b-versatile')).toBe('qwen/qwen3.8-27b');
    expect(isPresetGroqModel('openai/gpt-oss-120b')).toBe(true);
    expect(isPresetGroqModel('openai/gpt-oss-20b')).toBe(false);
  });
  it('provider defaults to openrouter; only "anthropic" and "groq" switch', () => {
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
  state: { key: boolean; intro: boolean; epoch: number; savedKeys: string[]; saveOk: boolean; models: string[]; provider: AskProvider };
  /** answers the next prompt()s with these values */
  typed: (string | null)[];
  choices: string[];
  results: AskResult[];
  history: AskHistory;
  /** answers the next local() calls (null = not a local question) */
  locals: (LocalAnswer | null)[];
}

function rig(extra: Partial<AskDeps> = {}): Rig {
  const r = {
    log: [] as string[],
    prompts: [] as Rig['prompts'],
    queries: [] as Rig['queries'],
    state: { key: true, intro: true, epoch: 0, savedKeys: [] as string[], saveOk: true, models: [] as string[], provider: 'openrouter' as AskProvider },
    typed: [] as (string | null)[],
    choices: [] as string[],
    results: [] as AskResult[],
    locals: [] as (LocalAnswer | null)[],
  } as Rig;
  r.history = new AskHistory();
  const deps: AskDeps = {
    hasKey: () => r.state.key,
    introSeen: () => r.state.intro,
    markIntroSeen: () => { r.state.intro = true; r.log.push('introSeen'); },
    line: async (kind) => `line:${kind}`,
    prompt: async (text, opts) => { r.prompts.push({ text, opts }); r.log.push('prompt'); return r.typed.shift() ?? null; },
    say: async (t) => { r.log.push(`say:${t}`); },
    choose: async (t, actions, opts) => { r.log.push(`choose:${t}|${actions.map((a) => a.id).join(',')}${opts?.anim ? `|${opts.anim}` : ''}`); return r.choices.shift() ?? 'done'; },
    local: async (q) => { r.log.push(`local:${q}`); return r.locals.shift() ?? null; },
    think: () => { r.log.push('think'); return () => r.log.push('settle'); },
    query: async (q, turns) => { r.queries.push({ q, turns }); r.log.push('query'); return r.results.shift() ?? ok('default answer'); },
    saveKey: async (k) => { r.state.savedKeys.push(k); return r.state.saveOk; },
    removeKey: async () => { r.state.key = false; r.log.push('removeKey'); },
    setModel: (id) => { r.state.models.push(id); },
    provider: () => r.state.provider,
    epoch: () => r.state.epoch,
  };
  r.flow = new AskFlow({ ...deps, ...extra }, r.history);
  return r;
}

describe('AskFlow: asking', () => {
  it('prompts, thinks while waiting, shows the answer with Reply/Done, then goes idle on Done', async () => {
    const r = rig();
    r.typed.push('  what is rust?  ');
    r.results.push(ok('A language.'));
    await r.flow.ask();
    expect(r.log).toEqual(['prompt', 'local:what is rust?', 'think', 'query', 'settle', 'choose:A language.|reply,done']);
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
  it('no key: the question is typed first, then the key is asked for (secret prompt), then the same question goes out', async () => {
    const r = rig();
    r.state.key = false;
    r.typed.push('a question', '  sk-ant-abc  ');
    await r.flow.ask();
    expect(r.prompts[0]).toMatchObject({ text: 'line:prompt', opts: { secret: false } });
    expect(r.prompts[1]).toMatchObject({ text: 'line:keyPrompt', opts: { secret: true } });
    expect(r.state.savedKeys).toEqual(['sk-ant-abc']);
    expect(r.queries.map((q) => q.q)).toEqual(['a question']);
  });

  it('first run without a key: the intro line shows with the question prompt', async () => {
    const r = rig();
    r.state.key = false;
    r.state.intro = false;
    r.typed.push('a question', 'sk-ant-abc');
    await r.flow.ask();
    expect(r.prompts[0].text).toBe('line:intro');
    expect(r.log.filter((l) => l === 'introSeen')).toHaveLength(1);
  });

  it('cancelling or leaving the key blank stops without sending the question', async () => {
    const r = rig();
    r.state.key = false;
    r.typed.push('q', null);
    await r.flow.ask();
    expect(r.prompts).toHaveLength(2);
    expect(r.queries).toHaveLength(0);
    r.typed.push('q', '   ');
    await r.flow.ask();
    expect(r.state.savedKeys).toEqual([]);
    expect(r.queries).toHaveLength(0);
  });

  it('a failed keychain write is reported and stops', async () => {
    const r = rig();
    r.state.key = false;
    r.state.saveOk = false;
    r.typed.push('q', 'sk-ant-abc');
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

describe('AskFlow: other model (Groq)', () => {
  it('accepts a bare Groq id and a vendor id, stores them, and the prompt placeholder is not vendor/model-name', async () => {
    const r = rig();
    r.state.provider = 'groq';
    r.typed.push(' llama-3.3-70b-versatile ', 'openai/gpt-oss-20b');
    await r.flow.chooseModel();
    await r.flow.chooseModel();
    expect(r.state.models).toEqual(['llama-3.3-70b-versatile', 'openai/gpt-oss-20b']);
    expect(r.prompts[0].opts.placeholder).toBe('model-id');
  });
  it('OpenRouter still refuses a bare id', async () => {
    const r = rig();
    r.typed.push('llama-3.3-70b-versatile');
    await r.flow.chooseModel();
    expect(r.state.models).toEqual([]);
    expect(r.log).toContain('say:line:modelInvalid');
  });
  it('a Groq 429 or 413 is just said (no key re-entry), and a Groq 401 offers "Set key"', async () => {
    const r = rig();
    r.state.provider = 'groq';
    r.typed.push('q');
    r.results.push({ ok: false, failure: { kind: 'tooLong', message: 'too long' } });
    await r.flow.ask();
    expect(r.log).toContain('say:too long');
    const r2 = rig();
    r2.state.provider = 'groq';
    r2.typed.push('q');
    r2.results.push({ ok: false, failure: { kind: 'unauthorized', message: 'bad key' } });
    await r2.flow.ask();
    expect(r2.log).toContain('choose:bad key|key,done');
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

describe('AskFlow: local answers (intents)', () => {
  it('a local answer needs no key and no network: Reply/Done like an AI answer, with its animation', async () => {
    const r = rig();
    r.state.key = false;
    r.typed.push('who made you');
    r.locals.push({ reply: 'Annuai!', anim: 'Wave' });
    await r.flow.ask();
    expect(r.log).toEqual(['prompt', 'local:who made you', 'choose:Annuai!|reply,done|Wave']);
    expect(r.queries).toHaveLength(0);
    expect(r.prompts).toHaveLength(1); // no key prompt
    expect(r.flow.state).toBe('idle');
  });

  it('the first-run intro line still shows before a local answer, and counts as seen', async () => {
    const r = rig();
    r.state.key = false;
    r.state.intro = false;
    r.typed.push('help');
    r.locals.push({ reply: 'I can do things.' });
    await r.flow.ask();
    expect(r.prompts[0].text).toBe('line:intro');
    expect(r.state.intro).toBe(true);
  });

  it('the exchange joins the history, so an AI follow-up has the context', async () => {
    const r = rig();
    r.typed.push('who made you', 'and where is he from?');
    r.locals.push({ reply: 'Annuai built me.' });
    r.choices.push('reply', 'done');
    r.results.push(ok('Somewhere nice.'));
    await r.flow.ask();
    expect(r.queries).toHaveLength(1);
    expect(r.queries[0].turns).toEqual([{ role: 'user', text: 'who made you' }, { role: 'assistant', text: 'Annuai built me.' }]);
    expect(r.prompts[1].text).toBe('line:again');
  });

  it('passes the attribution on, and Done ends it', async () => {
    const r = rig();
    r.typed.push('quote');
    r.locals.push({ reply: 'Be kind.', attribution: 'Someone' });
    let seen: unknown;
    const orig = r.flow as unknown as { deps: AskDeps };
    const choose = orig.deps.choose;
    orig.deps.choose = async (t, a, o) => { seen = o; return choose(t, a, o); };
    await r.flow.ask();
    expect(seen).toEqual({ attribution: 'Someone', anim: undefined });
  });

  it('an answer with a follow-up says it, then acts, then ends the conversation (no Reply/Done)', async () => {
    const r = rig();
    r.typed.push('go away');
    r.locals.push({ reply: 'Bye!', after: async () => { r.log.push('after'); } });
    await r.flow.ask();
    expect(r.log).toEqual(['prompt', 'local:go away', 'say:Bye!', 'after']);
    expect(r.history.turns()).toEqual([{ role: 'user', text: 'go away' }, { role: 'assistant', text: 'Bye!' }]);
    expect(r.flow.state).toBe('idle');
  });

  it('a question that is not local behaves as before (key, thinking, query)', async () => {
    const r = rig();
    r.typed.push('why is the sky blue');
    r.locals.push(null);
    await r.flow.ask();
    expect(r.log).toEqual(['prompt', 'local:why is the sky blue', 'think', 'query', 'settle', 'choose:default answer|reply,done']);
  });

  it('a local follow-up works inside a running conversation', async () => {
    const r = rig();
    r.typed.push('why is the sky blue', 'tell me a joke');
    r.locals.push(null, { reply: 'A joke.' });
    r.choices.push('reply', 'done');
    await r.flow.ask();
    expect(r.queries).toHaveLength(1);
    expect(r.log[r.log.length - 1]).toBe('choose:A joke.|reply,done');
  });

  it('is dropped quietly when something else took over while it ran', async () => {
    const r = rig();
    r.typed.push('hide');
    r.locals.push({ reply: 'Bye!', after: async () => { r.log.push('after'); } });
    const orig = r.flow as unknown as { deps: AskDeps };
    const local = orig.deps.local!;
    orig.deps.local = async (q) => { const a = await local(q); r.state.epoch++; return a; };
    await r.flow.ask();
    expect(r.log).not.toContain('after');
  });
});

describe('AskFlow: the welcome guide offer', () => {
  const withGuide = () => {
    const opened: string[] = [];
    const r = rig({ openGuide: (start) => { opened.push(start); } });
    r.state.key = false;
    r.typed.push('what is rust?');
    return { r, opened };
  };
  it('offers to show how; "Show me how" opens the guide and never prompts for the key', async () => {
    const { r, opened } = withGuide();
    r.choices.push('guide');
    await r.flow.ask();
    expect(r.log).toContain('choose:line:keyOffer|guide,paste,done');
    expect(opened).toEqual(['key']);
    expect(r.prompts).toHaveLength(1); // only the question
    expect(r.queries).toHaveLength(0);
  });
  it('"I have a key" prompts for it as before, then sends the question', async () => {
    const { r, opened } = withGuide();
    r.choices.push('paste');
    r.typed.push('sk-or-x');
    await r.flow.ask();
    expect(opened).toEqual([]);
    expect(r.state.savedKeys).toEqual(['sk-or-x']);
    expect(r.queries).toHaveLength(1);
  });
  it('"Not now" ends the flow', async () => {
    const { r, opened } = withGuide();
    r.choices.push('done');
    await r.flow.ask();
    expect(opened).toEqual([]);
    expect(r.queries).toHaveLength(0);
    expect(r.flow.state).toBe('idle');
  });
  it('the menu "Set key" goes straight to the field', async () => {
    const { r } = withGuide();
    r.typed.length = 0;
    r.typed.push('sk-or-y');
    await r.flow.setKey();
    expect(r.log.some((l) => l.startsWith('choose:'))).toBe(false);
    expect(r.state.savedKeys).toEqual(['sk-or-y']);
  });
});
