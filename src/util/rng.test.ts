import { describe, expect, it } from 'vitest';
import { mulberry32, pick, randRange } from './rng';

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = mulberry32(42), b = mulberry32(42);
    const sa = Array.from({ length: 20 }, a), sb = Array.from({ length: 20 }, b);
    expect(sa).toEqual(sb);
    expect(sa.every((v) => v >= 0 && v < 1)).toBe(true);
  });
  it('randRange and pick stay in bounds', () => {
    const r = mulberry32(1);
    for (let i = 0; i < 100; i++) {
      const v = randRange(r, 5, 10);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThan(10);
    }
    expect(['a', 'b']).toContain(pick(r, ['a', 'b']));
    expect(() => pick(r, [])).toThrow();
  });
});
