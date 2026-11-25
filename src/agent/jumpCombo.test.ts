import { describe, expect, it, vi } from 'vitest';
import { JumpCombo, MAX_PENDING_JUMPS } from './jumpCombo';

function fakeAgent() {
  const resolvers: Array<() => void> = [];
  return {
    resolvers,
    busy: false,
    play: vi.fn(() => new Promise<void>((r) => resolvers.push(r))),
    interrupt: vi.fn(),
  };
}

describe('JumpCombo (tap the mat to bounce)', () => {
  it('one tap plays one Jump', () => {
    const a = fakeAgent();
    const combo = new JumpCombo(a);
    combo.tap();
    expect(a.play).toHaveBeenCalledWith('Jump');
    expect(a.play).toHaveBeenCalledTimes(1);
  });

  it('every extra tap queues another jump, so he keeps jumping', () => {
    const a = fakeAgent();
    const combo = new JumpCombo(a);
    combo.tap(); combo.tap(); combo.tap();
    expect(a.play).toHaveBeenCalledTimes(3);
    expect(combo.pending).toBe(3);
  });

  it('caps queued jumps so frantic tapping cannot build an endless backlog', () => {
    const a = fakeAgent();
    const combo = new JumpCombo(a);
    for (let i = 0; i < 20; i++) combo.tap();
    expect(a.play).toHaveBeenCalledTimes(MAX_PENDING_JUMPS);
  });

  it('pending count drops as jumps finish, allowing more taps', async () => {
    const a = fakeAgent();
    const combo = new JumpCombo(a);
    for (let i = 0; i < MAX_PENDING_JUMPS; i++) combo.tap();
    a.resolvers.shift()!();
    await Promise.resolve(); await Promise.resolve();
    expect(combo.pending).toBe(MAX_PENDING_JUMPS - 1);
    combo.tap();
    expect(a.play).toHaveBeenCalledTimes(MAX_PENDING_JUMPS + 1);
  });

  it('interrupts an unrelated animation on the first tap so the jump feels instant', () => {
    const a = fakeAgent();
    a.busy = true;
    const combo = new JumpCombo(a);
    combo.tap();
    expect(a.interrupt).toHaveBeenCalledTimes(1);
    combo.tap();
    expect(a.interrupt).toHaveBeenCalledTimes(1); // never interrupts its own queued jumps
  });
});
