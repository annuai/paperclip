import { describe, expect, it } from 'vitest';
import { runIntent, CREATOR_REPLY, CAPABILITIES_REPLY, HIDE_REPLY } from './intentRunner';
import type { IntentDeps } from './intentRunner';
import { matchIntent } from './intents';
import type { Intent } from './intents';

function rig(init: { focusLeft?: number | null; waterOn?: boolean; interval?: number; glasses?: number; style?: 'classic' | 'flat' } = {}) {
  const log: string[] = [];
  const st = { focusLeft: init.focusLeft ?? null, waterOn: init.waterOn ?? false, glasses: init.glasses ?? 0, style: init.style ?? 'classic' };
  const deps: IntentDeps = {
    play: (a) => log.push(`play:${a}`),
    focusLeft: () => st.focusLeft,
    startTimer: (m) => { st.focusLeft = m; log.push(`start:${m}`); },
    stopTimer: () => { st.focusLeft = null; log.push('stop'); },
    water: {
      enabled: () => st.waterOn,
      intervalMin: () => init.interval ?? 45,
      setEnabled: (on) => { st.waterOn = on; log.push(`water:${on}`); },
      logGlass: () => { st.glasses++; log.push('glass'); return st.glasses; },
    },
    content: async (k) => (k === 'joke' ? { text: 'A joke.' } : { text: 'A quote.', attribution: 'Someone' }),
    stretch: async () => { log.push('stretch'); },
    nap: async () => { log.push('nap'); },
    hide: async () => { log.push('hide'); },
    style: () => st.style,
    setStyle: (s) => { st.style = s; log.push(`style:${s}`); },
  };
  return { deps, log, st };
}
const run = (r: ReturnType<typeof rig>, i: Intent | string) => runIntent(typeof i === 'string' ? (matchIntent(i) as Intent) : i, r.deps);

describe('runIntent', () => {
  it('about and capabilities: fixed lines, a greeting animation, and the capabilities fit the balloon', async () => {
    const r = rig();
    expect(await run(r, 'who made you')).toMatchObject({ reply: CREATOR_REPLY, anim: 'Wave' });
    expect(CREATOR_REPLY).toBe("I was built by a designer called Annuai, and I'm inspired by the original Microsoft Clippy!");
    expect(await run(r, 'what can you do')).toMatchObject({ reply: CAPABILITIES_REPLY });
    expect(CAPABILITIES_REPLY.length).toBeLessThanOrEqual(220);
    expect(CAPABILITIES_REPLY).toMatch(/focus timer/);
  });

  it('animate: reply plus the animation; a repeat plays the extra rounds up front', async () => {
    const r = rig();
    expect(await run(r, 'can you jump')).toEqual({ reply: 'Yes I can!', anim: 'Jump' });
    expect(r.log).toEqual([]);
    const b = await run(r, 'can you blink');
    expect(b.anim).toBe('Blink');
    expect(b.reply).toBe('Yes I can! *blink*');
    expect(r.log).toEqual(['play:Blink']); // the second blink is the animation that goes with the balloon
  });

  it('nap goes through the nap command after he has answered', async () => {
    const r = rig();
    const res = await run(r, 'take a nap');
    expect(res.reply).toMatch(/nap/i);
    expect(r.log).toEqual([]);
    await res.after?.();
    expect(r.log).toEqual(['nap']);
  });

  it('startTimer: starts it and confirms in his voice; 1 minute is singular', async () => {
    const r = rig();
    expect((await run(r, 'start a 25 minute timer')).reply).toBe('Done! 25-minute focus timer started.');
    expect(r.log).toEqual(['start:25']);
    expect((await run(r, 'start a 137 minute timer')).reply).toBe('Done! 137-minute focus timer started.');
    expect(r.log[r.log.length - 1]).toBe('start:137');
    expect((await run(r, 'start a 1 minute timer')).reply).toBe('Done! 1-minute focus timer started.');
  });
  it('timerRange starts nothing and says what he can do', async () => {
    const r = rig();
    const res = await run(r, 'start a 500 minute timer');
    expect(res.reply).toMatch(/1 to 180/);
    expect(r.log).toEqual([]);
  });
  it('stop and time left, running or not', async () => {
    const r = rig({ focusLeft: 12 });
    expect((await run(r, 'how much time is left')).reply).toBe('12 minutes left on your focus timer.');
    r.st.focusLeft = 1;
    expect((await run(r, 'time left')).reply).toBe('1 minute left on your focus timer.');
    expect((await run(r, 'stop the timer')).reply).toBe('Okay, timer stopped.');
    expect(r.log).toEqual(['stop']);
    expect((await run(r, 'stop the timer')).reply).toMatch(/no timer/i);
    expect(r.log).toEqual(['stop']); // nothing to stop the second time
    expect((await run(r, 'how much time is left')).reply).toMatch(/no timer/i);
  });

  it('water on: turns it on and says how often; already on just says so', async () => {
    const r = rig({ interval: 30 });
    expect((await run(r, 'remind me to drink water')).reply).toBe("You got it! I'll remind you to drink water every 30 minutes.");
    expect(r.log).toEqual(['water:true']);
    expect((await run(r, 'remind me to drink water')).reply).toBe("Water reminders are already on. I'll nudge you every 30 minutes.");
    expect(r.log).toEqual(['water:true']);
    const h = rig({ interval: 60 });
    expect((await run(h, 'remind me to drink water')).reply).toContain('every hour');
    expect((await run(r, 'turn off water reminders')).reply).toMatch(/off/i);
    expect(r.st.waterOn).toBe(false);
  });
  it('drank water: logs a glass and counts today', async () => {
    const r = rig({ glasses: 2 });
    const res = await run(r, 'i drank water');
    expect(r.log).toEqual(['glass']);
    expect(res.reply).toBe("Nice! That's glass number 3 today.");
    expect(res.anim).toBe('Congratulate');
    expect((await run(rig(), 'i drank water')).reply).toBe("Nice! That's your first glass today.");
  });

  it('joke and quote come from the content providers (quote keeps its attribution)', async () => {
    const r = rig();
    expect(await run(r, 'tell me a joke')).toEqual({ reply: 'A joke.' });
    expect(await run(r, 'give me a quote')).toEqual({ reply: 'A quote.', attribution: 'Someone' });
  });

  it('stretch and hide answer first, then act', async () => {
    const r = rig();
    const s = await run(r, "let's stretch");
    expect(s.reply).toMatch(/stretch/i);
    expect(r.log).toEqual([]);
    await s.after?.();
    expect(r.log).toEqual(['stretch']);
    const h = await run(r, 'go away');
    expect(h.reply).toBe(HIDE_REPLY);
    expect(HIDE_REPLY).toBe('Bye! Click the menu-bar icon to bring me back.');
    await h.after?.();
    expect(r.log).toEqual(['stretch', 'hide']);
  });

  it('style: toggle flips, explicit sets, same style just says so', async () => {
    const r = rig({ style: 'classic' });
    expect((await run(r, 'change style')).reply).toMatch(/flat/i);
    expect(r.st.style).toBe('flat');
    expect((await run(r, 'change style')).reply).toMatch(/classic/i);
    expect(r.st.style).toBe('classic');
    r.log.length = 0;
    expect((await run(r, 'classic style')).reply).toMatch(/already/i);
    expect(r.log).toEqual([]);
    await run(r, 'flat style');
    expect(r.log).toEqual(['style:flat']);
  });
});
