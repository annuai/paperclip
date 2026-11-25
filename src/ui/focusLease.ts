/**
 * Who currently needs the window to be the key (active) window.
 *
 * The window is `focus: false`, so normally another app stays active. On macOS a web view in a non-key window gets no
 * hover (mouse-moved) events and never sees a blur when you click elsewhere. So the menu (hover highlight,
 * click-outside-to-close) and Ask Paperclip's text input (typing) each take a lease while open. The window takes focus
 * on the first lease and gives it back when the last one ends. The give-back is delayed a little, so a hand-over
 * (picking "Ask a question…" closes the menu, then the input opens) doesn't flicker focus away and back.
 */
export type LeaseHolder = 'menu' | 'prompt';

export const RELEASE_DELAY_MS = 150;

export class FocusLease {
  private readonly holders = new Set<LeaseHolder>();
  private focused = false;
  private releaseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly setFocus: (on: boolean) => Promise<void>) {}

  /** Resolves once the window has focus (for callers that then focus an input). */
  acquire(who: LeaseHolder): Promise<void> {
    this.holders.add(who);
    if (this.releaseTimer !== null) { clearTimeout(this.releaseTimer); this.releaseTimer = null; }
    if (this.focused) return Promise.resolve();
    this.focused = true;
    return this.setFocus(true).catch((e) => console.warn('focus failed', e));
  }

  release(who: LeaseHolder): void {
    if (!this.holders.delete(who) || this.holders.size > 0 || this.releaseTimer !== null) return;
    this.releaseTimer = setTimeout(() => {
      this.releaseTimer = null;
      if (this.holders.size > 0 || !this.focused) return;
      this.focused = false;
      this.setFocus(false).catch((e) => console.warn('unfocus failed', e));
    }, RELEASE_DELAY_MS);
  }

  held(who: LeaseHolder): boolean {
    return this.holders.has(who);
  }
}
