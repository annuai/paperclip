// "Ask me something": a real question to the chosen provider, or offline chips when there is no key.
import { AskHistory, MAX_QUESTION_CHARS, providerName } from '../agent/ask';
import type { ScreenContext, ScreenView } from './context';
import { COPY } from './copy';
import { button, el } from './dom';
import { goto, markAsked, setDraft } from './flow';
import { viewFor } from './askStep';
import type { AskAction } from './askStep';

export function mountAskScreen(root: HTMLElement, c: ScreenContext): ScreenView {
  const a = COPY.ask;
  const history = new AskHistory(); // one conversation, in memory only
  let alive = true;
  let busy = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let shown = '';

  const body = el('div', 'askbody');
  root.append(body);

  function offline(): void {
    body.textContent = '';
    c.say(a.noKey);
    const chips = el('div', 'chips');
    for (const kind of ['joke', 'quote', 'tip'] as const) {
      chips.append(button('chipbtn', a.offline[kind], () => {
        void c.content.next(kind).then((item) => {
          if (!alive) return;
          c.interject(item.text, item.attribution);
          void c.stage.play('Congratulate');
          c.set(markAsked(c.get()));
        });
      }));
    }
    body.append(chips, button('textbtn', a.addKey, () => c.set(goto(c.get(), 'key'))));
  }

  function input(): void {
    body.textContent = '';
    c.say(history.turns().length ? "What else would you like to know?" : a.balloon);
    void c.stage.play('Explain');
    const form = el('form', 'field');
    const box = el('input');
    box.type = 'text';
    box.maxLength = MAX_QUESTION_CHARS;
    box.placeholder = a.placeholder;
    box.setAttribute('aria-label', a.placeholder);
    box.value = c.get().draftQuestion;
    const send = el('button', 'save', a.send);
    send.type = 'submit';
    form.append(box, send);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = box.value.trim();
      if (!q) return;
      c.set(setDraft(c.get(), q));
      void ask(q, c.model());
    });
    const chips = el('div', 'chips');
    for (const text of a.chips) {
      chips.append(button('chipbtn', text, () => {
        box.value = text;
        box.focus();
      }));
    }
    body.append(form, chips, el('p', 'note', a.privacy.replace('{provider}', providerName(c.get().provider))));
    box.focus({ preventScroll: true });
  }

  async function ask(q: string, model: string): Promise<void> {
    if (busy) return;
    busy = true;
    const provider = c.get().provider;
    body.textContent = '';
    c.say('Let me think…');
    const thinking = c.stage.play('Thinking');
    body.append(el('p', 'note', q));
    const result = await c.platform.ask(q, history.turns(), model, provider);
    busy = false;
    void thinking;
    if (!alive) return;
    const v = viewFor(result, provider);
    body.textContent = '';
    if (v.kind === 'answer') {
      history.add(q, v.text);
      c.say(v.text);
      void c.stage.play('Congratulate');
      c.set(markAsked(setDraft(c.get(), '')));
      c.announce(v.text);
      const row = el('div', 'under');
      row.append(button('btn ink', a.again, input));
      body.append(row);
      return;
    }
    if (v.kind !== 'failure') return;
    void c.stage.play('Noticed');
    c.say(v.message);
    c.announce(v.message);
    const row = el('div', 'under wrap');
    for (const action of v.actions) {
      const b = button(action === 'finish' ? 'textbtn' : 'btn ink', a.actions[action], () => run(action, q, model));
      if (action === 'retry' && v.retryAfterMs) {
        b.disabled = true;
        retryTimer = setTimeout(() => { b.disabled = false; }, v.retryAfterMs);
      }
      row.append(b);
    }
    body.append(row);
  }

  function run(action: AskAction, q: string, model: string): void {
    if (action === 'finish') c.finish();
    else if (action === 'retry') void ask(q, model);
    else if (action === 'freeModel') void ask(q, ''); // the provider's default (free) model
    else if (action === 'backToInput') input();
    else c.set(goto(c.get(), 'key')); // fixKey, otherService
  }

  const view: ScreenView = {
    update() {
      const s = c.get();
      const sig = `${s.provider}|${s.keySaved[s.provider]}`;
      if (sig === shown) return;
      shown = sig;
      if (s.keySaved[s.provider]) input();
      else offline();
    },
    destroy() {
      alive = false;
      if (retryTimer !== null) clearTimeout(retryTimer);
    },
  };
  return view;
}
