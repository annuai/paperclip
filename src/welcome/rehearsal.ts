// Phase 1 of the key screen: a clickable practice run inside the illustration. Nothing here is saved or sent.
import { COPY } from './copy';
import { REHEARSAL } from './flow';
import type { GuideState, RehearsalStep } from './flow';
import { explainerFrame } from './explainers';
import { PROVIDER_GUIDES } from './providers';
import type { Pt } from '../agent/eyeFollow';

const IDLE_MS = 4000;
const REPEAT_MS = 8000;
const MAX_DEMOS = 3;

export interface RehearsalOpts {
  reducedMotion: boolean;
  /** Where the host should look: the step being demonstrated or just clicked. */
  lookAt(p: Pt | null): void;
  paused(): boolean;
}

export interface Rehearsal {
  update(s: GuideState): void;
  destroy(): void;
}

export function renderRehearsal(el: HTMLElement, s: GuideState, onStep: (st: RehearsalStep) => void, opts: RehearsalOpts): Rehearsal {
  el.innerHTML = `${explainerFrame(s.provider, 'rehearse')}
    <ol class="steps">${COPY.key.stepNames.map((n, i) => `<li><i></i><span>${i + 1} · ${n}</span></li>`).join('')}</ol>
    <button type="button" class="textbtn replay" hidden>${COPY.key.playAgain}</button>`;
  const frame = el.querySelector('.film') as HTMLElement;
  const scene = el.querySelector('.scene') as HTMLElement;
  const cursor = scene.querySelector('.cursor') as SVGElement;
  const ring = scene.querySelector('.ring.aim') as HTMLElement;
  const replay = el.querySelector('.replay') as HTMLButtonElement;
  const targets = [...scene.querySelectorAll<HTMLButtonElement>('[data-step]')];
  let state = s;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let demos = 0;

  const target = () => targets.find((t) => t.dataset.step === state.rehearsal) ?? null;
  const pointAt = (t: HTMLElement) => {
    const box = scene.getBoundingClientRect();
    const r = t.getBoundingClientRect();
    const x = r.left - box.left + r.width * 0.6;
    const y = r.top - box.top + r.height / 2;
    cursor.style.transform = `translate(${x}px, ${y}px)`;
    ring.style.left = `${r.left - box.left + r.width / 2}px`;
    ring.style.top = `${y}px`;
    opts.lookAt({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  };
  const stop = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    scene.classList.remove('demo');
  };
  const demo = () => {
    const t = target();
    if (!t) return;
    if (opts.paused()) {
      arm(IDLE_MS);
      return;
    }
    scene.classList.remove('demo');
    void scene.offsetWidth; // restart the ring
    scene.classList.add('demo');
    pointAt(t);
    demos++;
    if (demos >= MAX_DEMOS) replay.hidden = false;
    else arm(REPEAT_MS);
  };
  const arm = (ms: number) => {
    if (timer !== null) clearTimeout(timer);
    timer = state.rehearsal === 'done' ? null : setTimeout(demo, ms);
  };

  const paint = () => {
    const at = state.rehearsal === 'done' ? REHEARSAL.length : REHEARSAL.indexOf(state.rehearsal);
    frame.dataset.at = String(at);
    for (const t of targets) {
      const current = t.dataset.step === state.rehearsal;
      t.disabled = !current;
      t.classList.toggle('current', current);
    }
    // Three bars for four clicks: copying half-fills the last one, pasting completes it.
    el.querySelectorAll<HTMLElement>('.steps li').forEach((li, i) => {
      li.style.setProperty('--fill', String(i === 0 ? Math.min(1, at) : i === 1 ? Math.min(1, Math.max(0, at - 1)) : Math.max(0, at - 2) / 2));
    });
    if (at >= REHEARSAL.length) {
      (scene.querySelector('.pkey') as HTMLElement).textContent = PROVIDER_GUIDES[state.provider].practiceKey;
    }
  };

  for (const t of targets) {
    t.addEventListener('click', () => {
      pointAt(t);
      stop();
      demos = 0;
      replay.hidden = true;
      onStep(t.dataset.step as RehearsalStep);
    });
  }
  replay.addEventListener('click', () => {
    demos = 0;
    replay.hidden = true;
    demo();
  });

  paint();
  arm(IDLE_MS);
  // With reduced motion the cursor does not travel: the stylesheet shows a still ring on the current target instead.
  if (opts.reducedMotion) frame.classList.add('still');

  return {
    update(next) {
      const moved = next.rehearsal !== state.rehearsal;
      state = next;
      if (!moved) return;
      paint();
      target()?.focus({ preventScroll: true });
      const t = target();
      if (t && opts.reducedMotion) pointAt(t);
      arm(IDLE_MS);
    },
    destroy() {
      stop();
      opts.lookAt(null);
    },
  };
}
