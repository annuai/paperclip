import type { BalloonAction, PromptOpts } from './agent';

/** The two models Ask Paperclip may use (Rust enforces the same list; anything else becomes the default). */
export type AskModel = 'claude-haiku-5-5' | 'claude-sonnet-5-5';
export const ASK_MODELS: AskModel[] = ['claude-haiku-5-5', 'claude-sonnet-5-5'];
export const DEFAULT_ASK_MODEL: AskModel = 'claude-haiku-5-5';
export function normalizeAskModel(v: unknown): AskModel {
  return ASK_MODELS.find((m) => m === v) ?? DEFAULT_ASK_MODEL;
}

/** Exchanges (question + answer) kept in memory and sent along as context. */
export const MAX_EXCHANGES = 6;
export const MAX_QUESTION_CHARS = 500;
export const MAX_KEY_CHARS = 300;

export interface Turn { role: 'user' | 'assistant'; text: string }

export type FailureKind = 'noKey' | 'unauthorized' | 'rateLimited' | 'overloaded' | 'offline' | 'timeout' | 'refused' | 'empty' | 'other';
export interface AskFailure { kind: FailureKind; message: string }
export type AskResult = { ok: true; answer: string } | { ok: false; failure: AskFailure };

/** The conversation lives only here, in memory: never saved, cleared when he is hidden or the key is removed. */
export class AskHistory {
  private exchanges: [string, string][] = [];
  add(question: string, answer: string): void {
    this.exchanges.push([question, answer]);
    if (this.exchanges.length > MAX_EXCHANGES) this.exchanges.splice(0, this.exchanges.length - MAX_EXCHANGES);
  }
  turns(): Turn[] {
    return this.exchanges.flatMap(([q, a]): Turn[] => [{ role: 'user', text: q }, { role: 'assistant', text: a }]);
  }
  clear(): void {
    this.exchanges = [];
  }
}

export type AskLine = 'intro' | 'prompt' | 'again' | 'keyPrompt' | 'keySaved' | 'keyRemoved' | 'keyFailed';

export interface AskDeps {
  hasKey(): boolean;
  introSeen(): boolean;
  markIntroSeen(): void;
  /** A line of his voice for the given moment (content JSON). */
  line(kind: AskLine): Promise<string>;
  /** Shows an input in the balloon; resolves with the typed text, or null on Esc / interrupt. */
  prompt(text: string, opts: PromptOpts): Promise<string | null>;
  say(text: string): Promise<void>;
  choose(text: string, actions: BalloonAction[]): Promise<string>;
  /** Starts the thinking animation; the returned function stops it (safe to call even if it never started). */
  think(): () => void;
  query(question: string, turns: Turn[]): Promise<AskResult>;
  saveKey(key: string): Promise<boolean>;
  removeKey(): Promise<void>;
  /** Bumped by the host whenever something else takes over (a click, a hide, another feature). */
  epoch(): number;
}

export type AskState = 'idle' | 'keyEntry' | 'asking' | 'waiting' | 'answered';

/**
 * The Ask Paperclip conversation as a small state machine:
 *   idle -> (keyEntry) -> asking -> waiting -> answered -> asking ... -> idle
 * It never touches the DOM or the network itself; main.ts supplies those through AskDeps.
 * A newer ask() or any epoch change makes an older flow drop out quietly (its late answer is discarded).
 */
export class AskFlow {
  state: AskState = 'idle';
  private run = 0;

  constructor(private readonly deps: AskDeps, private readonly history: AskHistory) {}

  /** Starts (or restarts) a conversation: key first if there is none, then question / answer rounds. */
  async ask(): Promise<void> {
    const run = ++this.run;
    const epoch = this.deps.epoch();
    const stale = () => run !== this.run || this.deps.epoch() !== epoch;
    try {
      if (!this.deps.hasKey() && !(await this.enterKey(stale, false))) return;
      let pending: string | null = null; // a question that still needs sending after a key fix
      let first = true;
      while (!stale()) {
        let question: string | null = pending;
        pending = null;
        if (question === null) {
          this.state = 'asking';
          const kind: AskLine = !this.deps.introSeen() ? 'intro' : first ? 'prompt' : 'again';
          const text = await this.deps.line(kind);
          if (kind === 'intro') this.deps.markIntroSeen();
          const typed = await this.deps.prompt(text, { secret: false, maxLength: MAX_QUESTION_CHARS, placeholder: 'Type your question' });
          first = false;
          if (stale()) return;
          question = typed?.trim().slice(0, MAX_QUESTION_CHARS) ?? '';
          if (!question) return; // Esc, or nothing typed
        }
        this.state = 'waiting';
        const stopThinking = this.deps.think();
        let result: AskResult;
        try {
          result = await this.deps.query(question, this.history.turns());
        } finally {
          stopThinking();
        }
        if (stale()) return;
        if (result.ok) {
          this.history.add(question, result.answer);
          this.state = 'answered';
          const choice = await this.deps.choose(result.answer, [{ id: 'reply', label: 'Reply' }, { id: 'done', label: 'Done' }]);
          if (stale() || choice !== 'reply') return;
          continue;
        }
        const { kind, message } = result.failure;
        if (kind === 'noKey' || kind === 'unauthorized') {
          const choice = await this.deps.choose(message, [{ id: 'key', label: 'Set key' }, { id: 'done', label: 'Done' }]);
          if (stale() || choice !== 'key') return;
          if (!(await this.enterKey(stale, false))) return;
          pending = question; // the same question goes out again with the new key
          continue;
        }
        await this.deps.say(message);
        return;
      }
    } finally {
      if (run === this.run) this.state = 'idle';
    }
  }

  /** Menu: "Set Claude API key…" on its own (no question afterwards). */
  async setKey(): Promise<void> {
    const run = ++this.run;
    const epoch = this.deps.epoch();
    try {
      await this.enterKey(() => run !== this.run || this.deps.epoch() !== epoch, true);
    } finally {
      if (run === this.run) this.state = 'idle';
    }
  }

  /** Menu: "Remove API key". Also forgets the conversation. */
  async removeKey(): Promise<void> {
    this.run++;
    this.history.clear();
    await this.deps.removeKey();
    await this.deps.say(await this.deps.line('keyRemoved'));
    this.state = 'idle';
  }

  /** He was hidden (or the app is quitting): forget the conversation and let any running flow drop out. */
  reset(): void {
    this.run++;
    this.history.clear();
    this.state = 'idle';
  }

  private async enterKey(stale: () => boolean, confirm: boolean): Promise<boolean> {
    this.state = 'keyEntry';
    const text = await this.deps.line('keyPrompt');
    // The key prompt already says that only typed text goes to Claude, so it counts as the first-run line too.
    if (!this.deps.introSeen()) this.deps.markIntroSeen();
    const typed = await this.deps.prompt(text, { secret: true, maxLength: MAX_KEY_CHARS, placeholder: 'Paste your API key' });
    if (stale()) return false;
    const key = typed?.trim() ?? '';
    if (!key) return false;
    if (!(await this.deps.saveKey(key))) {
      if (!stale()) await this.deps.say(await this.deps.line('keyFailed'));
      return false;
    }
    if (stale()) return false;
    if (confirm) await this.deps.say(await this.deps.line('keySaved'));
    return true;
  }
}
