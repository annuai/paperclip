import { describe, expect, it } from 'vitest';
import { mulberry32 } from './rng';
import { ShuffleBag } from './shuffleBag';

describe('ShuffleBag', () => {
  it('yields every item exactly once per cycle', () => {
    const items = [1, 2, 3, 4, 5, 6, 7];
    const bag = new ShuffleBag(items, mulberry32(42));
    for (let c = 0; c < 10; c++) {
      const cycle = Array.from({ length: 7 }, () => bag.next()).sort();
      expect(cycle).toEqual(items);
    }
  });
  it('never repeats back-to-back across 1000 draws', () => {
    const bag = new ShuffleBag([1, 2, 3, 4, 5, 6, 7], mulberry32(7));
    let prev = bag.next();
    for (let i = 0; i < 1000; i++) {
      const v = bag.next();
      expect(v).not.toBe(prev);
      prev = v;
    }
  });
  it('size-1 bag returns the item', () => {
    const bag = new ShuffleBag(['x'], mulberry32(1));
    expect(bag.size).toBe(1);
    expect(bag.next()).toBe('x');
    expect(bag.next()).toBe('x');
  });
  it('empty bag throws', () => {
    expect(() => new ShuffleBag([]).next()).toThrow();
  });
});
