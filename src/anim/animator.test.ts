import { describe, expect, it } from 'vitest';
import { ANIMATIONS, ENTER_ANIMS, EXIT_ANIMS, IDLE_ANIMS, SHOWY_ANIMS, SLEEP_POSE, isLooping } from './animations';
import { Animator } from './animator';
import { HIDDEN, NEUTRAL, mergePose, poseEquals } from './pose';
import type { Pose } from './pose';
import type { Animation, AnimName } from './types';
import { mulberry32 } from '../util/rng';

function harness(rng: () => number = mulberry32(42)) {
  let clock = 0;
  let nextId = 1;
  const pending = new Map<number, (t: number) => void>();
  const rendered: Pose[] = [];
  const animator = new Animator({
    render: (p) => rendered.push(p),
    now: () => clock,
    raf: (cb) => { const id = nextId++; pending.set(id, cb); return id; },
    caf: (id) => { pending.delete(id); },
    rng,
    timeScale: 1,
  });
  const advance = (ms: number) => { clock += ms; animator.step(clock); };
  return { animator, advance, pending, rendered, get clock() { return clock; } };
}

const linear = (tilt: number): Animation => ({
  frames: [{ duration: 100, pose: { body: { tilt } }, ease: 'linear' }],
});

describe('Animator', () => {
  it('interpolates halfway', () => {
    const h = harness();
    void h.animator.play(linear(10));
    h.advance(50);
    expect(h.animator.pose.body.tilt).toBeCloseTo(5);
  });

  it('snaps zero-duration frames, completes, and leaves no pending rAF', async () => {
    const h = harness();
    const p = h.animator.play({ frames: [{ duration: 0, pose: { body: { tilt: 7 } } }] });
    h.advance(1);
    expect(await p).toBe('completed');
    expect(h.animator.pose.body.tilt).toBe(7);
    expect(h.pending.size).toBe(0);
    expect(h.animator.animating).toBe(false);
  });

  it('only ever has one rAF outstanding', () => {
    const h = harness();
    void h.animator.play(linear(10));
    h.advance(10);
    h.advance(10);
    expect(h.pending.size).toBe(1);
  });

  it('branching follows rng', async () => {
    const make = (): Animation => ({
      frames: [
        { duration: 0, pose: { body: { tilt: 1 } } },
        { duration: 10, pose: { body: { tilt: 2 } }, branching: { branches: [{ frameIndex: 0, weight: 20 }] } },
        { duration: 10, pose: { body: { tilt: 3 } } },
      ],
    });
    const a = harness(() => 0.1);
    void a.animator.play(make());
    a.advance(0);
    a.advance(10);
    expect(a.animator.pose.body.tilt).toBe(1); // jumped back to frame 0
    const b = harness(() => 0.5);
    const pb = b.animator.play(make());
    b.advance(0);
    b.advance(10);
    b.advance(10);
    expect(await pb).toBe('completed');
    expect(b.animator.pose.body.tilt).toBe(3);
  });

  it('exit leaves a looping animation via exitBranch', async () => {
    const h = harness();
    const p = h.animator.play(ANIMATIONS.Thinking);
    for (let i = 0; i < 125; i++) h.advance(16);
    expect(h.animator.animating).toBe(true);
    h.animator.exit();
    let done: string | null = null;
    void p.then((e) => (done = e));
    for (let i = 0; i < 200 && h.animator.animating; i++) h.advance(16);
    expect(await p).toBe('exited');
    expect(done).toBe('exited');
    expect(poseEquals(h.animator.pose, NEUTRAL)).toBe(true);
  });

  it('play while playing resolves the first as replaced and starts from displayed pose', async () => {
    const h = harness();
    const first = h.animator.play(linear(10));
    h.advance(50);
    const before = h.animator.pose.body.tilt;
    const second = h.animator.play(linear(0));
    expect(await first).toBe('replaced');
    h.advance(0);
    expect(h.animator.pose.body.tilt).toBeCloseTo(before);
    h.advance(100);
    expect(await second).toBe('completed');
  });
});

describe('render overlay (eye follow)', () => {
  it('is applied on top of every rendered pose, including animation frames, and can be cleared', () => {
    const h = harness();
    h.animator.setOverlay((p) => ({ ...p, pupils: { ...p.pupils, x: 0.5 } }));
    void h.animator.play(linear(10));
    h.advance(50);
    expect(h.rendered[h.rendered.length - 1].pupils.x).toBe(0.5);
    expect(h.animator.pose.pupils.x).toBe(0); // the underlying pose is untouched
    h.animator.setOverlay(null);
    h.advance(10);
    expect(h.rendered[h.rendered.length - 1].pupils.x).toBe(0);
  });
  it('refresh() re-renders the current pose without an animation or a rAF', () => {
    const h = harness();
    h.animator.setOverlay((p) => ({ ...p, pupils: { ...p.pupils, y: -0.4 } }));
    h.animator.refresh();
    expect(h.rendered[h.rendered.length - 1].pupils.y).toBe(-0.4);
    expect(h.pending.size).toBe(0);
  });
});

