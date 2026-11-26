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

  it('ask with an animation plays that animation with the balloon (not Explain) and still reports the choice', async () => {
    const { agent, log } = setup();
    const r = await agent.ask('Yes I can!', [{ id: 'done', label: 'Done' }], undefined, 'Jump');
    expect(r).toBe('done');
    expect(log.filter((l) => l.startsWith('play:'))).toEqual(['play:Jump']);
    expect(log).toContain('speak:Yes I can!');
  });

  it('speakAnimated plays the named animation, lets it finish, and reports the balloon result', async () => {
    const { agent, log } = setup();
    const r = await agent.speakAnimated('reach up', 'StretchReach');
    expect(r).toBe('done');
    expect(log).toEqual(['play:StretchReach', 'speak:reach up']); // no exit(): the pose plays out on its own
  });

  it('epoch changes on every interrupt', () => {
    const { agent } = setup();
    const e = agent.epoch;
    agent.interrupt();
    expect(agent.epoch).toBe(e + 1);
  });
  it('prompt() shows the input via the balloon, resolves with the typed text and lets Explain stop afterwards', async () => {
    const log: string[] = [];
    const names = new Map<Animation, string>(Object.entries(ANIMATIONS).map(([k, v]) => [v, k]));
    const animator = { play: async (a: Animation) => { log.push('play:' + names.get(a)); await new Promise((r) => setTimeout(r, 5)); return 'completed' as const; }, exit: () => log.push('exit') } as unknown as Animator;
    const balloon = {
      visible: false,
      speak: async () => 'done',
      prompt: async (t: string, o: { secret?: boolean }) => { log.push(`prompt:${t}:${o.secret}`); return 'typed'; },
      close: () => undefined,
    };
    const agent = new Agent({ animator, balloon, win: { show: async () => undefined, hide: async () => undefined } });
    expect(await agent.prompt('Q?', { secret: true })).toBe('typed');
    expect(log).toEqual(['play:Explain', 'prompt:Q?:true', 'exit']);
  });

  it('prompt() resolves null when interrupted before it runs, or when the balloon cannot prompt', async () => {
    const { agent } = setup();
    void agent.play('Wave');
    const p = agent.prompt('Q?');
    agent.interrupt();
    expect(await p).toBeNull();
    expect(await agent.prompt('Q?')).toBeNull(); // the test balloon has no prompt()
  });

  it('hold() plays until stopped, and is skipped when stopped before it starts', async () => {
    const { agent, log } = setup();
    void agent.play('Wave');
    const stop = agent.hold('Thinking');
    stop(); // the animation never started
    await agent.play('Blink');
    expect(log).not.toContain('play:Thinking');
    const stop2 = agent.hold('Thinking');
    await new Promise((r) => setTimeout(r, 1)); // let Wave and Blink... queue is empty so Thinking starts
    stop2();
    await agent.play('Blink');
    expect(log.filter((l) => l === 'play:Thinking')).toHaveLength(1);
    expect(log.filter((l) => l === 'exit').length).toBeGreaterThanOrEqual(2);
  });
});

describe('Agent.hide with a chosen exit', () => {
  it('plays that animation, then hides the window', async () => {
    const { agent, log } = setup();
    await agent.hide('ExitRollUp');
    expect(log).toEqual(['play:ExitRollUp', 'win.hide']);
    expect(agent.hidden).toBe(true);
  });
});
