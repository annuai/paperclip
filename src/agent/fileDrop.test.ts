import { describe, expect, it } from 'vitest';
import { dropLine, formatSize, kindWord } from './fileDrop';

describe('file drop wording', () => {
  it('formats sizes', () => {
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(999)).toBe('999 B');
    expect(formatSize(2_400_000)).toBe('2.4 MB');
    expect(formatSize(48_000)).toBe('48 KB');
    expect(formatSize(3_500_000_000)).toBe('3.5 GB');
  });
  it('names kinds', () => {
    expect(kindWord('pdf')).toBe('PDF');
    expect(kindWord('folder')).toBe('folder');
    expect(kindWord('xyz')).toBe('XYZ file');
    expect(kindWord('')).toBe('file');
  });
  it('says the size and kind of one file', () => {
    expect(dropLine({ count: 1, name: 'a.pdf', kind: 'pdf', bytes: 2_400_000 })).toBe('Ooh, a 2.4 MB PDF. Want me to zip it?');
    expect(dropLine({ count: 1, name: 'a.png', kind: 'png', bytes: 90_000 })).toBe('Ooh, a 90 KB image. Want me to zip it?');
    expect(dropLine({ count: 1, name: 'a.pdf', kind: 'pdf', bytes: 8_100_000 })).toBe('Ooh, an 8.1 MB PDF. Want me to zip it?');
  });
  it('handles folders and several files', () => {
    expect(dropLine({ count: 1, name: 'Photos', kind: 'folder', bytes: 5_000_000 })).toContain('folder called Photos');
    expect(dropLine({ count: 3, name: 'a', kind: 'txt', bytes: 3000 })).toBe('Ooh, 3 things, 3.0 KB in all. Want me to zip them up?');
  });
  it('lines fit the balloon', () => {
    expect(dropLine({ count: 1, name: 'x'.repeat(200), kind: 'folder', bytes: 1 }).length).toBeLessThan(110);
  });
});
