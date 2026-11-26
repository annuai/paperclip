// Everything the guide asks of the outside world, with a fake so the page also runs in a plain browser (?sandbox).
import { invoke } from '@tauri-apps/api/core';
import { emitTo } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { askKeyStatus, askQuestion } from '../platform/tauri';
import { normalizeAskProvider } from '../agent/ask';
import type { AskProvider, AskResult, FailureKind, Turn } from '../agent/ask';

export type ToMain = 'guide:ready' | 'guide:provider' | 'guide:style' | 'guide:finished';
/** Events the pet window sends to the guide. */
export const FROM_MAIN = ['guide:goto', 'guide:tray', 'guide:provider', 'guide:style'] as const;

export interface GuidePlatform {
  readonly sandbox: boolean;
  keyStatus(p: AskProvider): Promise<boolean>;
  saveKey(key: string, p: AskProvider): Promise<{ ok: true } | { ok: false; message: string }>;
  openKeyPage(p: AskProvider): Promise<boolean>;
  ask(q: string, history: Turn[], model: string | null, p: AskProvider): Promise<AskResult>;
  toMain(ev: ToMain, payload?: unknown): Promise<void>;
  onFromMain(cb: (ev: string, payload: unknown) => void): Promise<void>;
  onKeyChanged(cb: (p: AskProvider) => void): Promise<void>;
  close(): Promise<void>;
}

const quiet = async (label: string, fn: () => Promise<unknown>): Promise<boolean> => {
  try {
    await fn();
    return true;
  } catch (e) {
    console.warn(`${label} failed`, e);
    return false;
  }
};

function tauriPlatform(): GuidePlatform {
  const win = getCurrentWindow();
  return {
    sandbox: false,
    keyStatus: askKeyStatus,
    async saveKey(key, provider) {
      try {
        await invoke('ask_set_key', { key, provider });
        return { ok: true };
      } catch (e) {
        // Rust sends a fixed message; nothing is logged because the argument is a secret.
        return { ok: false, message: typeof e === 'string' ? e : '' };
      }
    },
    openKeyPage: (provider) => quiet('guide_open_key_page', () => invoke('guide_open_key_page', { provider })),
    ask: (q, history, model, p) => askQuestion(q, history, model ?? '', p), // an empty id means the provider's default
    async toMain(ev, payload) {
      await quiet(ev, () => emitTo('main', ev, payload));
    },
    async onFromMain(cb) {
      // Window-scoped listeners: our own messages to the pet never come back here.
      for (const ev of FROM_MAIN) await quiet(ev, () => win.listen(ev, (e) => cb(ev, e.payload)));
    },
    async onKeyChanged(cb) {
      await quiet('ask-key-changed', () => win.listen<string>('ask-key-changed', (e) => cb(normalizeAskProvider(e.payload))));
    },
    async close() {
      await quiet('close', () => win.close());
    },
  };
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Browser stand-in, steered by the query: fail=keychain|link, hasKey=1, ask=ok|<failure kind>. */
function fakePlatform(q: URLSearchParams): GuidePlatform {
  const saved = new Set<AskProvider>(q.get('hasKey') ? ['openrouter', 'groq', 'anthropic'] : []);
  const log = (...a: unknown[]) => console.info('[sandbox]', ...a);
  return {
    sandbox: true,
    keyStatus: async (p) => saved.has(p),
    async saveKey(_key, p) {
      await wait(400);
      if (q.get('fail') === 'keychain') return { ok: false, message: '' };
      saved.add(p);
      return { ok: true };
    },
    openKeyPage: async (p) => {
      log('open key page', p);
      return q.get('fail') !== 'link';
    },
    async ask() {
      await wait(900);
      const kind = q.get('ask') ?? 'ok';
      if (kind === 'ok') return { ok: true, answer: "Paperclips were patented in 1867. I'm a classic." };
      return { ok: false, failure: { kind: kind as FailureKind, message: `Sandbox: the provider said "${kind}".` } };
    },
    toMain: async (ev, payload) => log(ev, payload),
    onFromMain: async () => undefined,
    onKeyChanged: async () => undefined,
    close: async () => log('close'),
  };
}

export function createPlatform(q: URLSearchParams): GuidePlatform {
  return '__TAURI_INTERNALS__' in window ? tauriPlatform() : fakePlatform(q);
}
