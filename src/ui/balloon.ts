import type { BalloonAction, BalloonLike } from '../agent/agent';

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

  constructor(private readonly el: HTMLElement, private readonly onVisibility: (v: boolean) => void) {
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
      if (!this.isVisible) return;
      if (this.typing) this.skip?.();
      else if (!this.hasActions) this.end('closed'); // action balloons wait for a button
    });
  }

  get visible(): boolean {
    return this.isVisible;
  }

  speak(text: string, attribution?: string, actions?: BalloonAction[]): Promise<string> {
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
        this.timer = setTimeout(() => this.end('done'), hold);
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

  close(): void {
    this.end('closed');
  }

  private end(result: string, immediate = false): void {
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
    this.typing = false;
    this.skip = null;
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
