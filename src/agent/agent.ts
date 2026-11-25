import { ANIMATIONS, ENTER_ANIMS, EXIT_ANIMS, isLooping } from '../anim/animations';
import type { Rng } from '../util/rng';
import type { Animator } from '../anim/animator';
import type { Animation, AnimName } from '../anim/types';

export interface BalloonAction { id: string; label: string }
export interface BalloonLike {
  speak(text: string, attribution?: string, actions?: BalloonAction[]): Promise<string>;
  close(): void;
  readonly visible: boolean;
}
export interface WindowCtl { show(): Promise<void>; hide(): Promise<void> }
export type Action =
  | { type: 'play'; name: AnimName; timeoutMs?: number }
  | { type: 'speak'; text: string; attribution?: string; actions?: BalloonAction[]; result?: (r: string) => void }
  | { type: 'wait'; ms: number }
  | { type: 'show' }
  | { type: 'hide' };

interface QueueItem { action: Action; resolve: () => void }

export class Agent {
  private readonly animator: Animator;
  private readonly balloon: BalloonLike;
  private readonly win: WindowCtl;
  private readonly animations: Record<AnimName, Animation>;
  private readonly enters: AnimName[];
  private readonly exits: AnimName[];
  private readonly rng: Rng;
  private queue: QueueItem[] = [];
  private running = false;
  private isHidden = false;
  private idleCbs = new Set<() => void>();
  private waitTimer: ReturnType<typeof setTimeout> | null = null;
  private waitResolve: (() => void) | null = null;

  constructor(deps: { animator: Animator; balloon: BalloonLike; win: WindowCtl; animations?: Record<AnimName, Animation>; enter?: AnimName[]; exit?: AnimName[]; rng?: Rng }) {
    this.animator = deps.animator;
    this.balloon = deps.balloon;
    this.win = deps.win;
    this.animations = deps.animations ?? ANIMATIONS;
    this.enters = deps.enter ?? ENTER_ANIMS;
    this.exits = deps.exit ?? EXIT_ANIMS;
    this.rng = deps.rng ?? Math.random;
  }

  get busy(): boolean {
    return this.running || this.queue.length > 0;
  }

  get hidden(): boolean {
    return this.isHidden;
  }

  play(name: AnimName, timeoutMs?: number): Promise<void> { return this.enqueue({ type: 'play', name, timeoutMs }); }
  speak(text: string, attribution?: string): Promise<void> { return this.enqueue({ type: 'speak', text, attribution }); }
  /** Speak with action buttons; resolves with the chosen id, 'done' (timed out) or 'closed' (interrupted/dropped). */
  ask(text: string, actions: BalloonAction[], attribution?: string): Promise<string> {
    return new Promise<string>((resolve) => {
      let got = false;
      void this.enqueue({ type: 'speak', text, attribution, actions, result: (r) => { got = true; resolve(r); } })
        .then(() => { if (!got) resolve('closed'); });
    });
  }
  wait(ms: number): Promise<void> { return this.enqueue({ type: 'wait', ms }); }
  show(): Promise<void> { return this.enqueue({ type: 'show' }); }
  hide(): Promise<void> { return this.enqueue({ type: 'hide' }); }

  /** `hard` also halts the current animation immediately (used to wake from the Sleeping loop). */
  interrupt(hard = false): void {
    const dropped = this.queue;
    this.queue = [];
    for (const q of dropped) q.resolve();
    if (this.waitTimer !== null) {
      clearTimeout(this.waitTimer);
      this.waitTimer = null;
      this.waitResolve?.();
      this.waitResolve = null;
    }
    this.animator.exit();
    if (hard) this.animator.stop();
    this.balloon.close();
  }

  onIdle(cb: () => void): () => void {
    this.idleCbs.add(cb);
    return () => this.idleCbs.delete(cb);
  }

  private pickOf(list: AnimName[]): AnimName {
    return list[Math.min(list.length - 1, Math.floor(this.rng() * list.length))];
  }

  private enqueue(action: Action): Promise<void> {
    return new Promise<void>((resolve) => {
      this.queue.push({ action, resolve });
      void this.pump();
    });
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (let item = this.queue.shift(); item; item = this.queue.shift()) {
        try {
          if (!this.isHidden || item.action.type === 'show') await this.run(item.action);
        } catch (e) {
          console.warn('agent action failed', e);
        }
        item.resolve();
      }
    } finally {
      this.running = false;
    }
    for (const cb of [...this.idleCbs]) cb();
  }

  private async run(a: Action): Promise<void> {
    switch (a.type) {
      case 'play': {
        const anim = this.animations[a.name];
        let timer: ReturnType<typeof setTimeout> | null = null;
        if (isLooping(anim) && a.timeoutMs !== Infinity) timer = setTimeout(() => this.animator.exit(), a.timeoutMs ?? 3000);
        try {
          await this.animator.play(anim);
        } finally {
          if (timer !== null) clearTimeout(timer);
        }
        return;
      }
      case 'speak': {
        const explain = this.animator.play(this.animations.Explain);
        const r = await this.balloon.speak(a.text, a.attribution, a.actions);
        a.result?.(r);
        this.animator.exit();
        await explain;
        return;
      }
      case 'wait':
        await new Promise<void>((resolve) => {
          this.waitResolve = resolve;
          this.waitTimer = setTimeout(() => {
            this.waitTimer = null;
            this.waitResolve = null;
            resolve();
          }, a.ms);
        });
        return;
      case 'show':
        await this.win.show();
        this.isHidden = false;
        await this.animator.play(this.animations[this.pickOf(this.enters)]);
        return;
      case 'hide':
        await this.animator.play(this.animations[this.pickOf(this.exits)]);
        await this.win.hide();
        this.isHidden = true;
        return;
    }
  }
}
