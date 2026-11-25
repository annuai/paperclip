export const WIRE_PATH =
  'M 60 140 L 60 62 A 12 12 0 0 1 84 62 L 84 176 A 22 22 0 0 1 40 176 L 40 50 A 30 30 0 0 1 100 50 L 100 150';

/** Element ids the renderer looks up. Every skin must expose all of them (checked by a unit test). */
export const REQUIRED_IDS = [
  'root', 'shadow', 'body', 'eyes', 'pupilL', 'pupilR', 'lidL', 'lidR', 'browL', 'browR',
  'pencil', 'bulb', 'question', 'sparkles', 'glass', 'mouth', 'mat', 'matInner', 'matSheet', 'matRoll', 'wireOutline',
] as const;

/** Classic skin: original parametric paperclip (gradients + outlines). Ids are what the renderer grabs. */
export const PAPERCLIP_SVG_CLASSIC = `<svg id="pc" viewBox="-50 -40 240 290" width="216" height="261" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="wireGrad" x1="0" y1="0" x2="1" y2="0.15">
      <stop offset="0" stop-color="#8e97a1"/><stop offset="0.35" stop-color="#eef1f4"/>
      <stop offset="0.6" stop-color="#c3c9d0"/><stop offset="1" stop-color="#7b848e"/>
    </linearGradient>
    <linearGradient id="matTop" x1="0" y1="0" x2="1" y2="0.3">
      <stop offset="0" stop-color="#6f63ad"/><stop offset="0.55" stop-color="#5a8fb0"/><stop offset="1" stop-color="#4fa8a6"/>
    </linearGradient>
    <linearGradient id="matSide" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#3b3472"/><stop offset="1" stop-color="#2b6a70"/>
    </linearGradient>
    <linearGradient id="matRollGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#3f6f7a"/><stop offset="0.45" stop-color="#8fd0cf"/><stop offset="1" stop-color="#3a5f6e"/>
    </linearGradient>
    <linearGradient id="glassGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#cfeaf5" stop-opacity="0.85"/><stop offset="0.5" stop-color="#f1fbff" stop-opacity="0.75"/><stop offset="1" stop-color="#b5dcec" stop-opacity="0.85"/>
    </linearGradient>
    <linearGradient id="waterGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7fd0f2"/><stop offset="1" stop-color="#3b97cf"/>
    </linearGradient>
    <clipPath id="clipEyeL"><ellipse cx="57" cy="80" rx="11.5" ry="13.5"/></clipPath>
    <clipPath id="clipEyeR"><ellipse cx="85" cy="78" rx="11.5" ry="13.5"/></clipPath>
  </defs>
  <g id="root">
  <g id="mat"><g id="matInner">
    <ellipse cx="70" cy="238" rx="112" ry="9" fill="rgba(0,0,0,0.22)"/>
    <g id="matSheet">
      <path d="M -30 222 H 170 V 230 Q 170 234 166 234 H -26 Q -30 234 -30 230 Z" fill="url(#matSide)"/>
      <path d="M -8 192 L 148 192 L 170 222 L -30 222 Z" fill="url(#matTop)" stroke="#4d6fa6" stroke-width="3" stroke-linejoin="round"/>
      <path d="M 14 192 L 6 222 M 36 192 L 31 222 M 58 192 L 56 222 M 82 192 L 84 222 M 104 192 L 109 222 M 126 192 L 134 222"
            stroke="rgba(255,255,255,0.13)" stroke-width="1.2" fill="none"/>
      <path d="M -15 202 L 155 202 M -22 212 L 163 212" stroke="rgba(0,0,0,0.10)" stroke-width="1" fill="none"/>
      <path d="M -2 195 L 142 195" stroke="rgba(255,255,255,0.25)" stroke-width="1.4" stroke-linecap="round"/>
    </g>
    <g id="matRoll">
      <rect x="-13" y="190" width="26" height="44" rx="12" fill="url(#matRollGrad)" stroke="#34506a" stroke-width="1.5"/>
      <circle cx="0" cy="228" r="7" fill="none" stroke="#2f4a63" stroke-width="1.6"/>
      <circle cx="0" cy="228" r="3" fill="none" stroke="#2f4a63" stroke-width="1.2"/>
    </g>
  </g></g>
    <ellipse id="shadow" cx="70" cy="206" rx="30" ry="5" fill="rgba(0,0,0,0.18)"/>
    <g id="body">
      <path id="wireOutline" d="${WIRE_PATH}" fill="none" stroke="#4b535d" stroke-width="10.5"
            stroke-linecap="round" stroke-linejoin="round"/>
      <path id="wire" d="${WIRE_PATH}" fill="none" stroke="url(#wireGrad)" stroke-width="7.5"
            stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M 36.5 72 L 36.5 118" stroke="#3cc6c0" stroke-width="2.2" stroke-linecap="round" opacity="0.9"/>
      <path d="M 47 27 A 32.5 32.5 0 0 1 58.9 19.5" fill="none" stroke="#3cc6c0" stroke-width="2.2"
            stroke-linecap="round" opacity="0.9"/>
      <g id="eyes">
        <ellipse cx="57" cy="80" rx="11.5" ry="13.5" fill="#fff"/>
        <ellipse cx="85" cy="78" rx="11.5" ry="13.5" fill="#fff"/>
        <g id="pupilL"><circle cx="57" cy="80" r="5" fill="#1f2430"/><circle cx="55.2" cy="78" r="1.6" fill="#fff"/></g>
        <g id="pupilR"><circle cx="85" cy="78" r="5" fill="#1f2430"/><circle cx="83.2" cy="76" r="1.6" fill="#fff"/></g>
        <rect id="lidL" x="45" y="66" width="24" height="0" fill="#aab2bb" clip-path="url(#clipEyeL)"/>
        <rect id="lidR" x="73" y="64" width="24" height="0" fill="#aab2bb" clip-path="url(#clipEyeR)"/>
        <ellipse cx="57" cy="80" rx="11.5" ry="13.5" fill="none" stroke="#2b2f36" stroke-width="2"/>
        <ellipse cx="85" cy="78" rx="11.5" ry="13.5" fill="none" stroke="#2b2f36" stroke-width="2"/>
        <g id="browL"><path d="M -10 2 Q 0 -5 10 0" fill="none" stroke="#2b2f36" stroke-width="5.5" stroke-linecap="round"/></g>
        <g id="browR"><path d="M -10 0 Q 0 -5 10 2" fill="none" stroke="#2b2f36" stroke-width="5.5" stroke-linecap="round"/></g>
      </g>
      <ellipse id="mouth" cx="0" cy="0" rx="6" ry="6" fill="#3a1f2b" stroke="#2b2f36" stroke-width="1.5"/>
      <g id="glass"><g>
        <path d="M -9 -12 L 9 -12 L 7 12 Q 7 13.5 5.5 13.5 L -5.5 13.5 Q -7 13.5 -7 12 Z" fill="url(#glassGrad)" stroke="#5b7f91" stroke-width="1.2" stroke-linejoin="round"/>
        <path d="M -8.1 -3 L 8.1 -3 L 6.9 11.6 Q 6.8 12.6 5.6 12.6 L -5.6 12.6 Q -6.8 12.6 -6.9 11.6 Z" fill="url(#waterGrad)"/>
        <ellipse cx="0" cy="-12" rx="9" ry="2.2" fill="#e8f7fd" stroke="#5b7f91" stroke-width="1.1"/>
        <path d="M -5.5 -7 L -4.4 9" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity="0.8"/>
      </g></g>
      <g id="pencil"><g>
        <rect x="-3.5" y="-28" width="7" height="40" rx="1.5" fill="#f2c14e" stroke="#6b4e16" stroke-width="1.2"/>
        <rect x="-3.5" y="-32" width="7" height="6" rx="1.5" fill="#e98aa0"/>
        <path d="M -3.5 12 L 0 20 L 3.5 12 Z" fill="#f3dfb8" stroke="#6b4e16" stroke-width="1.2"/>
        <path d="M -1.2 17.3 L 0 20 L 1.2 17.3 Z" fill="#333"/></g></g>
      <g id="bulb"><g>
        <circle cy="-4" r="11" fill="#fff3a6" stroke="#c9a227" stroke-width="1.5"/>
        <path d="M -3 2 L -1 -4 L 1 2 L 3 -4" fill="none" stroke="#c9a227" stroke-width="1.2"/>
        <rect x="-5" y="6" width="10" height="7" rx="1.5" fill="#9aa3ad"/>
        <path d="M 0 -20 V -25 M 14 -14 L 18 -18 M -14 -14 L -18 -18 M 17 -4 H 22 M -17 -4 H -22"
              stroke="#e8b923" stroke-width="2" stroke-linecap="round"/></g></g>
      <g id="question"><g>
        <path d="M -6 -8 Q -6 -16 1 -16 Q 8 -16 8 -9 Q 8 -4 2 -1 Q 0 0 0 4" fill="none"
              stroke="#3cc6c0" stroke-width="4" stroke-linecap="round"/>
        <circle cy="10" r="2.4" fill="#3cc6c0"/></g></g>
      <g id="sparkles"><g>
        <path transform="translate(18 10)" d="M 0 -7 Q 1 -1 7 0 Q 1 1 0 7 Q -1 1 -7 0 Q -1 -1 0 -7 Z" fill="#ffd54a"/>
        <path transform="translate(118 4) scale(0.7)" d="M 0 -7 Q 1 -1 7 0 Q 1 1 0 7 Q -1 1 -7 0 Q -1 -1 0 -7 Z" fill="#ffd54a"/>
        <path transform="translate(124 60) scale(0.5)" d="M 0 -7 Q 1 -1 7 0 Q 1 1 0 7 Q -1 1 -7 0 Q -1 -1 0 -7 Z" fill="#ffd54a"/></g></g>
    </g>
  </g>
</svg>`;

