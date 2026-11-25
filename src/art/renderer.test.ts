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

describe('focus timer prop', () => {
  it('both skins draw it on the mat, hidden by default, with a label', () => {
    for (const svg of [PAPERCLIP_SVG_CLASSIC, PAPERCLIP_SVG_FLAT]) {
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
      const t = doc.getElementById('focusTimer');
      expect(t?.getAttribute('style')).toContain('display:none');
      expect(doc.getElementById('matSheet')?.contains(t ?? null)).toBe(true);
      expect(doc.getElementById('focusLabel')?.tagName).toBe('text');
    }
  });
  it('setFocus shows the minutes, hides on null and survives a style swap', () => {
    const c = document.createElement('div');
    document.body.append(c);
    const r = new Renderer(c, 'classic');
    const shown = () => (c.querySelector('#focusTimer') as SVGElement).style.display !== 'none';
    expect(shown()).toBe(false);
    r.setFocus('24');
    expect(shown()).toBe(true);
    expect(c.querySelector('#focusLabel')?.textContent).toBe('24');
    r.setStyle('flat');
    expect(shown()).toBe(true);
    expect(c.querySelector('#focusLabel')?.textContent).toBe('24');
    r.setFocus(null);
    expect(shown()).toBe(false);
  });
  it('a three-digit label (timers go up to 180 minutes) shrinks to fit the dial, and grows back', () => {
    const c = document.createElement('div');
    document.body.append(c);
    const r = new Renderer(c, 'classic');
    const size = () => c.querySelector('#focusLabel')?.getAttribute('font-size');
    r.setFocus('25');
    expect(size()).toBe('12');
    r.setFocus('180');
    expect(size()).toBe('9');
    r.setStyle('flat');
    expect(size()).toBe('10');
    r.setFocus('99');
    expect(size()).toBe('13');
  });
  it('flat timer uses only palette tokens (no gradients)', () => {
    const t = PAPERCLIP_SVG_FLAT.slice(PAPERCLIP_SVG_FLAT.indexOf('id="focusTimer"'), PAPERCLIP_SVG_FLAT.indexOf('</text>'));
    const hexes = new Set((t.match(/#[0-9A-Fa-f]{6}/g) ?? []).map((h) => h.toUpperCase()));
    for (const h of hexes) expect(['#18202E', '#E5705A', '#F4F1EA'], h).toContain(h);
    expect(t).not.toMatch(/url\(|Gradient|stroke="#/);
  });
});
