// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachInteraction } from './interaction';
import { Renderer } from '../art/renderer';
import { characterHitTarget } from './interactionTarget';

const detachers: (() => void)[] = [];
afterEach(() => { while (detachers.length) detachers.pop()!(); }); // window listeners must not leak between tests

function setup() {
  document.body.innerHTML = '<div id="character"></div>';
  const host = document.getElementById('character') as HTMLElement;
  const renderer = new Renderer(host, 'classic');
  const startDragging = vi.fn(() => Promise.resolve());
  const handlers = { click: vi.fn(), doubleClick: vi.fn(), tripleClick: vi.fn(), middleClick: vi.fn(), openAsk: vi.fn(), contextMenu: vi.fn(), dragStart: vi.fn(), matTap: vi.fn() };
  detachers.push(attachInteraction(characterHitTarget(host), handlers, startDragging));
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
    vi.useFakeTimers();
    const { host, renderer, handlers } = setup();
    renderer.setStyle('flat');
    renderer.setStyle('classic');
    const svg = host.querySelector('svg') as SVGSVGElement;
    svg.dispatchEvent(new MouseEvent('contextmenu', { clientX: 10, clientY: 10, bubbles: true, cancelable: true }));
    vi.advanceTimersByTime(500); // the menu waits 0.4 s for a possible second right click
    expect(handlers.contextMenu).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
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

describe('middle click', () => {
  const mid = (el: Element, x = 50, y = 50) => {
    el.dispatchEvent(new MouseEvent('mousedown', { button: 1, clientX: x, clientY: y, bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { button: 1, clientX: x, clientY: y, bubbles: true }));
  };
  it('on the clip calls middleClick() once the double-click window has passed, and nothing else', () => {
    vi.useFakeTimers();
    const { host, handlers } = setup();
    mid(host.querySelector('#wire') as SVGElement);
    expect(handlers.middleClick).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(handlers.middleClick).toHaveBeenCalledTimes(1);
    expect(handlers.openAsk).not.toHaveBeenCalled();
    expect(handlers.click).not.toHaveBeenCalled();
    expect(handlers.doubleClick).not.toHaveBeenCalled();
    expect(handlers.tripleClick).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
  it('double middle click opens Ask Paperclip instead of a quote', () => {
    vi.useFakeTimers();
    const { host, handlers } = setup();
    const wire = host.querySelector('#wire') as SVGElement;
    mid(wire);
    vi.advanceTimersByTime(120);
    mid(wire);
    vi.advanceTimersByTime(1000);
    expect(handlers.openAsk).toHaveBeenCalledTimes(1);
    expect(handlers.middleClick).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
  it('two slow middle clicks are two quotes', () => {
    vi.useFakeTimers();
    const { host, handlers } = setup();
    const wire = host.querySelector('#wire') as SVGElement;
    mid(wire);
    vi.advanceTimersByTime(600);
    mid(wire);
    vi.advanceTimersByTime(600);
    expect(handlers.middleClick).toHaveBeenCalledTimes(2);
    expect(handlers.openAsk).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
  it('on the mat does nothing', () => {
    vi.useFakeTimers();
    const { host, handlers } = setup();
    mid(host.querySelector('#mat') as SVGGElement);
    vi.advanceTimersByTime(1000);
    vi.useRealTimers();
    expect(handlers.middleClick).not.toHaveBeenCalled();
    expect(handlers.matTap).not.toHaveBeenCalled();
  });
  it('does not fire if the pointer moved away between press and release', () => {
    const { host, handlers } = setup();
    const wire = host.querySelector('#wire') as SVGElement;
    wire.dispatchEvent(new MouseEvent('mousedown', { button: 1, clientX: 50, clientY: 50, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { button: 1, clientX: 90, clientY: 90, bubbles: true }));
    expect(handlers.middleClick).not.toHaveBeenCalled();
  });
  it('never starts a drag', () => {
    const { host, startDragging } = setup();
    const wire = host.querySelector('#wire') as SVGElement;
    wire.dispatchEvent(new MouseEvent('mousedown', { button: 1, clientX: 50, clientY: 50, bubbles: true }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 80, clientY: 80, bubbles: true }));
    expect(startDragging).not.toHaveBeenCalled();
  });
});

describe('right click twice', () => {
  const rc = (el: EventTarget, x = 50, y = 50) =>
    el.dispatchEvent(new MouseEvent('contextmenu', { button: 2, clientX: x, clientY: y, bubbles: true, cancelable: true }));
  it('one right click opens the menu after the 0.4 s wait, not before', () => {
    vi.useFakeTimers();
    const { host, handlers } = setup();
    rc(host.querySelector('#wire') as SVGElement);
    vi.advanceTimersByTime(390);
    expect(handlers.contextMenu).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20);
    expect(handlers.contextMenu).toHaveBeenCalledTimes(1);
    expect(handlers.contextMenu).toHaveBeenCalledWith(50, 50);
    expect(handlers.openAsk).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
  it('a second right click within 0.4 s opens Ask Paperclip and the menu never opens', () => {
    vi.useFakeTimers();
    const { host, handlers } = setup();
    const wire = host.querySelector('#wire') as SVGElement;
    rc(wire);
    vi.advanceTimersByTime(200);
    rc(wire, 54, 52);
    vi.advanceTimersByTime(1000);
    expect(handlers.openAsk).toHaveBeenCalledTimes(1);
    expect(handlers.contextMenu).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
  it('a slow second right click just opens the menu again', () => {
    vi.useFakeTimers();
    const { host, handlers } = setup();
    const wire = host.querySelector('#wire') as SVGElement;
    rc(wire);
    vi.advanceTimersByTime(1500);
    rc(wire);
    vi.advanceTimersByTime(800);
    expect(handlers.contextMenu).toHaveBeenCalledTimes(2);
    expect(handlers.openAsk).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
  it('a trackpad-paced second right click that lands on the open menu still opens Ask', () => {
    vi.useFakeTimers();
    const { host, handlers } = setup();
    const menu = document.createElement('div');
    menu.className = 'menu';
    document.body.append(menu);
    rc(host.querySelector('#wire') as SVGElement);
    vi.advanceTimersByTime(700); // the menu is open under the pointer by now
    rc(menu, 53, 55);
    vi.advanceTimersByTime(1000);
    expect(handlers.openAsk).toHaveBeenCalledTimes(1);
    expect(handlers.contextMenu).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
  it('a right click on the menu long afterwards, or somewhere else, does nothing', () => {
    vi.useFakeTimers();
    const { host, handlers } = setup();
    const menu = document.createElement('div');
    menu.className = 'menu';
    document.body.append(menu);
    const wire = host.querySelector('#wire') as SVGElement;
    rc(wire);
    vi.advanceTimersByTime(1500);
    rc(menu);
    rc(wire, 50, 50);
    vi.advanceTimersByTime(600);
    rc(menu, 150, 160);
    vi.advanceTimersByTime(1000);
    expect(handlers.openAsk).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
  it('a quick second right click far away is a fresh menu, not Ask', () => {
    vi.useFakeTimers();
    const { host, handlers } = setup();
    const wire = host.querySelector('#wire') as SVGElement;
    rc(wire);
    vi.advanceTimersByTime(100);
    rc(wire, 120, 160);
    vi.advanceTimersByTime(1000);
    expect(handlers.openAsk).not.toHaveBeenCalled();
    expect(handlers.contextMenu).toHaveBeenCalledTimes(1);
    expect(handlers.contextMenu).toHaveBeenCalledWith(120, 160);
    vi.useRealTimers();
  });
});
