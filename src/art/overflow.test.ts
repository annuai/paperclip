import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ANIMATIONS } from '../anim/animations';

// Inline <svg> clips to its viewBox by default (UA style `overflow: hidden`), which cut the
// clip's head off at the top of a Jump. The character must be allowed to draw above its box.
const css = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');

describe('character is never clipped by its SVG box', () => {
  it('#character svg sets overflow: visible', () => {
    const rule = css.match(/#character svg\s*\{([^}]*)\}/);
    expect(rule?.[1]).toMatch(/overflow:\s*visible/);
  });

  it('Jump apex stays inside the window headroom above the character box', () => {
    // Geometry: wire top at y=20 (viewBox units), scaled about y=200 by squash, offset by body.y,
    // plus ~5 units of stroke. viewBox top is -40; 0.9 px per unit; window is 380px, host is 261px.
    const HEADROOM_UNITS = (380 - 261) / 0.9;
    let minTop = Infinity;
    for (const fr of ANIMATIONS.Jump.frames) {
      const b = (fr.pose as { body?: { squash?: number; y?: number } } | undefined)?.body ?? {};
      const top = 200 - 180 * (b.squash ?? 1) + (b.y ?? 0) - 5;
      minTop = Math.min(minTop, top);
    }
    expect(minTop).toBeGreaterThan(-40 - HEADROOM_UNITS);
  });
});
