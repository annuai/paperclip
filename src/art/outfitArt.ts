import type { Style } from './style';
import type { OutfitName } from './outfits';

/**
 * Outfit art, in the clip's own coordinates (the same viewBox as the wire): the top of the wire is the apex
 * of the head loop, (70, 20). Each outfit is mounted inside <g id="outfit"> within #body, so it squashes, tilts,
 * jumps and sleeps with the head. Anything above y = 20 counts toward OUTFIT_HEIGHT in outfits.ts.
 *
 * Classic: gradients and thin outlines like the rest of Classic. Flat: solid DESIGN.md tokens, one base plus one
 * hard shade per form, no outlines (seasonal tokens clover / clover-shade are listed in DESIGN.md).
 */
const INK = '#18202E';
const PAPER = '#F4F1EA';
const CORAL = '#E5705A';
const MARIGOLD = '#F2B33D';
const MARIGOLD_LIGHT = '#F7C964';
const OCHRE = '#C98A1E';
const STEEL = '#8394AB';
const CLOVER = '#5FA36B';
const CLOVER_SHADE = '#3F7A4D';
/** The Flat skin's one hard shade: ink at 16 %, the same shape language the focus timer uses. */
const SHADE = `fill="${INK}" fill-opacity="0.16"`;

const HEART = 'M 0 10 C -15 0 -15 -12 -7 -12.5 C -3 -12.8 0 -10 0 -7.5 C 0 -10 3 -12.8 7 -12.5 C 15 -12 15 0 0 10 Z';
const HEART_HALF = 'M 0 10 C 15 0 15 -12 7 -12.5 C 3 -12.8 0 -10 0 -7.5 Z';
const LEAF = 'M 0 0 C -9 -5 -11 -15 -5 -16.5 C -2 -17.3 0 -14.5 0 -12.5 C 0 -14.5 2 -17.3 5 -16.5 C 11 -15 9 -5 0 0 Z';
const LEAF_HALF = 'M 0 0 C 9 -5 11 -15 5 -16.5 C 2 -17.3 0 -14.5 0 -12.5 Z';

type Art = Record<Exclude<OutfitName, 'none'>, string>;

