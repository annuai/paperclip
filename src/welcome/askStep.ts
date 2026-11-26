// What the "Ask me something" screen shows for a result from the `ask` command (spec 6.6).
import type { AskProvider, AskResult } from '../agent/ask';
import { COPY } from './copy';

export type AskAction = 'retry' | 'fixKey' | 'otherService' | 'freeModel' | 'backToInput' | 'finish';
export type AskView =
  | { kind: 'input' }
  | { kind: 'thinking' }
  | { kind: 'answer'; text: string }
  | { kind: 'failure'; message: string; actions: AskAction[]; retryAfterMs: number };

const BUSY_WAIT_MS = 10_000;

export function viewFor(r: AskResult, provider: AskProvider): AskView {
  if (r.ok) return { kind: 'answer', text: r.answer };
  const { kind, message } = r.failure;
  const view = (actions: AskAction[], retryAfterMs = 0, text = message): AskView => ({ kind: 'failure', message: text, actions: [...actions, 'finish'], retryAfterMs });
  switch (kind) {
    case 'noKey':
      return view(['fixKey']);
    case 'unauthorized':
      return view(['fixKey'], 0, COPY.ask.unauthorized);
    case 'outOfCredits':
      return view(provider === 'openrouter' ? ['otherService', 'freeModel'] : ['otherService']);
    case 'badModel':
      return view(['freeModel']);
    case 'rateLimited':
    case 'overloaded':
      return view(['retry'], BUSY_WAIT_MS);
    case 'tooLong':
      return view(['backToInput']);
    case 'offline':
    case 'timeout':
    case 'refused':
    case 'empty':
    case 'other':
      return view(['retry']);
  }
}
