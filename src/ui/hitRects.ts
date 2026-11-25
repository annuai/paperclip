export interface Rect { x: number; y: number; w: number; h: number }
type Key = 'character' | 'mat' | 'balloon' | 'menu';

export class HitRects {
  private readonly rects = new Map<Key, Rect>();
  private queued = false;

  constructor(private readonly push: (rects: Rect[]) => Promise<void>) {}

  set(key: Key, r: Rect | null): void {
    const cur = this.rects.get(key);
    if (r === null) {
      if (!cur) return;
      this.rects.delete(key);
    } else {
      if (cur && cur.x === r.x && cur.y === r.y && cur.w === r.w && cur.h === r.h) return;
      this.rects.set(key, r);
    }
    if (this.queued) return;
    this.queued = true;
    queueMicrotask(() => {
      this.queued = false;
      this.push([...this.rects.values()]).catch((e) => console.warn('push hit rects failed', e));
    });
  }
}
