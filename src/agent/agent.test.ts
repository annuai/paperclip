import { describe, expect, it } from 'vitest';
import { Agent } from './agent';
import type { Animator } from '../anim/animator';
import type { AnimEnd } from '../anim/animator';
import type { Animation } from '../anim/types';
import { ANIMATIONS } from '../anim/animations';

function setup() {
  const log: string[] = [];
  const names = new Map<Animation, string>(Object.entries(ANIMATIONS).map(([k, v]) => [v, k]));
  const animator = {
    play: async (a: Animation): Promise<AnimEnd> => {
      log.push('play:' + names.get(a));
      await new Promise((r) => setTimeout(r, 5));
      return 'completed';
    },
    exit: () => log.push('exit'),
  } as unknown as Animator;
  const balloon = {
    visible: false,
    speak: async (t: string) => { log.push('speak:' + t); await new Promise((r) => setTimeout(r, 5)); return 'done' as const; },
    close: () => log.push('close'),
  };
  const win = { show: async () => { log.push('win.show'); }, hide: async () => { log.push('win.hide'); } };
  return { agent: new Agent({ animator, balloon, win }), log };
}

describe('Agent', () => {
  it('runs actions in order', async () => {
    const { agent, log } = setup();
    void agent.play('Wave');
    void agent.speak('hello');
    await agent.play('Blink');
    expect(log.filter((l) => l !== 'exit')).toEqual(['play:Wave', 'play:Explain', 'speak:hello', 'play:Blink']);
    expect(agent.busy).toBe(false);
  });

  it('interrupt resolves queued actions, calls exit() and close()', async () => {
    const { agent, log } = setup();
    void agent.play('Wave');
    const q1 = agent.play('Blink');
    const q2 = agent.speak('x');
    agent.interrupt();
    await Promise.all([q1, q2]);
    expect(log).toContain('exit');
    expect(log).toContain('close');
    expect(log).not.toContain('play:Blink');
    expect(log).not.toContain('speak:x');
  });

  it('ignores actions while hidden except show', async () => {
    const { agent, log } = setup();
    await agent.hide();
    expect(agent.hidden).toBe(true);
    await agent.play('Wave');
    await agent.speak('nope');
    expect(log).not.toContain('play:Wave');
    expect(log).not.toContain('speak:nope');
    await agent.show();
    expect(agent.hidden).toBe(false);
    expect(log).toContain('win.show');
    await agent.play('Wave');
    expect(log).toContain('play:Wave');
  });

  it('fires onIdle when the queue drains', async () => {
    const { agent } = setup();
    let n = 0;
    agent.onIdle(() => n++);
    await agent.play('Blink');
    await new Promise((r) => setTimeout(r, 0));
    expect(n).toBe(1);
  });
});