const CLASSIC: Art = {
  'santa-hat': `
    <defs>
      <linearGradient id="ofSantaRed" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e94b4b"/><stop offset="1" stop-color="#a82424"/></linearGradient>
      <linearGradient id="ofFur" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#dfe5ec"/></linearGradient>
    </defs>
    <path d="M 46 27 C 45 7 60 -9 82 -7 C 100 -5 111 8 113 24 C 105 13 97 15 94 25 Z" fill="url(#ofSantaRed)" stroke="#7d1b1b" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M 56 20 C 57 9 65 1 77 -1" fill="none" stroke="#ff8f86" stroke-width="2.4" stroke-linecap="round" opacity="0.55"/>
    <rect x="41" y="17" width="58" height="14" rx="7" fill="url(#ofFur)" stroke="#aab3be" stroke-width="1.2"/>
    <circle cx="52" cy="24" r="1.3" fill="#c3cbd5"/><circle cx="64" cy="26.5" r="1.3" fill="#c3cbd5"/><circle cx="77" cy="23.5" r="1.3" fill="#c3cbd5"/><circle cx="88" cy="26.5" r="1.3" fill="#c3cbd5"/>
    <circle cx="113" cy="26" r="7.5" fill="url(#ofFur)" stroke="#aab3be" stroke-width="1.2"/>
    <circle cx="110.5" cy="23.5" r="1.2" fill="#c3cbd5"/><circle cx="115.5" cy="28" r="1.2" fill="#c3cbd5"/>`,
  'party-hat': `
    <defs>
      <linearGradient id="ofPartyGrad" x1="0" y1="0" x2="1" y2="0.4"><stop offset="0" stop-color="#7f6fc4"/><stop offset="0.6" stop-color="#5a8fb0"/><stop offset="1" stop-color="#4fa8a6"/></linearGradient>
      <clipPath id="ofPartyClip"><path d="M 46 25 L 78 -22 L 96 25 Z"/></clipPath>
      <radialGradient id="ofPom" cx="0.35" cy="0.3" r="0.9"><stop offset="0" stop-color="#ffe680"/><stop offset="1" stop-color="#e8a923"/></radialGradient>
      <linearGradient id="ofBrim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe27a"/><stop offset="1" stop-color="#e0a52a"/></linearGradient>
    </defs>
    <g transform="rotate(7 71 26)">
      <path d="M 46 25 L 78 -22 L 96 25 Z" fill="url(#ofPartyGrad)" stroke="#3b3472" stroke-width="1.3" stroke-linejoin="round"/>
      <g clip-path="url(#ofPartyClip)">
        <path d="M 38 14 L 104 -5" stroke="#ffd54a" stroke-width="4.5" opacity="0.95"/>
        <path d="M 38 27 L 104 8" stroke="#f58a74" stroke-width="4.5" opacity="0.95"/>
        <circle cx="68" cy="3" r="2" fill="#fff"/><circle cx="82" cy="13" r="2" fill="#fff"/><circle cx="60" cy="21" r="2" fill="#fff"/><circle cx="75" cy="-10" r="1.7" fill="#fff"/><circle cx="90" cy="21" r="2" fill="#fff"/>
      </g>
      <path d="M 44 24.5 Q 71 32 98 24.5 L 98 29.5 Q 71 37 44 29.5 Z" fill="url(#ofBrim)" stroke="#a9760f" stroke-width="1" stroke-linejoin="round"/>
      <g fill="url(#ofPom)" stroke="#a9760f" stroke-width="1">
        <circle cx="78" cy="-24" r="6.5"/><circle cx="72" cy="-27" r="2.6"/><circle cx="84" cy="-28" r="2.6"/><circle cx="84" cy="-19" r="2.6"/><circle cx="72" cy="-20" r="2.6"/>
      </g>
    </g>`,
  heart: `
    <defs>
      <linearGradient id="ofHeartGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff7d9b"/><stop offset="1" stop-color="#d12a58"/></linearGradient>
    </defs>
    <g transform="translate(69 10) rotate(-12) scale(1.3)">
      <path d="${HEART}" fill="url(#ofHeartGrad)" stroke="#8d1738" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M -10.5 -6.5 C -10 -9.5 -7.5 -10.5 -5.5 -10" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity="0.8"/>
    </g>
    <g transform="translate(101 -2) rotate(14) scale(0.5)"><path d="${HEART}" fill="url(#ofHeartGrad)" stroke="#8d1738" stroke-width="1.6" stroke-linejoin="round"/></g>
    <g transform="translate(36 -8) rotate(-16) scale(0.36)"><path d="${HEART}" fill="#ff9db3" stroke="#8d1738" stroke-width="2" stroke-linejoin="round"/></g>`,
  pumpkin: `
    <defs>
      <radialGradient id="ofPumpkinGrad" cx="0.4" cy="0.3" r="0.9"><stop offset="0" stop-color="#ffb347"/><stop offset="1" stop-color="#e2631a"/></radialGradient>
    </defs>
    <g transform="translate(70 8) rotate(-6)">
      <path d="M 0 -17 C 14 -17 26 -9 26 4 C 26 15 15 20 0 20 C -15 20 -26 15 -26 4 C -26 -9 -14 -17 0 -17 Z" fill="url(#ofPumpkinGrad)" stroke="#8f3a0a" stroke-width="1.3"/>
      <path d="M 0 -17 C -8 -11 -9 11 0 20 M 0 -17 C 8 -11 9 11 0 20 M -13 -14 C -22 -4 -20 10 -12 18 M 13 -14 C 22 -4 20 10 12 18" fill="none" stroke="#b9470d" stroke-width="1.3" stroke-linecap="round" opacity="0.65"/>
      <path d="M -3 -17 C -3 -23 0 -26 3 -28 C 5 -25 4 -21 4 -17 Z" fill="#5e8c3c" stroke="#35581f" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M 4 -22 C 12 -26 18 -22 16 -16 C 15 -13 11 -14 12 -17" fill="none" stroke="#5e8c3c" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M -13 -2 L -8 -8 L -4 -2 Z M 4 -2 L 8 -8 L 13 -2 Z" fill="#ffe27a" stroke="#6b2c06" stroke-width="1" stroke-linejoin="round"/>
      <path d="M -11 8 L -7 11.5 L -3.5 8.5 L 0 12 L 3.5 8.5 L 7 11.5 L 11 8 L 8 15 L 3 13 L 0 16 L -3 13 L -8 15 Z" fill="#ffe27a" stroke="#6b2c06" stroke-width="1" stroke-linejoin="round"/>
    </g>`,
  shamrock: `
    <defs>
      <linearGradient id="ofCloverGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7fd08a"/><stop offset="1" stop-color="#2f8f4a"/></linearGradient>
    </defs>
    <path d="M 70 24 C 68 14 74 8 72 -2" fill="none" stroke="#2b7a41" stroke-width="3.2" stroke-linecap="round"/>
    <g transform="translate(71 -4) rotate(8) scale(1.18)">
      <g id="ofL1" transform="rotate(0)"><path d="${LEAF}" fill="url(#ofCloverGrad)" stroke="#1f6636" stroke-width="1"/></g>
      <g transform="rotate(120)"><path d="${LEAF}" fill="url(#ofCloverGrad)" stroke="#1f6636" stroke-width="1"/></g>
      <g transform="rotate(240)"><path d="${LEAF}" fill="url(#ofCloverGrad)" stroke="#1f6636" stroke-width="1"/></g>
      <g transform="rotate(0)"><path d="M 0 -3 L 0 -12" stroke="#2b7a41" stroke-width="0.9" stroke-linecap="round" opacity="0.6"/></g>
      <g transform="rotate(120)"><path d="M 0 -3 L 0 -12" stroke="#2b7a41" stroke-width="0.9" stroke-linecap="round" opacity="0.6"/></g>
      <g transform="rotate(240)"><path d="M 0 -3 L 0 -12" stroke="#2b7a41" stroke-width="0.9" stroke-linecap="round" opacity="0.6"/></g>
    </g>`,
};