describe('Drink', () => {
  it('ends neutral with the glass hidden, within ~2.5 s, and shows the glass mid-way', async () => {
    const h = harness();
    const p = h.animator.play(ANIMATIONS.Drink);
    let t = 0;
    let maxGlass = 0;
    while (h.animator.animating && t < 4000) { h.advance(16); t += 16; maxGlass = Math.max(maxGlass, h.animator.pose.props.glass.v); }
    await p;
    expect(maxGlass).toBe(1);
    expect(h.animator.pose.props.glass.v).toBe(0);
    expect(poseEquals(h.animator.pose, NEUTRAL)).toBe(true);
    expect(t).toBeGreaterThan(1800);
    expect(t).toBeLessThan(2600);
  });
});

describe('presence animations', () => {
  async function runFull(n: AnimName) {
    const h = harness();
    const p = h.animator.play(ANIMATIONS[n]);
    let t = 0;
    let sweat = 0;
    let mouth = 0;
    let lids = 0;
    while (h.animator.animating && t < 4000) {
      h.advance(16);
      t += 16;
      sweat = Math.max(sweat, h.animator.pose.props.sweat.v);
      mouth = Math.max(mouth, h.animator.pose.mouth);
      lids = Math.max(lids, h.animator.pose.lids.l);
    }
    await p;
    return { t, sweat, mouth, lids, pose: h.animator.pose };
  }
  it('Sweat shows the drop mid-way, then hides it and ends neutral within 3 s', async () => {
    const r = await runFull('Sweat');
    expect(r.sweat).toBe(1);
    expect(r.pose.props.sweat.v).toBe(0);
    expect(poseEquals(r.pose, NEUTRAL)).toBe(true);
    expect(r.t).toBeLessThan(3000);
  });
  it('Tired droops the lids; Yawn opens the mouth wide; Dance uses sparkles; all end neutral', async () => {
    const tired = await runFull('Tired');
    expect(tired.lids).toBeGreaterThan(0.7);
    const yawn = await runFull('Yawn');
    expect(yawn.mouth).toBe(1);
    const dance = await runFull('Dance');
    expect(dance.pose.props.sparkles.v).toBe(0);
    for (const r of [tired, yawn, dance]) {
      expect(poseEquals(r.pose, NEUTRAL)).toBe(true);
      expect(r.t).toBeGreaterThan(1500);
      expect(r.t).toBeLessThan(3000);
    }
  });
});

describe('reduced motion', () => {
  it('damps bounces but not enter/exit, and keeps blinks', () => {
    const h = harness();
    h.animator.reducedMotion = true;
    void h.animator.play(linear(10));
    h.advance(100);
    expect(h.animator.pose.body.tilt).toBeCloseTo(3.5);
    const blink = harness();
    blink.animator.reducedMotion = true;
    void blink.animator.play(ANIMATIONS.Blink);
    blink.advance(80);
    expect(blink.animator.pose.lids.l).toBeCloseTo(1);
    const exit = harness();
    exit.animator.reducedMotion = true;
    void exit.animator.play(ANIMATIONS.ExitSpring);
    for (let i = 0; i < 26; i++) exit.advance(16);
    expect(exit.animator.pose.body.y).toBeLessThan(-300);
  });
});

