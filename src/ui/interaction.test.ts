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
  const handlers = { click: vi.fn(), doubleClick: vi.fn(), tripleClick: vi.fn(), contextMenu: vi.fn(), dragStart: vi.fn(), matTap: vi.fn() };
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

  describe('multi-click on the clip', () => {
    const click = (el: Element) => {
      el.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 5, clientY: 5, bubbles: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { button: 0, clientX: 5, clientY: 5, bubbles: true }));
    };
    const wireOf = (host: HTMLElement) => host.querySelector('#wire') as SVGElement;

    it('single click: only click(), after the delay', () => {
      vi.useFakeTimers();
      const { host, handlers } = setup();
      click(wireOf(host));
      expect(handlers.click).not.toHaveBeenCalled();
      vi.advanceTimersByTime(300);
      expect(handlers.click).toHaveBeenCalledTimes(1);
      expect(handlers.doubleClick).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('double click: a joke after the short wait, and no click', () => {
      vi.useFakeTimers();
      const { host, handlers } = setup();
      click(wireOf(host));
      vi.advanceTimersByTime(100);
      click(wireOf(host));
      expect(handlers.doubleClick).not.toHaveBeenCalled(); // still waiting for a possible third click
      vi.advanceTimersByTime(300);
      expect(handlers.doubleClick).toHaveBeenCalledTimes(1);
      expect(handlers.click).not.toHaveBeenCalled();
      expect(handlers.tripleClick).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('triple click: only tripleClick(), the pending joke and click are cancelled', () => {
      vi.useFakeTimers();
      const { host, handlers } = setup();
      for (let i = 0; i < 3; i++) { click(wireOf(host)); vi.advanceTimersByTime(80); }
      vi.advanceTimersByTime(1000);
      expect(handlers.tripleClick).toHaveBeenCalledTimes(1);
      expect(handlers.doubleClick).not.toHaveBeenCalled();
      expect(handlers.click).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('a fourth click starts a new gesture', () => {
      vi.useFakeTimers();
      const { host, handlers } = setup();
      for (let i = 0; i < 4; i++) { click(wireOf(host)); vi.advanceTimersByTime(80); }
      vi.advanceTimersByTime(1000);
      expect(handlers.tripleClick).toHaveBeenCalledTimes(1);
      expect(handlers.click).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
    });

    it('slow clicks are separate single clicks', () => {
      vi.useFakeTimers();
      const { host, handlers } = setup();
      click(wireOf(host));
      vi.advanceTimersByTime(600);
      click(wireOf(host));
      vi.advanceTimersByTime(600);
      expect(handlers.click).toHaveBeenCalledTimes(2);
      expect(handlers.doubleClick).not.toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('mat taps never count toward a triple click', () => {
      vi.useFakeTimers();
      const { host, handlers } = setup();
      const mat = host.querySelector('#mat') as SVGGElement;
      click(wireOf(host));
      click(mat);
      click(mat);
      click(wireOf(host));
      vi.advanceTimersByTime(1000);
      expect(handlers.matTap).toHaveBeenCalledTimes(2);
      expect(handlers.tripleClick).not.toHaveBeenCalled();
      expect(handlers.doubleClick).toHaveBeenCalledTimes(1); // the two clip clicks
      vi.useRealTimers();
    });

    it('a drag in the middle cancels the gesture', () => {
      vi.useFakeTimers();
      const { host, handlers } = setup();
      click(wireOf(host));
      drag(host);
      vi.advanceTimersByTime(1000);
      expect(handlers.click).not.toHaveBeenCalled();
      expect(handlers.tripleClick).not.toHaveBeenCalled();
      vi.useRealTimers();
    });
  });
});
