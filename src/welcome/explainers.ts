// Our own drawings: the four gesture explainers and the illustrated key page. Static trusted markup only.
import { WIRE_PATH } from '../art/parts';
import { COPY } from './copy';
import type { Lesson, LessonState } from './flow';
import { PROVIDER_GUIDES } from './providers';
import type { AskProvider } from '../agent/ask';

export type GestureLesson = 'click' | 'doubleClick' | 'drag' | 'contextMenu';

const MINI = `<svg class="mini" viewBox="25 5 90 205" width="26" height="58" aria-hidden="true"><path class="mini-wire" d="${WIRE_PATH}" fill="none" stroke-width="12" stroke-linecap="round"/><ellipse cx="57" cy="80" rx="13" ry="15" fill="#F4F1EA"/><ellipse cx="85" cy="78" rx="13" ry="15" fill="#F4F1EA"/><g class="mini-pupils" fill="#18202E"><circle cx="57" cy="80" r="6"/><circle cx="85" cy="78" r="6"/></g></svg>`;
export const CURSOR = '<svg class="cursor" viewBox="0 0 22 26" width="22" height="26" aria-hidden="true"><path d="M2 2 L2 21 L7.5 16.5 L11 24 L15 22 L11.5 15 L19 14.5 Z" fill="#F4F1EA" stroke="#18202E" stroke-width="2" stroke-linejoin="round"/></svg>';
export const CHAIN_CLIP = `<svg viewBox="25 5 90 205" width="17" height="38" aria-hidden="true"><path d="${WIRE_PATH}" fill="none" stroke="currentColor" stroke-width="18" stroke-linecap="round"/></svg>`;
const TICK = '<span class="tick" aria-hidden="true"><svg viewBox="0 0 12 12" width="11" height="11"><path d="M2 6.5 L5 9.5 L10 3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';

const ART: Record<GestureLesson, string> = {
  click: `${MINI}${CURSOR}<i class="ring"></i>`,
  doubleClick: `${MINI}${CURSOR}<i class="ring"></i><i class="ring second"></i><em class="ha">Ha!</em>`,
  drag: `<div class="mover">${MINI}${CURSOR}</div>`,
  contextMenu: `${MINI}${CURSOR}<i class="ring"></i><div class="minimenu"><u></u><u></u><u></u></div>`,
};

export function gestureTile(l: GestureLesson, state: LessonState, active: boolean): string {
  const t = COPY.try.tiles[l];
  const cls = ['tile', `g-${l}`, state, active ? 'active' : ''].filter(Boolean).join(' ');
  const note = state === 'skipped' ? '<span class="skipnote">skipped</span>' : '';
  return `<div class="${cls}" data-lesson="${l}"><div class="art" aria-hidden="true">${ART[l]}</div><b>${t.title}</b><small>${t.caption}</small>${state === 'done' ? TICK : ''}${note}<span class="sr">${state === 'done' ? 'Done' : active ? 'Current lesson' : ''}</span></div>`;
}

/** Static pictograms for the three menu rows. */
export const ROW_ART: Record<Extract<Lesson, 'menuPick' | 'askBox' | 'tray'>, string> = {
  menuPick: '<svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true"><rect x="4" y="4" width="20" height="20" rx="4" fill="#18202E"/><rect x="8" y="9" width="12" height="3" rx="1.5" fill="#F4F1EA"/><rect x="8" y="14" width="12" height="3" rx="1.5" fill="#F2B33D"/><rect x="8" y="19" width="8" height="3" rx="1.5" fill="#F4F1EA"/></svg>',
  askBox: '<svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true"><path d="M5 5 H23 A2 2 0 0 1 25 7 V17 A2 2 0 0 1 23 19 H17 L14 24 L11 19 H5 A2 2 0 0 1 3 17 V7 A2 2 0 0 1 5 5 Z" fill="#18202E"/><rect x="7" y="10" width="14" height="4" rx="2" fill="#F2B33D"/></svg>',
  tray: `<svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true"><rect x="2" y="7" width="24" height="14" rx="3" fill="#18202E"/><g transform="translate(9.5 8.5) scale(0.075) translate(-25 -5)"><path d="${WIRE_PATH}" fill="none" stroke="#F2B33D" stroke-width="20" stroke-linecap="round"/></g></svg>`,
};

/**
 * The illustrated key page. 'rehearse' has real buttons for each beat; 'summary' is the finished frame.
 * It is deliberately our own layout: no provider logo, colours or screenshots.
 */
export function explainerFrame(p: AskProvider, mode: 'rehearse' | 'summary'): string {
  const g = PROVIDER_GUIDES[p];
  const k = COPY.key;
  const bar = `<div class="url"><span>${g.host}</span><span class="tag">${k.illustration}</span></div>`;
  if (mode === 'summary') {
    return `<div class="film summary">${bar}<ol class="reallist">${g.steps.map((s) => `<li>${s}</li>`).join('')}</ol></div>`;
  }
  return `<div class="film">${bar}<div class="scene">
    <b class="title">${k.keysTitle}</b>
    <button type="button" class="make" data-step="createKey">${g.createLabel}</button>
    <div class="keyrow"><span>${g.keyRow}</span><button type="button" class="chip" data-step="copy">${k.copyButton}</button></div>
    <button type="button" class="practice" data-step="paste"><span class="plabel">${k.practiceLabel}</span><span class="pkey">${k.practiceField}</span></button>
    <div class="signin"><span>${g.signInTitle}</span><button type="button" data-step="signIn">${k.signInButton}</button></div>
    <i class="ring aim"></i>${CURSOR}
  </div></div>`;
}
