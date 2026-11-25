/** Tap the yoga mat to bounce Paperclip; every extra tap queues another jump (trampoline). */
export const MAX_PENDING_JUMPS = 4;

export interface JumpAgent {
  readonly busy: boolean;
  play(name: 'Jump'): Promise<void>;
  interrupt(): void;
}

export class JumpCombo {
  pending = 0;

  constructor(private readonly agent: JumpAgent) {}

  tap(): void {
    if (this.pending >= MAX_PENDING_JUMPS) return;
    // Cut short whatever idle animation is playing so the first bounce feels instant,
    // but never interrupt our own queued jumps.
    if (this.pending === 0 && this.agent.busy) this.agent.interrupt();
    this.pending++;
    void this.agent.play('Jump').finally(() => { this.pending--; });
  }
}
