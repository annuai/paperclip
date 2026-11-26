// "Get your key": practise on the illustration, then do it for real and save to the keychain.
import type { AskProvider } from '../agent/ask';
import { MAX_KEY_CHARS } from '../agent/ask';
import type { ScreenContext, ScreenView } from './context';
import { COPY } from './copy';
import { button, el } from './dom';
import { explainerFrame } from './explainers';
import { markKeySaved, rehearse, setProvider, skipRehearsal } from './flow';
import type { RehearsalStep } from './flow';
import { PROVIDER_GUIDES, keyCheckMessage, keyLooksRight } from './providers';
import { renderRehearsal } from './rehearsal';
import type { Rehearsal } from './rehearsal';

const ORDER: AskProvider[] = ['openrouter', 'groq', 'anthropic'];
const BALLOON: Record<RehearsalStep | 'done', string> = {
  signIn: COPY.key.practiseFirst,
  createKey: COPY.key.createKey,
  copy: COPY.key.copy,
  paste: COPY.key.paste,
  done: COPY.key.practised,
};

export function mountKeyScreen(root: HTMLElement, c: ScreenContext): ScreenView {
  const k = COPY.key;
  const tabs = el('div', 'tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'AI service');
  const body = el('div', 'keybody');
  body.setAttribute('role', 'tabpanel');
  root.append(tabs, body);

  let rehearsal: Rehearsal | null = null;
  let shown = ''; // provider + phase + saved state currently in the DOM
  let replacing = false;
  let justSaved: AskProvider | null = null;

  const tabButtons = ORDER.map((p) => {
    const t = button('tab', PROVIDER_GUIDES[p].tab, () => choose(p));
    t.setAttribute('role', 'tab');
    t.addEventListener('keydown', (e) => {
      const by = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!by) return;
      e.preventDefault();
      const next = ORDER[(ORDER.indexOf(p) + by + ORDER.length) % ORDER.length];
      choose(next);
      tabButtons[ORDER.indexOf(next)].focus();
    });
    tabs.append(t);
    return t;
  });

  function choose(p: AskProvider): void {
    if (p === c.get().provider) return;
    replacing = false;
    c.set(setProvider(c.get(), p));
    void c.platform.toMain('guide:provider', { provider: p });
  }

  const fieldBusy = () => {
    const i = body.querySelector('input');
    return !!i && (document.activeElement === i || i.value !== '');
  };

  function practise(): void {
    const s = c.get();
    body.textContent = '';
    const stageBox = el('div', 'rehearsal');
    const onward = button('btn', 'Now for real ›', () => c.set(skipRehearsal(c.get())));
    onward.hidden = s.rehearsal !== 'done';
    const skip = button('textbtn', k.skipPractice, () => c.set(skipRehearsal(c.get())));
    skip.hidden = s.rehearsal === 'done';
    const row = el('div', 'under');
    row.append(onward, skip, el('span', 'note', PROVIDER_GUIDES[s.provider].note));
    body.append(stageBox, row);
    rehearsal = renderRehearsal(stageBox, s, (step) => {
      const after = rehearse(c.get(), step);
      c.set(after);
      if (after.rehearsal === 'done') {
        onward.hidden = false;
        skip.hidden = true;
        onward.focus();
        void c.stage.play('Congratulate');
      }
    }, { reducedMotion: c.reducedMotion, lookAt: (pt) => c.stage.lookAt(pt), paused: () => document.documentElement.classList.contains('paused') });
  }

  function forReal(): void {
    const s = c.get();
    const p = s.provider;
    const g = PROVIDER_GUIDES[p];
    body.textContent = '';
    const summary = el('div', 'summarybox');
    summary.innerHTML = explainerFrame(p, 'summary');
    const heading = el('h2', 'forreal', k.forReal);
    const msg = el('div', 'msg');
    msg.setAttribute('role', 'status');
    const open = button('btn ink', `${k.open} ↗`, () => {
      msg.className = 'msg';
      msg.textContent = '';
      void c.platform.openKeyPage(p).then((ok) => {
        if (ok) return;
        msg.className = 'msg bad';
        msg.textContent = '';
        msg.append(`${k.browserFailed} `, el('span', 'select', g.host));
      });
    });
    const openRow = el('div', 'under');
    openRow.append(open, el('span', 'note', k.online));
    body.append(summary, heading, openRow);

    if (s.keySaved[p] && !replacing) {
      const saved = el('div', 'savedline');
      saved.append(el('span', '', justSaved === p ? `✓ ${k.saved}` : `You already have ${/^[AEIOU]/.test(g.name) ? 'an' : 'a'} ${g.name} key saved.`));
      saved.append(button('textbtn', k.replace, () => {
        replacing = true;
        shown = '';
        view.update();
        body.querySelector('input')?.focus();
      }));
      body.append(saved, msg, el('p', 'note', g.note));
      return;
    }

    const label = el('label', 'fieldlabel', k.yourKey);
    label.htmlFor = 'keyfield';
    const field = el('div', 'field');
    const input = el('input');
    input.id = 'keyfield';
    input.type = 'password';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('autocorrect', 'off');
    input.maxLength = MAX_KEY_CHARS;
    input.placeholder = g.placeholder;
    const eye = button('eye', 'Show', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      eye.textContent = show ? 'Hide' : 'Show';
      eye.setAttribute('aria-label', show ? k.hide : k.show);
    });
    eye.setAttribute('aria-label', k.show);
    const save = button('save', k.save, () => void submit(false));
    save.disabled = true;
    field.append(input, eye, save);

    let saving = false;
    const submit = async (anyway: boolean): Promise<void> => {
      const raw = input.value;
      const check = keyLooksRight(p, raw);
      if (check === 'empty' || saving) return;
      msg.className = 'msg bad';
      msg.textContent = '';
      if (check === 'invalid' || check === 'practice') {
        msg.textContent = keyCheckMessage(p, check) ?? '';
        return;
      }
      if (check === 'unexpectedPrefix' && !anyway) {
        msg.append(el('span', '', keyCheckMessage(p, check) ?? ''), button('textbtn', k.saveAnyway, () => void submit(true)),
          button('textbtn', k.fixIt, () => { msg.textContent = ''; input.focus(); input.select(); }));
        return;
      }
      saving = true;
      save.disabled = true;
      const result = await c.platform.saveKey(raw.trim(), p);
      saving = false;
      if (!input.isConnected) {
        if (result.ok) c.set(markKeySaved(c.get(), p));
        return;
      }
      if (!result.ok) {
        save.disabled = false;
        msg.textContent = c.get().platform === 'linux' ? `${k.keychainRefused} ${k.linuxKeyring}` : result.message.startsWith("That doesn't") ? result.message : k.keychainRefused;
        return;
      }
      input.value = '';
      replacing = false;
      justSaved = p;
      void c.stage.play('Congratulate');
      c.announce(k.saved);
      shown = '';
      c.set(markKeySaved(c.get(), p));
    };
    input.addEventListener('input', () => {
      save.disabled = !input.value.trim();
      msg.textContent = '';
      pause();
    });
    input.addEventListener('focus', pause);
    input.addEventListener('blur', pause);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        void submit(false);
      }
    });
    body.append(label, field, msg, el('p', 'note', `${g.note} ${k.noKeyNeeded}`));
  }

  // The loops rest while a key is being typed (and whenever the window is in the background).
  function pause(): void {
    queueMicrotask(() => document.documentElement.classList.toggle('paused', document.hidden || !document.hasFocus() || fieldBusy()));
  }

  const view: ScreenView = {
    update() {
      const s = c.get();
      ORDER.forEach((p, i) => {
        const on = p === s.provider;
        tabButtons[i].setAttribute('aria-selected', String(on));
        tabButtons[i].tabIndex = on ? 0 : -1;
      });
      c.say(s.keyPhase === 'real' ? k.forRealBalloon : BALLOON[s.rehearsal]);
      const sig = `${s.provider}|${s.keyPhase}|${s.keySaved[s.provider]}`;
      if (sig !== shown) {
        shown = sig;
        rehearsal?.destroy();
        rehearsal = null;
        if (s.keyPhase === 'rehearse') practise();
        else forReal();
        pause();
      } else rehearsal?.update(s);
    },
    destroy() {
      rehearsal?.destroy();
      document.documentElement.classList.toggle('paused', document.hidden || !document.hasFocus());
      c.stage.lookAt(null);
    },
  };
  return view;
}
