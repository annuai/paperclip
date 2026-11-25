import type { Pose, PropState } from '../anim/pose';
import { REQUIRED_IDS, svgFor } from './parts';
import type { Pose as PoseT } from '../anim/pose';
import { DEFAULT_STYLE } from './style';
import type { Style } from './style';

const VB = { x: -50, y: -40, w: 240, h: 290 };
const PROP_ANCHORS = {
  pencil: { x: 108, y: 120, rot: -30 },
  bulb: { x: 70, y: -14, rot: 0 },
  question: { x: 114, y: 22, rot: 0 },
  glass: { x: 114, y: 118, rot: 0 },
  sweat: { x: 112, y: 40, rot: 0 },
} as const;
type PropKey = 'pencil' | 'bulb' | 'question' | 'sparkles' | 'glass' | 'sweat';

const r = (n: number): string => String(Math.round(n * 1000) / 1000);

export class Renderer {
  private svg!: SVGSVGElement;
  private els: Record<string, SVGElement> = {};
  private inner!: Record<PropKey, SVGElement>;
  private shade: SVGElement | null = null;
  private readonly cache = new Map<Element, Map<string, string>>();
  private last: PoseT | null = null;
  private sleeping = false;
  private focusText: string | null = null;
  private current: Style;

  constructor(private readonly container: HTMLElement, style: Style = DEFAULT_STYLE, private readonly scope: HTMLElement = document.body) {
    this.current = style;
    this.mount();
  }

  get style(): Style {
    return this.current;
  }

  /** Swap the skin in place and re-apply the current pose (same frame: no flicker, no animation restart). */
  setStyle(style: Style): void {
    if (style === this.current) return;
    this.current = style;
    this.mount();
    if (this.last) this.render(this.last);
  }

  private mount(): void {
    this.scope.dataset.style = this.current;
    this.container.innerHTML = svgFor(this.current) + '<div class="zzz"><span>Z</span><span>Z</span><span>z</span></div>';
    this.cache.clear();
    this.svg = this.container.querySelector('svg') as SVGSVGElement;
    const get = (id: string) => this.svg.querySelector<SVGElement>('#' + id) as SVGElement;
    this.els = {};
    for (const id of REQUIRED_IDS) this.els[id] = get(id);
    this.shade = this.svg.querySelector<SVGElement>('#wireShade');
    const innerOf = (k: PropKey) => this.els[k].firstElementChild as SVGElement;
    this.inner = { pencil: innerOf('pencil'), bulb: innerOf('bulb'), question: innerOf('question'), sparkles: innerOf('sparkles'), glass: innerOf('glass'), sweat: innerOf('sweat') };
    this.setSleeping(this.sleeping);
    this.setFocus(this.focusText);
  }

  private set(el: Element, name: string, value: string): void {
    let m = this.cache.get(el);
    if (!m) { m = new Map(); this.cache.set(el, m); }
    if (m.get(name) === value) return;
    m.set(name, value);
    if (name === 'style:opacity') (el as SVGElement).style.opacity = value;
    else if (name === 'style:display') (el as SVGElement).style.display = value;
    else el.setAttribute(name, value);
  }

  render(p: Pose): void {
    this.last = p;
    const e = this.els;
    this.set(e.root, 'style:opacity', r(p.opacity));
    const b = p.body;
    const sq = Math.max(b.squash, 0.01);
    this.set(e.shadow, 'transform', `translate(70 206) scale(${r(b.scale * (1 / sq))} ${r(b.scale)}) translate(-70 -206)`);
    this.set(e.body, 'transform',
      `translate(${r(b.x)} ${r(b.y)}) translate(70 200) rotate(${r(-8 + b.tilt)}) scale(${r(b.scale / sq)} ${r(b.scale * sq)}) translate(-70 -200)`);
    const ey = p.eyes;
    this.set(e.eyes, 'transform', `translate(${r(71 + ey.x)} ${r(79 + ey.y)}) rotate(${r(ey.rot)}) scale(${r(ey.sx)} ${r(ey.sy)}) translate(-71 -79)`);
    this.set(e.pupilL, 'transform', `translate(${r(4.5 * p.pupils.x + 2.5 * p.pupils.conv)} ${r(5 * p.pupils.y)})`);
    this.set(e.pupilR, 'transform', `translate(${r(4.5 * p.pupils.x - 2.5 * p.pupils.conv)} ${r(5 * p.pupils.y)})`);
    this.set(e.lidL, 'height', r(28 * p.lids.l));
    this.set(e.lidR, 'height', r(28 * p.lids.r));
    this.set(e.browL, 'transform', `translate(57 ${r(58 + p.browL.lift)}) rotate(${r(p.browL.angle)})`);
    this.set(e.browR, 'transform', `translate(85 ${r(56 + p.browR.lift)}) rotate(${r(-p.browR.angle)})`);
    for (const k of ['pencil', 'bulb', 'question', 'sparkles', 'glass', 'sweat'] as PropKey[]) this.renderProp(k, p.props[k]);
    // Flat skin: the single hard shade run drifts with body tilt so the form still reads as an object.
    if (this.shade) this.set(this.shade, 'transform', `translate(${r(p.body.tilt * 0.08)} 0)`);
    this.renderMouth(p.mouth);
    this.renderMat(p.mat);
  }