const FLAT: Art = {
  'santa-hat': `
    <path d="M 46 27 C 45 7 60 -9 82 -7 C 100 -5 111 8 113 24 C 105 13 97 15 94 25 Z" fill="${CORAL}"/>
    <path d="M 82 -7 C 100 -5 111 8 113 24 C 105 13 97 15 94 25 L 82 22 Z" ${SHADE}/>
    <rect x="41" y="17" width="58" height="14" rx="7" fill="${PAPER}"/>
    <path d="M 41 26 H 99 V 24 A 7 7 0 0 1 92 31 H 48 A 7 7 0 0 1 41 24 Z" ${SHADE}/>
    <circle cx="113" cy="26" r="7.5" fill="${PAPER}"/>
    <path d="M 113 18.5 A 7.5 7.5 0 0 1 113 33.5 Z" ${SHADE}/>`,
  'party-hat': `
    <clipPath id="ofPartyClipF"><path d="M 46 25 L 78 -22 L 96 25 Z"/></clipPath>
    <g transform="rotate(7 71 26)">
      <path d="M 46 25 L 78 -22 L 96 25 Z" fill="${MARIGOLD}"/>
      <g clip-path="url(#ofPartyClipF)">
        <path d="M 38 15 L 104 -4 L 104 5 L 38 24 Z" fill="${CORAL}"/>
        <path d="M 78 -22 L 96 25 L 82 25 Z" ${SHADE}/>
        <circle cx="68" cy="3" r="2" fill="${PAPER}"/><circle cx="84" cy="13" r="2" fill="${PAPER}"/><circle cx="76" cy="-9" r="1.8" fill="${PAPER}"/><circle cx="60" cy="21" r="2" fill="${PAPER}"/><circle cx="90" cy="21" r="2" fill="${PAPER}"/>
      </g>
      <path d="M 44 24.5 Q 71 32 98 24.5 L 98 29.5 Q 71 37 44 29.5 Z" fill="${OCHRE}"/>
      <path d="M 78 -33 L 80.6 -26.4 L 87.5 -25 L 82 -21 L 83.5 -14 L 78 -18 L 72.5 -14 L 74 -21 L 68.5 -25 L 75.4 -26.4 Z" fill="${PAPER}"/>
    </g>`,
  heart: `
    <g transform="translate(69 10) rotate(-12) scale(1.3)">
      <path d="${HEART}" fill="${CORAL}"/><path d="${HEART_HALF}" ${SHADE}/>
      <path d="M -10.5 -6.5 C -10 -9.5 -7.5 -10.5 -5.5 -10" fill="none" stroke="${PAPER}" stroke-width="2.2" stroke-linecap="round"/>
    </g>
    <g transform="translate(101 -2) rotate(14) scale(0.5)"><path d="${HEART}" fill="${MARIGOLD}"/><path d="${HEART_HALF}" ${SHADE}/></g>
    <g transform="translate(36 -8) rotate(-16) scale(0.36)"><path d="${HEART}" fill="${PAPER}"/></g>`,
  pumpkin: `
    <g transform="translate(70 8) rotate(-6)">
      <path d="M 0 -17 C 14 -17 26 -9 26 4 C 26 15 15 20 0 20 C -15 20 -26 15 -26 4 C -26 -9 -14 -17 0 -17 Z" fill="${MARIGOLD}"/>
      <path d="M 0 -17 C 14 -17 26 -9 26 4 C 26 15 15 20 0 20 C 9 11 8 -11 0 -17 Z" fill="${OCHRE}"/>
      <path d="M -3 -17 C -3 -23 0 -26 3 -28 C 5 -25 4 -21 4 -17 Z" fill="${CLOVER}"/>
      <path d="M 4 -22 C 12 -26 18 -22 16 -16 C 15 -13 11 -14 12 -17" fill="none" stroke="${CLOVER_SHADE}" stroke-width="2" stroke-linecap="round"/>
      <path d="M -13 -2 L -8 -8 L -4 -2 Z M 4 -2 L 8 -8 L 13 -2 Z" fill="${INK}"/>
      <path d="M -11 8 L -7 11.5 L -3.5 8.5 L 0 12 L 3.5 8.5 L 7 11.5 L 11 8 L 8 15 L 3 13 L 0 16 L -3 13 L -8 15 Z" fill="${INK}"/>
    </g>`,
  shamrock: `
    <path d="M 70 24 C 68 14 74 8 72 -2" fill="none" stroke="${CLOVER_SHADE}" stroke-width="3.4" stroke-linecap="round"/>
    <g transform="translate(71 -4) rotate(8) scale(1.18)">
      <g><path d="${LEAF}" fill="${CLOVER}"/><path d="${LEAF_HALF}" fill="${CLOVER_SHADE}"/></g>
      <g transform="rotate(120)"><path d="${LEAF}" fill="${CLOVER}"/><path d="${LEAF_HALF}" fill="${CLOVER_SHADE}"/></g>
      <g transform="rotate(240)"><path d="${LEAF}" fill="${CLOVER}"/><path d="${LEAF_HALF}" fill="${CLOVER_SHADE}"/></g>
    </g>`,
};

// Palette tokens referenced by Flat that are not used by every outfit (kept for the DESIGN.md audit test).
export const FLAT_TOKENS_USED = [INK, PAPER, CORAL, MARIGOLD, MARIGOLD_LIGHT, OCHRE, STEEL, CLOVER, CLOVER_SHADE] as const;

export function outfitSvg(style: Style, name: OutfitName): string {
  if (name === 'none') return '';
  return (style === 'flat' ? FLAT : CLASSIC)[name];
}
