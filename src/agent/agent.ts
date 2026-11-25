import { ANIMATIONS, ENTER_ANIMS, EXIT_ANIMS, isLooping } from '../anim/animations';
import type { Rng } from '../util/rng';
import type { Animator } from '../anim/animator';
import type { Animation, AnimName } from '../anim/types';

export interface BalloonAction { id: string; label: string }
export interface PromptOpts { secret?: boolean; placeholder?: string; maxLength?: number }
export interface BalloonLike {
  speak(text: string, attribution?: string, actions?: BalloonAction[]): Promise<string>;
  /** A text input in the balloon: resolves with the typed text (Enter) or null (Esc, interrupt). */
  prompt?(text: string, opts: PromptOpts): Promise<string | null>;
  close(): void;
  readonly visible: boolean;
}
export interface WindowCtl { show(): Promise<void>; hide(): Promise<void> }
export type Action =
  | { type: 'play'; name: AnimName; timeoutMs?: number }
  | { type: 'speak'; text: string; attribution?: string; actions?: BalloonAction[]; anim?: AnimName; result?: (r: string) => void }
  | { type: 'prompt'; text: string; opts: PromptOpts; result?: (r: string | null) => void }
  | { type: 'think'; name: AnimName; stopped: () => boolean }
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
  private interrupts = 0;
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
  /**
   * Speak while a specific animation plays (instead of the looping Explain), and let it play out even
   * after the balloon is gone. Resolves with the balloon result ('closed' also means interrupted).
   * A balloon the user closed cuts the animation short, so a guided sequence can stop on a click.
   */
  speakAnimated(text: string, anim: AnimName): Promise<string> {
    return new Promise<string>((resolve) => {
      let got = false;
      void this.enqueue({ type: 'speak', text, anim, result: (r) => { got = true; resolve(r); } })
        .then(() => { if (!got) resolve('closed'); });
    });
  }
  /** Show an input in the balloon; resolves with the typed text, or null when cancelled / interrupted / dropped. */
  prompt(text: string, opts: PromptOpts = {}): Promise<string | null> {
    return new Promise<string | null>((resolve) => {
      let got = false;
      void this.enqueue({ type: 'prompt', text, opts, result: (r) => { got = true; resolve(r); } })
        .then(() => { if (!got) resolve(null); });
    });
  }
  /**
   * Plays a looping animation until the returned function is called (a "waiting for an answer" pose).
   * Safe if stop() arrives before the animation even started: it is then skipped.
   */
  hold(name: AnimName): () => void {
    let stopped = false;
    void this.enqueue({ type: 'think', name, stopped: () => stopped });
    return () => {
      stopped = true;
      this.animator.exit();
    };
  }
  wait(ms: number): Promise<void> { return this.enqueue({ type: 'wait', ms }); }
  show(): Promise<void> { return this.enqueue({ type: 'show' }); }
  hide(): Promise<void> { return this.enqueue({ type: 'hide' }); }

  /** Counts interrupts: a long-running routine can compare it to notice that something else took over. */
  get epoch(): number {
    return this.interrupts;
  }

  /** `hard` also halts the current animation immediately (used to wake from the Sleeping loop). */
  interrupt(hard = false): void {
    this.interrupts++;
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
        const explain = this.animator.play(this.animations[a.anim ?? 'Explain']);
        const r = await this.balloon.speak(a.text, a.attribution, a.actions);
        a.result?.(r);
        // Explain loops until told to stop; a named animation plays out, unless the balloon was closed on it.
        if (!a.anim || r === 'closed') this.animator.exit();
        await explain;
        return;
      }
      case 'prompt': {
        const explain = this.animator.play(this.animations.Explain);
        const r = this.balloon.prompt ? await this.balloon.prompt(a.text, a.opts) : null;
        a.result?.(r);
        this.animator.exit();
        await explain;
        return;
      }
      case 'think': {
        if (a.stopped()) return;
        const playing = this.animator.play(this.animations[a.name]);
        if (a.stopped()) this.animator.exit();
        await playing;
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
