import type { Rng } from './rng';

export class ShuffleBag<T> {
  private readonly items: T[];
  private queue: T[] = [];
  private last: T | undefined;
  private hasLast = false;

  constructor(items: readonly T[], private readonly rng: Rng = Math.random) {
    this.items = [...items];
  }

  get size(): number {
    return this.items.length;
  }

  next(): T {
    if (this.items.length === 0) throw new Error('ShuffleBag: empty');
    if (this.queue.length === 0) this.refill();
    const v = this.queue.shift() as T;
    this.last = v;
    this.hasLast = true;
    return v;
  }

  private refill(): void {
    const q = [...this.items];
    for (let i = q.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [q[i], q[j]] = [q[j], q[i]];
    }
    if (q.length > 1 && this.hasLast && q[0] === this.last) {
      const j = 1 + Math.floor(this.rng() * (q.length - 1));
      [q[0], q[j]] = [q[j], q[0]];
    }
    this.queue = q;
  }
}