  private renderMouth(v: number): void {
    const el = this.els.mouth;
    this.set(el, 'style:display', v < 0.02 ? 'none' : '');
    if (v >= 0.02) this.set(el, 'transform', `translate(71 106) scale(${r(0.6 + 0.4 * v)} ${r(v)})`);
  }

  private renderMat(m: Pose['mat']): void {
    const outer = this.els.mat;
    const vis = m.visible >= 0.01 && m.scale > 0.005;
    this.set(outer, 'style:display', vis ? '' : 'none');
    this.set(outer, 'opacity', r(Math.min(1, Math.max(0, m.visible))));
    if (!vis) return;
    const u = Math.min(1, Math.max(0, m.unroll));
    const s = Math.max(m.scale, 0);
    this.set(this.els.matInner, 'transform',
      `translate(${r(m.x)} ${r(m.y)}) translate(70 222) rotate(${r(m.rot)}) scale(${r(s)} ${r(s * m.squash)}) translate(-70 -222)`);
    this.set(this.els.matSheet, 'transform', `translate(-30 0) scale(${r(Math.max(u, 0.001))} 1) translate(30 0)`);
    this.set(this.els.matSheet, 'style:display', u < 0.02 ? 'none' : '');
    const k = 1 - u;
    this.set(this.els.matRoll, 'style:display', k < 0.03 ? 'none' : '');
    this.set(this.els.matRoll, 'transform', `translate(${r(-30 + u * 200)} 0) translate(0 212) scale(${r(k)} 1) translate(0 -212)`);
  }

  /** On-screen eye centres in window logical px (stage origin), following body/eye transforms in any skin. */
  eyeCentres(): { l: { x: number; y: number }; r: { x: number; y: number } } {
    const stage = (this.container.closest('#stage') ?? document.body) as HTMLElement;
    const sr = stage.getBoundingClientRect();
    const m = (this.els.eyes as unknown as SVGGraphicsElement).getScreenCTM();
    const map = (x: number, y: number) => {
      const pt = m ? new DOMPoint(x, y).matrixTransform(m) : new DOMPoint(x, y);
      return { x: pt.x - sr.left, y: pt.y - sr.top };
    };
    return { l: map(57, 80), r: map(85, 78) };
  }

  setSleeping(on: boolean): void {
    this.sleeping = on;
    this.container.querySelector('.zzz')?.classList.toggle('on', on);
  }

  /** Focus timer prop on the mat: the whole minutes left as text, or null to put it away. */
  setFocus(minutes: string | null): void {
    this.focusText = minutes;
    const el = this.els.focusTimer;
    if (!el) return;
    el.style.display = minutes === null ? 'none' : '';
    if (minutes !== null && this.els.focusLabel) this.els.focusLabel.textContent = minutes;
  }

  private renderProp(k: PropKey, s: PropState): void {
    const outer = this.els[k];
    const visible = s.v >= 0.01;
    this.set(outer, 'style:display', visible ? '' : 'none');
    this.set(outer, 'opacity', r(Math.min(1, Math.max(0, s.v))));
    if (!visible) return;
    const sc = r(0.6 + 0.4 * s.v);
    if (k === 'sparkles') {
      this.set(this.inner[k], 'transform', `translate(${r(s.x)} ${r(s.y)}) translate(70 40) rotate(${r(s.rot)}) scale(${sc}) translate(-70 -40)`);
    } else {
      const a = PROP_ANCHORS[k];
      this.set(this.inner[k], 'transform', `translate(${r(a.x + s.x)} ${r(a.y + s.y)}) rotate(${r(a.rot + s.rot)}) scale(${sc})`);
    }
  }

  private rel(rect: DOMRect, pad: number): DOMRect {
    const stage = (this.container.closest('#stage') ?? document.body) as HTMLElement;
    const sr = stage.getBoundingClientRect();
    return new DOMRect(rect.left - sr.left - pad, rect.top - sr.top - pad, rect.width + pad * 2, rect.height + pad * 2);
  }

  /** Tight box around the drawn wire in its current pose, in CSS px relative to #stage (+6 px pad). */
  characterRect(): DOMRect {
    return this.rel(this.els.wireOutline.getBoundingClientRect(), 6);
  }

  /** The mat's neutral footprint (top face + thickness), in CSS px relative to #stage. */
  matRect(): DOMRect {
    const cr = this.svg.getBoundingClientRect();
    const sx = cr.width / VB.w;
    const sy = cr.height / VB.h;
    const x0 = -34, x1 = 174, y0 = 190, y1 = 237; // viewBox units
    return this.rel(new DOMRect(cr.left + (x0 - VB.x) * sx, cr.top + (y0 - VB.y) * sy, (x1 - x0) * sx, (y1 - y0) * sy), 0);
  }
}