describe('animation catalogue', () => {
  const names = Object.keys(ANIMATIONS) as AnimName[];
  it('has all 41 names', () => {
    expect(names.sort()).toEqual([
      'Blink', 'Congratulate', 'Dizzy', 'EnterPop', 'EnterSlide', 'EnterTumble', 'ExitRollUp', 'ExitSpring',
      'Drink', 'Noticed', 'ExitWave', 'Explain', 'FallAsleep', 'GetAttention', 'Greeting', 'IdleEyeRoll', 'IdleHeadScratch', 'Jump',
      'IdleSideToSide', 'LookDown', 'LookLeft', 'LookRight', 'LookUp', 'Sleeping', 'Thinking', 'WakeUp', 'Wave',
      'Writing', 'Tired', 'Sweat', 'Dance', 'Yawn', 'Stretch', 'StretchReach', 'StretchSide', 'StretchFold', 'Celebrate',
      'Fling', 'Thud', 'Bump', 'Ooh',
    ].sort());
    for (const n of [...IDLE_ANIMS, ...SHOWY_ANIMS, ...ENTER_ANIMS, ...EXIT_ANIMS]) expect(ANIMATIONS[n]).toBeDefined();
    expect(ENTER_ANIMS.length).toBeGreaterThanOrEqual(3);
    expect(EXIT_ANIMS.length).toBeGreaterThanOrEqual(3);
  });
  it('applies the global time scale (and per-animation override)', () => {
    let clock = 0;
    const mk = (ts?: number) => new Animator({ render: () => undefined, now: () => clock, raf: () => 1, caf: () => undefined, timeScale: ts });
    const a = mk(2);
    clock = 0;
    void a.play({ frames: [{ duration: 100, pose: { body: { tilt: 10 } }, ease: 'linear' }] });
    clock = 100;
    a.step(clock);
    expect(a.pose.body.tilt).toBeCloseTo(5);
    const b = mk(2);
    clock = 0;
    void b.play({ timeScale: 1, frames: [{ duration: 100, pose: { body: { tilt: 10 } }, ease: 'linear' }] });
    clock = 50;
    b.step(clock);
    expect(b.pose.body.tilt).toBeCloseTo(5);
  });
  it('durations are 0 or 40-2000 (2000 only for slow breathing)', () => {
    for (const n of names) for (const fr of ANIMATIONS[n].frames) {
      expect(fr.duration === 0 || (fr.duration >= 40 && fr.duration <= 2000)).toBe(true);
    }
  });
  it('branch indices are in range', () => {
    for (const n of names) {
      const len = ANIMATIONS[n].frames.length;
      for (const fr of ANIMATIONS[n].frames) {
        for (const b of fr.branching?.branches ?? []) expect(b.frameIndex).toBeGreaterThanOrEqual(0), expect(b.frameIndex).toBeLessThan(len);
        if (fr.exitBranch !== undefined) expect(fr.exitBranch).toBeLessThan(len);
      }
    }
  });
  it('looping animations use exit branching with exitBranch on looping frames', () => {
    for (const n of names) {
      const a = ANIMATIONS[n];
      if (!isLooping(a)) continue;
      expect(a.useExitBranching).toBe(true);
      a.frames.forEach((fr, i) => {
        if (fr.branching?.branches.some((b) => b.frameIndex <= i)) expect(fr.exitBranch).toBeDefined();
      });
    }
    expect(isLooping(ANIMATIONS.Thinking)).toBe(true);
    expect(isLooping(ANIMATIONS.Wave)).toBe(false);
  });
  const sleepEnd = mergePose(NEUTRAL, SLEEP_POSE);
  async function runToEnd(n: AnimName) {
    const h = harness();
    const p = h.animator.play(ANIMATIONS[n]);
    h.animator.exit();
    let t = 0;
    while (h.animator.animating && t < 5000) { h.advance(16); t += 16; }
    expect(h.animator.animating, n).toBe(false);
    await p;
    return { pose: h.animator.pose, ms: t };
  }
  it('every enter variant ends visible with the mat fully unrolled', async () => {
    for (const n of ENTER_ANIMS) {
      const { pose } = await runToEnd(n);
      expect(poseEquals(pose, NEUTRAL), n).toBe(true);
      expect(pose.opacity).toBe(1);
      expect(pose.mat.unroll).toBe(1);
      expect(pose.mat.visible).toBe(1);
    }
  });
  it('every enter variant starts hidden-ish (mat rolled or hidden, clip not yet visible)', () => {
    for (const n of ENTER_ANIMS) {
      const first = mergePose(NEUTRAL, ANIMATIONS[n].frames[0].pose ?? {});
      expect(first.mat.unroll === 0 || first.mat.visible === 0 || first.body.x > 100, n).toBe(true);
    }
  });
  it('every exit variant ends invisible with the mat rolled up and gone', async () => {
    for (const n of EXIT_ANIMS) {
      const { pose } = await runToEnd(n);
      expect(poseEquals(pose, HIDDEN), n).toBe(true);
      expect(pose.opacity).toBe(0);
      expect(pose.mat.visible).toBe(0);
      expect(pose.mat.unroll).toBe(0);
    }
  });
  it('sleep animations: FallAsleep and Sleeping end in the sleep pose, WakeUp in NEUTRAL', async () => {
    expect(poseEquals((await runToEnd('FallAsleep')).pose, sleepEnd)).toBe(true);
    expect(poseEquals((await runToEnd('Sleeping')).pose, sleepEnd)).toBe(true);
    expect(poseEquals((await runToEnd('WakeUp')).pose, NEUTRAL)).toBe(true);
  });
  it('other animations end at NEUTRAL and every anim finishes within 3 s of exit()', async () => {
    const special = new Set<AnimName>([...EXIT_ANIMS, 'FallAsleep', 'Sleeping']);
    for (const n of names) {
      const { pose, ms } = await runToEnd(n);
      if (!special.has(n)) expect(poseEquals(pose, NEUTRAL), n).toBe(true);
      expect(ms, n).toBeLessThan((n === 'Sleeping' ? 4000 : 3000) + 32);
    }
  });
});
