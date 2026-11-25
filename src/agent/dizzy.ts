/** Tunable thresholds for the "dizzy" reaction to being dragged around a lot. */
export const DIZZY_WINDOW_MS = 1500;
export const DIZZY_DISTANCE_PX = 2500; // logical px travelled within the window
export const DIZZY_REVERSALS = 5; // sharp direction reversals within the window
export const DIZZY_MIN_STEP_PX = 6; // ignore jitter smaller than this when judging direction
export const DIZZY_IDLE_MS = 250; // no move events for this long = drag ended
export const DIZZY_COOLDOWN_MS = 10000;

export interface DizzyConfig { windowMs: number; distancePx: number; reversals: number; minStepPx: number; cooldownMs: number }
export const DEFAULT_DIZZY: DizzyConfig = {
  windowMs: DIZZY_WINDOW_MS, distancePx: DIZZY_DISTANCE_PX, reversals: DIZZY_REVERSALS,
  minStepPx: DIZZY_MIN_STEP_PX, cooldownMs: DIZZY_COOLDOWN_MS,
};

interface Sample { t: number; dist: number; reversal: boolean }

/** Pure detector: feed it positions with timestamps; ask `consume(now)` when the drag ends. */
export class DizzyDetector {
  private samples: Sample[] = [];
  private last: { x: number; y: number } | null = null;
  private dir: { dx: number; dy: number } | null = null;
  private triggered = false;
  private lastFired = -Infinity;

  constructor(private readonly cfg: DizzyConfig = DEFAULT_DIZZY) {}

  move(x: number, y: number, t: number): void {
    if (this.last) {
      const dx = x - this.last.x;
      const dy = y - this.last.y;
      const d = Math.hypot(dx, dy);
      let reversal = false;
      if (d >= this.cfg.minStepPx) {
        if (this.dir && this.dir.dx * dx + this.dir.dy * dy < 0) reversal = true;
        this.dir = { dx, dy };
        this.last = { x, y };
      }
      this.samples.push({ t, dist: d, reversal });
    } else {
      this.last = { x, y };
    }
    const cutoff = t - this.cfg.windowMs;
    while (this.samples.length && this.samples[0].t < cutoff) this.samples.shift();
    const dist = this.samples.reduce((a, s) => a + s.dist, 0);
    const rev = this.samples.filter((s) => s.reversal).length;
    if (dist > this.cfg.distancePx || rev >= this.cfg.reversals) this.triggered = true;
  }

  /** Call when the drag has ended. True (once) if dizziness was triggered and cooldown allows it. */
  consume(now: number): boolean {
    const fire = this.triggered && now - this.lastFired >= this.cfg.cooldownMs;
    if (fire) this.lastFired = now;
    this.reset();
    return fire;
  }

  reset(): void {
    this.samples = [];
    this.last = null;
    this.dir = null;
    this.triggered = false;
  }
}
