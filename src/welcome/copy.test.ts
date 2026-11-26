import { describe, expect, it } from 'vitest';
import { COPY, trayLine } from './copy';

describe('guide copy', () => {
  it('names the tray per platform', () => {
    expect(trayLine('macos')).toContain('menu bar');
    expect(trayLine('windows')).toContain('system tray, bottom right');
    expect(trayLine('linux')).toContain('if your desktop shows one');
  });
  it('has no empty strings and never mentions Clippy', () => {
    const all: string[] = [];
    const walk = (v: unknown): void => {
      if (typeof v === 'string') all.push(v);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
    };
    walk(COPY);
    expect(all.length).toBeGreaterThan(30);
    for (const s of all) { expect(s.trim()).not.toBe(''); expect(s).not.toContain('Clippy'); }
  });
});
