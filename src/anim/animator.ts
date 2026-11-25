import { EASE } from './easing';
import { dampPose, lerpPose, mergePose, NEUTRAL } from './pose';
import type { Pose } from './pose';
import type { Animation } from './types';
import type { Rng } from '../util/rng';

/** Global playback speed (1 = authored timing). Frame durations are divided by this; tune freely. */
export const ANIMATION_SPEED = 1;

export interface AnimatorDeps {
  /** Multiplier applied to every frame duration (default 1 / ANIMATION_SPEED). Per-animation `timeScale` overrides. */
  timeScale?: number;
  /** prefers-reduced-motion: damp big bounces/wobbles (enter/exit animations are exempt). */
  reducedMotion?: boolean;
  render(p: Pose): void;
  now?(): number;
  raf?(cb: (t: number) => void): number;
  caf?(id: number): void;
  rng?: Rng;
}
export type AnimEnd = 'completed' | 'exited' | 'replaced';

export class Animator {
  private anim: Animation | null = null;
  private frameIndex = 0;
  private frameStart = 0;
  private startPose: Pose = NEUTRAL;
  private target: Pose = NEUTRAL;
  private exiting = false;
  private rafId: number | null = null;
  private resolve: ((e: AnimEnd) => void) | null = null;
  private current: Pose = NEUTRAL;
  private scale = 1;
  reducedMotion = false;
  private overlay: ((p: Pose) => Pose) | null = null;
  private readonly defaultScale: number;

  private readonly render: (p: Pose) => void;
  private readonly now: () => number;
  private readonly raf: (cb: (t: number) => void) => number;
  private readonly caf: (id: number) => void;
  private readonly rng: Rng;

  constructor(deps: AnimatorDeps) {
    this.render = deps.render;
    this.now = deps.now ?? (() => performance.now());
    this.raf = deps.raf ?? ((cb) => requestAnimationFrame(cb));
    this.caf = deps.caf ?? ((id) => cancelAnimationFrame(id));
    this.rng = deps.rng ?? Math.random;
    this.reducedMotion = deps.reducedMotion ?? false;
    this.defaultScale = deps.timeScale ?? 1 / ANIMATION_SPEED;
    if (typeof import.meta !== 'undefined' && (import.meta as { env?: { DEV?: boolean } }).env?.DEV) {
      (globalThis as Record<string, unknown>).__pcDebug = { rafActive: () => this.rafId !== null };
    }
  }

  get animating(): boolean {
    return this.anim !== null;
  }

  get pose(): Pose {
    return this.current;
  }

  play(anim: Animation): Promise<AnimEnd> {
    this.finish('replaced');
    return new Promise<AnimEnd>((resolve) => {
      this.resolve = resolve;
      this.anim = anim;
      this.scale = anim.timeScale ?? this.defaultScale;
      this.exiting = false;
      this.frameIndex = 0;
      this.startPose = this.current;
      this.target = this.resolveTarget(0, NEUTRAL);
      this.frameStart = this.now();
      this.schedule();
    });
  }

  exit(): void {
    if (this.anim) this.exiting = true;
  }

  stop(): void {
    this.finish('replaced');
  }

  /** Applied on top of every rendered pose (eye-follow); the underlying pose is left untouched. */
  setOverlay(fn: ((p: Pose) => Pose) | null): void {
    this.overlay = fn;
  }

  /** Re-render the current pose (e.g. after the overlay changed) without starting a loop. */
  refresh(): void {
    if (!this.anim) this.render(this.overlay ? this.overlay(this.current) : this.current);
  }

  setPose(p: Pose): void {
    this.finish('replaced');
    this.current = p;
    this.render(this.overlay ? this.overlay(p) : p);
  }

  step(now: number): void {
    const anim = this.anim;
    if (!anim) return;
    for (;;) {
      const fr = anim.frames[this.frameIndex];
      const dur = fr.duration * this.scale;
      const t = dur === 0 ? 1 : Math.min(1, (now - this.frameStart) / dur);
      const lp = lerpPose(this.startPose, this.target, EASE[fr.ease ?? 'inOut'](t));
      this.show(this.reducedMotion && !anim.essential ? dampPose(lp) : lp);
      if (t < 1) {
        this.schedule();
        return;
      }
      const next = this.nextIndex(anim, this.frameIndex);
      if (next >= anim.frames.length) {
        this.show(this.reducedMotion && !anim.essential ? dampPose(this.target) : this.target);
        this.finish(this.exiting ? 'exited' : 'completed');
        return;
      }
      this.startPose = this.target;
      this.target = this.resolveTarget(next, this.target);
      this.frameIndex = next;
      this.frameStart = now;
    }
  }

  private resolveTarget(index: number, prev: Pose): Pose {
    const fr = (this.anim as Animation).frames[index];
    return fr.pose ? mergePose(NEUTRAL, fr.pose) : prev;
  }

  private nextIndex(anim: Animation, i: number): number {
    const fr = anim.frames[i];
    if (this.exiting && anim.useExitBranching && fr.exitBranch !== undefined) return fr.exitBranch;
    if (fr.branching) {
      const r = this.rng() * 100;
      let acc = 0;
      for (const b of fr.branching.branches) {
        acc += b.weight;
        if (r < acc) return b.frameIndex;
      }
    }
    return i + 1;
  }

  private show(p: Pose): void {
    this.current = p;
    this.render(this.overlay ? this.overlay(p) : p);
  }

  private schedule(): void {
    if (this.rafId !== null) return;
    this.rafId = this.raf((t) => {
      this.rafId = null;
      this.step(t);
    });
  }

  private finish(end: AnimEnd): void {
    if (this.rafId !== null) {
      this.caf(this.rafId);
      this.rafId = null;
    }
    const res = this.resolve;
    this.anim = null;
    this.resolve = null;
    res?.(end);
  }
}
