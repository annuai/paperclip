// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { REQUIRED_IDS, PAPERCLIP_SVG_CLASSIC, PAPERCLIP_SVG_FLAT } from './parts';
import { Renderer } from './renderer';
import { NEUTRAL, mergePose } from '../anim/pose';

const idsOf = (svg: string) => new Set([...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

describe('skins', () => {
  it('both skins expose every id the renderer uses', () => {
    for (const svg of [PAPERCLIP_SVG_CLASSIC, PAPERCLIP_SVG_FLAT]) {
      const ids = idsOf(svg);
      for (const id of REQUIRED_IDS) expect(ids.has(id), id).toBe(true);
    }
  });
  it('both skins have the glass prop for the Drink animation', () => {
    for (const svg of [PAPERCLIP_SVG_CLASSIC, PAPERCLIP_SVG_FLAT]) expect(idsOf(svg).has('glass')).toBe(true);
    expect((REQUIRED_IDS as readonly string[]).includes('glass')).toBe(true);
  });
  it('props keep the inner <g> the renderer transforms', () => {
    for (const svg of [PAPERCLIP_SVG_CLASSIC, PAPERCLIP_SVG_FLAT]) {
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
      for (const id of ['pencil', 'bulb', 'question', 'sparkles', 'glass', 'sweat']) {
        expect(doc.getElementById(id)?.firstElementChild?.tagName).toBe('g');
      }
    }
  });
  it('flat skin has no gradients, filters or outline-only paths', () => {
    expect(PAPERCLIP_SVG_FLAT).not.toMatch(/Gradient|<filter|blur/i);
  });
});

describe('Renderer.setStyle', () => {
  const pose = mergePose(NEUTRAL, { body: { tilt: 10, squash: 1.1 }, lids: { l: 0.5, r: 0.5 }, mouth: 1, props: { bulb: { v: 1 } } });
  it('re-applies the current pose after swapping the skin', () => {
    const c = document.createElement('div');
    document.body.append(c);
    const r = new Renderer(c, 'classic');
    r.render(pose);
    const before = c.querySelector('#body')?.getAttribute('transform');
    expect(before).toContain('rotate(2)');
    r.setStyle('flat');
    expect(r.style).toBe('flat');
    expect(document.body.dataset.style).toBe('flat');
    expect(c.querySelector('#wireShade')).not.toBeNull();
    expect(c.querySelector('#body')?.getAttribute('transform')).toBe(before);
    expect(c.querySelector('#lidL')?.getAttribute('height')).toBe('14');
    expect((c.querySelector('#bulb') as SVGElement).style.display).toBe('');
    r.setStyle('classic');
    expect(c.querySelector('#wireShade')).toBeNull();
    expect(c.querySelector('#body')?.getAttribute('transform')).toBe(before);
  });
  it('keeps the sleeping Zs state across a style swap', () => {
    const c = document.createElement('div');
    const r = new Renderer(c, 'classic');
    r.setSleeping(true);
    r.setStyle('flat');
    expect(c.querySelector('.zzz')?.classList.contains('on')).toBe(true);
  });
});
