// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { attachInteraction } from './interaction';
import { Renderer } from '../art/renderer';
import { characterHitTarget } from './interactionTarget';

function setup() {
  document.body.innerHTML = '<div id="character"></div>';
  const host = document.getElementById('character') as HTMLElement;
  const renderer = new Renderer(host, 'classic');
  const startDragging = vi.fn(() => Promise.resolve());
  const handlers = { click: vi.fn(), doubleClick: vi.fn(), contextMenu: vi.fn(), dragStart: vi.fn(), matTap: vi.fn() };
  attachInteraction(characterHitTarget(host), handlers, startDragging);
  return { host, renderer, startDragging, handlers };
}

function drag(host: HTMLElement) {
  const svg = host.querySelector('svg') as SVGSVGElement;
  svg.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 50, clientY: 50, bubbles: true }));
  window.dispatchEvent(new MouseEvent('mousemove', { clientX: 70, clientY: 70, bubbles: true }));
}

describe('interaction survives style switching', () => {
  it('drags before switching style', () => {
    const { host, startDragging } = setup();
    drag(host);
    expect(startDragging).toHaveBeenCalledTimes(1);
  });

  it('still drags after switching to flat (the SVG is replaced)', () => {
    const { host, renderer, startDragging, handlers } = setup();
    renderer.setStyle('flat');
    drag(host);
    expect(startDragging).toHaveBeenCalledTimes(1);
    expect(handlers.dragStart).toHaveBeenCalledTimes(1);
  });

  it('tapping the mat bounces him immediately on every tap, without click/joke reactions', () => {
    vi.useFakeTimers();
    const { host, handlers } = setup();
    const mat = host.querySelector('#mat') as SVGGElement;
    for (let i = 1; i <= 3; i++) {
      mat.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 5, clientY: 5, detail: i, bubbles: true }));
      mat.dispatchEvent(new MouseEvent('mouseup', { button: 0, clientX: 5, clientY: 5, detail: i, bubbles: true }));
      if (i === 2) mat.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    }
    vi.advanceTimersByTime(1000);
    expect(handlers.matTap).toHaveBeenCalledTimes(3);
    expect(handlers.click).not.toHaveBeenCalled();
    expect(handlers.doubleClick).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('clicking the clip itself still gives a click reaction, not a bounce', () => {
    vi.useFakeTimers();
    const { host, handlers } = setup();
    const wire = host.querySelector('#wire') as SVGElement;
    wire.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 5, clientY: 5, detail: 1, bubbles: true }));
    wire.dispatchEvent(new MouseEvent('mouseup', { button: 0, clientX: 5, clientY: 5, detail: 1, bubbles: true }));
    vi.advanceTimersByTime(1000);
    expect(handlers.click).toHaveBeenCalledTimes(1);
    expect(handlers.matTap).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('still opens the context menu after switching back to classic', () => {
    const { host, renderer, handlers } = setup();
    renderer.setStyle('flat');
    renderer.setStyle('classic');
    const svg = host.querySelector('svg') as SVGSVGElement;
    svg.dispatchEvent(new MouseEvent('contextmenu', { clientX: 10, clientY: 10, bubbles: true, cancelable: true }));
    expect(handlers.contextMenu).toHaveBeenCalledTimes(1);
  });
});
