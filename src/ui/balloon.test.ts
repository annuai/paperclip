// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Balloon } from './balloon';

function setup() {
  const el = document.createElement('div');
  el.innerHTML = '<div class="balloon-text"></div>';
  document.body.append(el);
  const vis: boolean[] = [];
  const b = new Balloon(el, (v) => vis.push(v));
  return { el, b, vis };
}
const ACTIONS = [{ id: 'drank', label: 'Drank some' }, { id: 'later', label: 'Later' }];

describe('Balloon actions', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('renders buttons and resolves with the chosen action id', async () => {
    const { el, b } = setup();
    const p = b.speak('Hydration check!', undefined, ACTIONS);
    await vi.advanceTimersByTimeAsync(1000);
    const btns = el.querySelectorAll<HTMLButtonElement>('.balloon-actions button');
    expect([...btns].map((x) => x.textContent)).toEqual(['Drank some', 'Later']);
    btns[0].click();
    expect(await p).toBe('drank');
    expect(b.visible).toBe(false);
  });

  it('does not auto-hide while showing actions, and a 2 minute timeout resolves done', async () => {
    const { b } = setup();
    let result: string | null = null;
    void b.speak('Drink!', undefined, ACTIONS).then((r) => (result = r));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(result).toBeNull();
    expect(b.visible).toBe(true);
    await vi.advanceTimersByTimeAsync(61_000);
    expect(result).toBe('done');
  });

  it('clicking the body of an action balloon does not dismiss it', async () => {
    const { el, b } = setup();
    let result: string | null = null;
    void b.speak('Drink!', undefined, ACTIONS).then((r) => (result = r));
    await vi.advanceTimersByTimeAsync(1000);
    el.click();
    await vi.advanceTimersByTimeAsync(10);
    expect(result).toBeNull();
  });

  it('close() resolves closed; plain balloons still auto-hide with done', async () => {
    const a = setup();
    const p = a.b.speak('x', undefined, ACTIONS);
    await vi.advanceTimersByTimeAsync(500);
    a.b.close();
    expect(await p).toBe('closed');
    const c = setup();
    const q = c.b.speak('Hello');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await q).toBe('done');
  });

  it('buttons are keyboard focusable', async () => {
    const { el, b } = setup();
    void b.speak('Drink!', undefined, ACTIONS);
    await vi.advanceTimersByTimeAsync(1000);
    for (const btn of el.querySelectorAll<HTMLButtonElement>('.balloon-actions button')) {
      expect(btn.tabIndex).toBeGreaterThanOrEqual(0);
      expect(btn.type).toBe('button');
    }
  });
});

describe('Balloon prompt (Ask Paperclip input)', () => {
  function setupPrompt() {
    const el = document.createElement('div');
    el.innerHTML = '<div class="balloon-text"></div>';
    document.body.append(el);
    const vis: boolean[] = [];
    const focus: boolean[] = [];
    const b = new Balloon(el, (v) => vis.push(v), { onPrompt: (a) => focus.push(a) });
    const input = () => el.querySelector<HTMLInputElement>('input.balloon-input');
    const key = (k: string, init: KeyboardEventInit = {}) => input()?.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
    return { el, b, vis, focus, input, key };
  }

  it('shows the text and a focused input, asks for keyboard focus, and Enter resolves with the typed text', async () => {
    const { el, b, vis, focus, input, key } = setupPrompt();
    const p = b.prompt('What is on your mind?', { placeholder: 'Type your question' });
    expect(el.querySelector('.balloon-text')?.textContent).toContain('What is on your mind?');
    expect(input()?.type).toBe('text');
    expect(input()?.placeholder).toBe('Type your question');
    expect(document.activeElement).toBe(input());
    expect(focus).toEqual([true]);
    expect(b.visible).toBe(true);
    input()!.value = 'hello';
    key('Enter');
    expect(await p).toBe('hello');
    expect(focus).toEqual([true, false]); // focus handed back
    expect(b.visible).toBe(false);
    await Promise.resolve();
    expect(vis).toContain(false);
  });

  it('Escape cancels with null', async () => {
    const { b, input, key } = setupPrompt();
    const p = b.prompt('Q?', {});
    input()!.value = 'draft';
    key('Escape');
    expect(await p).toBeNull();
  });

  it('a blank Enter keeps the input open; IME composition Enter does not submit', async () => {
    const { b, input, key } = setupPrompt();
    let done = false;
    void b.prompt('Q?', {}).then(() => (done = true));
    key('Enter');
    input()!.value = 'こん';
    key('Enter', { isComposing: true });
    await Promise.resolve();
    expect(done).toBe(false);
    expect(b.visible).toBe(true);
  });

  it('secret prompts use a password field that never autocompletes', () => {
    const { input, b } = setupPrompt();
    void b.prompt('Key?', { secret: true, maxLength: 50 });
    expect(input()?.type).toBe('password');
    expect(input()?.autocomplete).toBe('off');
    expect(input()?.maxLength).toBe(50);
  });

  it('the Send button submits; clicking the balloon body does not dismiss it', async () => {
    const { el, b, input } = setupPrompt();
    const p = b.prompt('Q?', {});
    el.click();
    expect(b.visible).toBe(true);
    input()!.value = 'via button';
    el.querySelector<HTMLButtonElement>('button.balloon-send')!.click();
    expect(await p).toBe('via button');
  });

  it('close() (an interrupt) resolves null and releases focus; a new prompt replaces an old one', async () => {
    const { b, focus } = setupPrompt();
    const p = b.prompt('Q?', {});
    b.close();
    expect(await p).toBeNull();
    expect(focus).toEqual([true, false]);
    const first = b.prompt('A?', {});
    void b.prompt('B?', {});
    expect(await first).toBeNull();
  });

  it('does not auto-dismiss while waiting for input', async () => {
    vi.useFakeTimers();
    try {
      const { b } = setupPrompt();
      void b.prompt('Q?', {});
      await vi.advanceTimersByTimeAsync(300_000);
      expect(b.visible).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