/**
 * Flat skin (Charley Harper-style geometric flat). Same ids, same geometry anchors as Classic.
 * Rules: no gradients, no outline strokes, no blur. One base colour + at most one hard shade per form.
 * Palette: Ink #18202E, Steel #8FA0B5, Steel-shade #6F8199, Glint #DCE4EE, Marigold #F2B33D,
 * Ochre #C98A1E, Marigold-light #F7C964, Paper #F4F1EA, Coral #E5705A.
 */
export const PAPERCLIP_SVG_FLAT = `<svg id="pc" viewBox="-50 -40 240 290" width="216" height="261" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="clipEyeL"><ellipse cx="57" cy="80" rx="11.5" ry="13.5"/></clipPath>
    <clipPath id="clipEyeR"><ellipse cx="85" cy="78" rx="11.5" ry="13.5"/></clipPath>
  </defs>
  <g id="root">
    <g id="mat"><g id="matInner">
      <ellipse cx="70" cy="233" rx="112" ry="7" fill="#18202E" fill-opacity="0.14"/>
      <g id="matSheet">
        <path d="M -30 222 H 170 V 224 L 167 227 H -27 L -30 224 Z" fill="#C98A1E"/>
        <path d="M -8 192 L 148 192 L 170 222 L -30 222 Z" fill="#F2B33D"/>
        <path fill-rule="evenodd" fill="#F7C964" d="M -8 192 L 148 192 L 170 222 L -30 222 Z M -7 195 L 147 195 L 164.3 219 L -24.3 219 Z"/>      </g>
      <g id="matRoll">
        <rect x="-13" y="190" width="26" height="44" rx="12" fill="#F2B33D"/>
        <rect x="-13" y="218" width="26" height="16" rx="8" fill="#C98A1E"/>
        <circle cx="0" cy="228" r="7" fill="#F2B33D"/>
        <circle cx="0" cy="228" r="3" fill="#C98A1E"/>
      </g>
    </g></g>
    <ellipse id="shadow" cx="70" cy="206" rx="30" ry="5" fill="#18202E" fill-opacity="0.14"/>
    <g id="body">
      <path id="wireOutline" d="${WIRE_PATH}" fill="none" stroke="#8394AB" stroke-width="9.5"
            stroke-linecap="round" stroke-linejoin="round"/>
      <g id="wireShade" fill="none" stroke="#5F7088" stroke-width="3.2" stroke-linecap="butt">
        <path d="M 87.15 64 L 87.15 174"/><path d="M 103.15 52 L 103.15 150"/>
      </g>
      <path d="M 40.5 44.8 A 30 30 0 0 1 58.3 22.4" fill="none" stroke="#E6ECF3" stroke-width="2.5" stroke-linecap="round"/>
      <g id="eyes">
        <ellipse cx="57" cy="80" rx="14" ry="16" fill="#5F7088"/>
        <ellipse cx="85" cy="78" rx="14" ry="16" fill="#5F7088"/>
        <ellipse cx="57" cy="80" rx="11.5" ry="13.5" fill="#F4F1EA"/>
        <ellipse cx="85" cy="78" rx="11.5" ry="13.5" fill="#F4F1EA"/>
        <g id="pupilL"><circle cx="57" cy="80" r="5.2" fill="#18202E"/><circle cx="55.2" cy="78" r="1.6" fill="#F4F1EA"/></g>
        <g id="pupilR"><circle cx="85" cy="78" r="5.2" fill="#18202E"/><circle cx="83.2" cy="76" r="1.6" fill="#F4F1EA"/></g>
        <rect id="lidL" x="45" y="66" width="24" height="0" fill="#8394AB" clip-path="url(#clipEyeL)"/>
        <rect id="lidR" x="73" y="64" width="24" height="0" fill="#8394AB" clip-path="url(#clipEyeR)"/>
        <g id="browL"><path d="M -10 2 Q 0 -5 10 0" fill="none" stroke="#F4F1EA" stroke-width="9.5" stroke-linecap="round"/><path d="M -10 2 Q 0 -5 10 0" fill="none" stroke="#18202E" stroke-width="7" stroke-linecap="round"/></g>
        <g id="browR"><path d="M -10 0 Q 0 -5 10 2" fill="none" stroke="#F4F1EA" stroke-width="9.5" stroke-linecap="round"/><path d="M -10 0 Q 0 -5 10 2" fill="none" stroke="#18202E" stroke-width="7" stroke-linecap="round"/></g>
      </g>
      <g id="mouth"><ellipse cx="0" cy="0" rx="8.5" ry="8.5" fill="#F4F1EA"/><ellipse cx="0" cy="0" rx="6" ry="6" fill="#18202E"/><ellipse cx="0" cy="3.2" rx="3.4" ry="2.2" fill="#E5705A"/></g>
      <g id="glass"><g>
        <path d="M -9 -12 L 9 -12 L 7 13 L -7 13 Z" fill="#8394AB"/>
        <path d="M -7.6 -10.6 L 7.6 -10.6 L 5.9 10.4 L -5.9 10.4 Z" fill="#F4F1EA"/>
        <path d="M -7.1 -3 L 7.1 -3 L 5.9 10.4 L -5.9 10.4 Z" fill="#4FA3D9"/>
        <path d="M -6.6 0 L -3.6 0 L -3.1 10.4 L -5.7 10.4 Z" fill="#8CC8EC"/>
      </g></g>
      <g id="pencil"><g>
        <rect x="-3.5" y="-28" width="7" height="40" fill="#F2B33D"/>
        <rect x="0.5" y="-28" width="3" height="40" fill="#C98A1E"/>
        <rect x="-3.5" y="-32" width="7" height="5" rx="1.2" fill="#E5705A"/>
        <path d="M -3.5 12 L 0 21 L 3.5 12 Z" fill="#F4F1EA"/>
        <path d="M -1.3 17.6 L 0 21 L 1.3 17.6 Z" fill="#18202E"/></g></g>
      <g id="bulb"><g>
        <circle cy="-4" r="11" fill="#FFE27A"/>
        <path d="M 0 -15 A 11 11 0 0 1 0 7 Z" fill="#F7CF55"/>
        <path d="M -3 2 L -1 -4 L 1 2 L 3 -4" fill="none" stroke="#18202E" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        <rect x="-5" y="6" width="10" height="7" fill="#8FA0B5"/>
        <path d="M 0 -20 V -25 M 14 -14 L 18 -18 M -14 -14 L -18 -18 M 17 -4 H 22 M -17 -4 H -22"
              stroke="#F2B33D" stroke-width="2.4" stroke-linecap="round"/></g></g>
      <g id="question"><g>
        <path d="M -6 -8 Q -6 -16 1 -16 Q 8 -16 8 -9 Q 8 -4 2 -1 Q 0 0 0 4" fill="none"
              stroke="#F2B33D" stroke-width="4.6" stroke-linecap="round"/>
        <circle cy="10" r="2.6" fill="#F2B33D"/></g></g>
      <g id="sparkles"><g>
        <path transform="translate(18 10)" d="M 0 -8 L 2 -2 L 8 0 L 2 2 L 0 8 L -2 2 L -8 0 L -2 -2 Z" fill="#F2B33D"/>
        <path transform="translate(118 4) scale(0.75)" d="M 0 -8 L 2 -2 L 8 0 L 2 2 L 0 8 L -2 2 L -8 0 L -2 -2 Z" fill="#F4F1EA"/>
        <path transform="translate(124 60) scale(0.55)" d="M 0 -8 L 2 -2 L 8 0 L 2 2 L 0 8 L -2 2 L -8 0 L -2 -2 Z" fill="#F2B33D"/></g></g>
    </g>
  </g>
</svg>`;

export function svgFor(style: 'classic' | 'flat'): string {
  return style === 'flat' ? PAPERCLIP_SVG_FLAT : PAPERCLIP_SVG_CLASSIC;
}
