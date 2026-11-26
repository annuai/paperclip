import type { BalloonAction, BalloonLike, PromptOpts } from '../agent/agent';

/** Auto-dismiss for balloons that show action buttons (treated as 'done'; the reminder maps it to Later). */
export const ACTION_TIMEOUT_MS = 120_000;

const CHAR_MS = 22;
const FADE_MS = 150;

export class Balloon implements BalloonLike {
  private readonly textEl: HTMLElement;
  private isVisible = false;
  private typing = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private finish: ((r: string) => void) | null = null;
  private hasActions = false;
  private skip: (() => void) | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private prompting = false;
  private input: HTMLInputElement | null = null;

  /** `onPrompt(true)` fires when a text input opens (the host must take keyboard focus), `false` when it closes. */
  constructor(
    private readonly el: HTMLElement,
    private readonly onVisibility: (v: boolean) => void,
    private readonly hooks: { onPrompt?: (active: boolean) => void } = {},
  ) {
    this.textEl = el.querySelector('.balloon-text') as HTMLElement;
    el.addEventListener('mousedown', (e) => e.stopPropagation());
    // Drawn × close affordance (visible in the Flat style only; see styles.css).
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'balloon-close';
    close.setAttribute('aria-label', 'Close speech bubble');
    close.innerHTML = '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2 2 L10 10 M10 2 L2 10" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      this.end('closed');
    });
    el.append(close);
    el.addEventListener('click', () => {
      if (!this.isVisible || this.prompting) return; // an open input waits for Enter / Esc
      if (this.typing) this.skip?.();
      else if (!this.hasActions) this.end('closed'); // action balloons wait for a button
    });
  }

  get visible(): boolean {
    return this.isVisible;
  }

  /** `sticky` keeps the line up until it is replaced or closed (the welcome guide's instructions). */
  speak(text: string, attribution?: string, actions?: BalloonAction[], opts: { sticky?: boolean } = {}): Promise<string> {
    this.end('closed', true);
    this.hasActions = !!actions?.length;
    return new Promise<string>((resolve) => {
      this.finish = resolve;
      if (this.hideTimer !== null) { clearTimeout(this.hideTimer); this.hideTimer = null; }
      this.textEl.textContent = '';
      const shown = document.createElement('span');
      const rest = document.createElement('span');
      rest.className = 'rest';
      rest.textContent = text;
      this.textEl.append(shown, rest);
      let attrEl: HTMLElement | null = null;
      if (attribution) {
        attrEl = document.createElement('div');
        attrEl.className = 'attr pending';
        attrEl.textContent = '— ' + attribution;
        this.textEl.append(attrEl);
      }
      let actionsEl: HTMLElement | null = null;
      if (actions?.length) {
        actionsEl = document.createElement('div');
        actionsEl.className = 'balloon-actions pending';
        actions.forEach((a, i) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = i === 0 ? 'primary' : 'secondary';
          btn.textContent = a.label;
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.end(a.id);
          });
          actionsEl?.append(btn);
        });
        this.textEl.append(actionsEl);
      }
      this.el.classList.remove('hidden', 'fading');
      this.isVisible = true;
      this.typing = true;
      requestAnimationFrame(() => this.onVisibility(true));

      let i = 0;
      const complete = () => {
        if (!this.typing) return;
        this.typing = false;
        if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
        shown.textContent = text;
        rest.textContent = '';
        attrEl?.classList.remove('pending');
        actionsEl?.classList.remove('pending');
        const hold = actionsEl ? ACTION_TIMEOUT_MS : Math.min(12000, Math.max(3000, 1500 + 60 * text.length));
        if (!opts.sticky) this.timer = setTimeout(() => this.end('done'), hold);
      };
      this.skip = complete;
      if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
        complete(); // reduced motion: no typewriter, show the text immediately
        return;
      }
      const tick = () => {
        if (!this.typing) return;
        i++;
        while (i < text.length && /\s/.test(text[i - 1])) i++; // whitespace rides with the next char
        shown.textContent = text.slice(0, i);
        rest.textContent = text.slice(i);
        if (i >= text.length) complete();
        else this.timer = setTimeout(tick, CHAR_MS);
      };
      this.timer = setTimeout(tick, CHAR_MS);
    });
  }

  /**
   * A single-line input under the text. Enter sends (blank is ignored), Esc or close() cancels with null.
   * No typewriter and no auto-dismiss: it waits for the user. The host is told to take keyboard focus via `onPrompt`.
   */
  prompt(text: string, opts: PromptOpts = {}): Promise<string | null> {
    this.end('closed', true);
    this.hasActions = true;
    this.prompting = true;
    return new Promise<string | null>((resolve) => {
      let value: string | null = null;
      this.finish = () => resolve(value);
      if (this.hideTimer !== null) { clearTimeout(this.hideTimer); this.hideTimer = null; }
      this.textEl.textContent = '';
      const line = document.createElement('span');
      line.textContent = text;
      const row = document.createElement('div');
      row.className = 'balloon-ask';
      const input = document.createElement('input');
      input.className = 'balloon-input';
      input.type = opts.secret ? 'password' : 'text';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.setAttribute('autocapitalize', 'off');
      input.setAttribute('autocorrect', 'off');
      input.setAttribute('aria-label', opts.placeholder ?? text);
      if (opts.placeholder) input.placeholder = opts.placeholder;
      if (opts.maxLength) input.maxLength = opts.maxLength;
      const send = document.createElement('button');
      send.type = 'button';
      send.className = 'balloon-send primary';
      send.textContent = 'Send';
      const submit = () => {
        if (!input.value.trim()) return; // a blank line is not an answer; Esc cancels
        value = input.value;
        this.end('submit');
      };
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.isComposing) return; // Enter while composing (IME) only commits the composition
        if (e.key === 'Enter') { e.preventDefault(); submit(); }
        else if (e.key === 'Escape') { e.preventDefault(); this.end('cancel'); }
      });
      send.addEventListener('click', (e) => { e.stopPropagation(); submit(); });
      row.append(input, send);
      this.textEl.append(line, row);
      this.input = input;
      this.el.classList.remove('hidden', 'fading');
      this.isVisible = true;
      this.typing = false;
      requestAnimationFrame(() => this.onVisibility(true));
      this.hooks.onPrompt?.(true);
      input.focus();
    });
  }

  /** Re-focus the input (after the window itself has been given keyboard focus). */
  focusInput(): void {
    this.input?.focus();
  }

  /** Abandons an open input (null result). No-op for any other balloon. */
  cancelPrompt(): void {
    if (this.prompting) this.end('cancel');
  }

  close(): void {
    this.end('closed');
  }

  private end(result: string, immediate = false): void {
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    this.typing = false;
    this.skip = null;
    if (this.prompting) {
      this.prompting = false;
      this.input = null;
      this.hooks.onPrompt?.(false);
    }
    const fin = this.finish;
    this.finish = null;
    if (this.isVisible) {
      this.isVisible = false;
      if (immediate) {
        this.el.classList.add('hidden');
      } else {
        this.el.classList.add('fading');
        this.hideTimer = setTimeout(() => {
          this.hideTimer = null;
          if (!this.isVisible) this.el.classList.add('hidden');
        }, FADE_MS);
      }
      this.onVisibility(false);
    }
    fin?.(result);
  }
}
