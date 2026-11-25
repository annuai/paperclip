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
