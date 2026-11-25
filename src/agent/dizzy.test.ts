import { describe, expect, it } from 'vitest';
import { DizzyDetector } from './dizzy';

describe('DizzyDetector', () => {
  it('does not trigger for a slow, short drag', () => {
    const d = new DizzyDetector();
    for (let i = 0; i < 20; i++) d.move(i * 10, 0, i * 50);
    expect(d.consume(2000)).toBe(false);
  });

  it('triggers on long distance within the window', () => {
    const d = new DizzyDetector();
    for (let i = 0; i < 20; i++) d.move(i * 200, 0, i * 50); // 3800 px in 950 ms
    expect(d.consume(1000)).toBe(true);
  });

  it('does not count distance spread over a long time', () => {
    const d = new DizzyDetector();
    for (let i = 0; i < 40; i++) d.move(i * 200, 0, i * 400); // 200 px per 400 ms
    expect(d.consume(20000)).toBe(false);
  });

  it('triggers on sharp direction reversals', () => {
    const d = new DizzyDetector();
    for (let i = 0; i < 10; i++) d.move(i % 2 === 0 ? 0 : 40, 0, i * 100);
    expect(d.consume(1100)).toBe(true);
  });

  it('ignores tiny jitter', () => {
    const d = new DizzyDetector();
    for (let i = 0; i < 30; i++) d.move(i % 2 === 0 ? 0 : 2, 0, i * 30);
    expect(d.consume(1000)).toBe(false);
  });

  it('respects the cooldown and resets after consume', () => {
    const d = new DizzyDetector();
    const shake = (t0: number) => { for (let i = 0; i < 10; i++) d.move(i % 2 === 0 ? 0 : 40, 0, t0 + i * 100); };
    shake(0);
    expect(d.consume(1000)).toBe(true);
    shake(2000);
    expect(d.consume(3000)).toBe(false); // within 10 s cooldown
    shake(12000);
    expect(d.consume(13000)).toBe(true);
    expect(d.consume(30000)).toBe(false); // state was reset
  });
});
