// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContextMenu } from './contextMenu';
import type { MenuItem } from './contextMenu';

// On macOS the window is often not the active one, and then the web view gets no mouse-move events at all (macOS
// ignores the app's request to activate). So the menu is also driven by the cursor position the Rust poller reports.

const items: MenuItem[] = [
  { id: 'hi', label: 'Say hi' },
  { id: 'joke', label: 'Tell a joke' },
  { id: 'style', label: 'Style', children: [{ id: 'style-flat', label: 'Flat' }, { id: 'style-classic', label: 'Classic' }] },
];

function setup() {
  document.body.innerHTML = '<div id="stage"><div id="menu" class="menu hidden"></div></div>';
  const el = document.getElementById('menu') as HTMLElement;
  const onPick = vi.fn();
  const menu = new ContextMenu(el, onPick, () => undefined);
  menu.open(10, 10, items);
  const row = (id: string) => document.querySelector<HTMLElement>(`.item[data-id="${id}"]`) as HTMLElement;
  // jsdom has no layout: pretend the pointer is over whichever element we name.
  const pointOver = (target: Element | null) => {
    document.elementFromPoint = vi.fn(() => target);
    menu.pointAt(1, 1);
  };
  return { menu, row, pointOver, onPick };
}

afterEach(() => { document.body.innerHTML = ''; });

describe('menu driven by the reported cursor position', () => {
  it('highlights the row under the pointer', () => {
    const { row, pointOver } = setup();
    pointOver(row('joke').firstElementChild);
    expect(row('joke').classList.contains('active')).toBe(true);
    expect(row('hi').classList.contains('active')).toBe(false);
    pointOver(row('hi'));
    expect(row('hi').classList.contains('active')).toBe(true);
    expect(row('joke').classList.contains('active')).toBe(false);
  });

  it('moving off the rows clears the highlight', () => {
    const { row, pointOver } = setup();
    pointOver(row('joke'));
    pointOver(document.body);
    expect(document.querySelector('.item.active')).toBeNull();
  });

  it('pointing at a row with children opens its submenu', () => {
    const { row, pointOver } = setup();
    pointOver(row('style'));
    expect(row('style-flat')).not.toBeNull();
    expect(row('style-flat').parentElement?.classList.contains('hidden')).toBe(false);
  });

  it('does nothing when the menu is closed or the pointer is off the menu', () => {
    const { menu, row, pointOver } = setup();
    pointOver(document.body);
    expect(document.querySelector('.item.active')).toBeNull();
    menu.close();
    pointOver(row('hi'));
    expect(row('hi').classList.contains('active')).toBe(false);
  });

  it('pointing at the same row again does not re-trigger it', () => {
    const { row, pointOver } = setup();
    const enter = vi.fn();
    row('joke').addEventListener('mouseenter', enter);
    pointOver(row('joke'));
    pointOver(row('joke'));
    expect(enter).toHaveBeenCalledTimes(1);
  });
});
