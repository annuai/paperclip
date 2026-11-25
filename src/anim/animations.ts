import { HIDDEN, deepMerge } from './pose';
import type { Pose, PosePatch, PropState } from './pose';
import type { Animation, AnimName, Frame } from './types';

const P = (...ps: PosePatch[]): PosePatch => ps.reduce<PosePatch>((a, b) => deepMerge(a, b), {});
const f = (duration: number, pose?: PosePatch, extra: Partial<Frame> = {}): Frame => ({ duration, pose, ...extra });
const brows = (lift: number, angle = 0): PosePatch => ({ browL: { lift, angle }, browR: { lift, angle } });
const lids = (v: number): PosePatch => ({ lids: { l: v, r: v } });
const body = (b: Partial<Pose['body']>): PosePatch => ({ body: b });
const look = (x: number, y: number): PosePatch => ({ pupils: { x, y } });
const prop = (k: keyof Pose['props'], s: Partial<PropState>): PosePatch => ({ props: { [k]: { v: 1, ...s } } });
const mat = (m: Partial<Pose['mat']>): PosePatch => ({ mat: m });
const mouth = (v: number): PosePatch => ({ mouth: v });
const CLIP_HID: PosePatch = { opacity: 0, body: { scale: 0, y: 20 } };
const HIDDEN_PATCH: PosePatch = HIDDEN as unknown as PosePatch;
/** Resting sleep pose: lids shut, droopy brows, leaning/slumped onto the mat. */
export const SLEEP_POSE: PosePatch = {
  lids: { l: 1, r: 1 }, browL: { angle: -6, lift: 4 }, browR: { angle: -6, lift: 4 },
  body: { tilt: 28, squash: 0.84, y: 5, x: 0 }, mat: { squash: 0.96 },
};
const loop = (to: number, exit: number): Partial<Frame> => ({
  branching: { branches: [{ frameIndex: to, weight: 100 }] },
  exitBranch: exit,
});

/** A long pose hold split into short frames, so exit() (a click, an interrupt) never waits more than ~0.8 s. */
const hold = (total: number, pose: PosePatch, ease?: Frame['ease']): Frame[] => {
  const out: Frame[] = [];
  for (let left = total; left > 0; left -= 800) out.push(f(Math.min(800, left), pose, ease ? { ease } : {}));
  return out;
};
/** Long guided animations are cuttable: exit() jumps to the last frame (the return to NEUTRAL). */
const cuttable = (a: Animation): Animation => {
  const last = a.frames.length - 1;
  a.frames.forEach((fr, i) => { if (i < last) fr.exitBranch = last; });
  a.useExitBranching = true;
  return a;
};

const thinkBrows: PosePatch = { browL: { angle: -8, lift: -5 }, browR: { angle: 8, lift: 1 } };
const scratchBrows: PosePatch = { browL: { angle: -6, lift: -3 }, browR: { angle: 6, lift: 0 } };
const scratch = (y: number): PosePatch =>
  P(prop('pencil', { x: -4, y, rot: -50 }), scratchBrows, look(0.5, -0.7), body({ tilt: 3 }));

export const ANIMATIONS: Record<AnimName, Animation> = {
  // ---- Entrances: end at NEUTRAL (clip visible, mat unrolled) ----
  EnterTumble: { essential: true, frames: [ // rolled mat tumbles in, unrolls, clip drops onto it
    f(0, P(CLIP_HID, mat({ visible: 1, unroll: 0, x: -200, y: -50, rot: -360 }))),
    f(280, P(CLIP_HID, mat({ visible: 1, unroll: 0, x: -40, y: -4, rot: -120 })), { ease: 'out' }),
    f(180, P(CLIP_HID, mat({ visible: 1, unroll: 0, x: 0, y: 0, rot: 0 })), { ease: 'out' }),
    f(340, P(CLIP_HID, mat({ visible: 1, unroll: 1 })), { ease: 'out' }),
    f(0, P(body({ y: -240, squash: 1.15 }), mat({}))),
    f(190, P(body({ y: 6, squash: 0.8 }), mat({ squash: 0.86, y: 2 })), { ease: 'in' }),
    f(120, P(body({ y: -10, squash: 1.12 }), mat({ squash: 1.02 }))),
    f(100, P(body({ squash: 0.95 }), mat({ squash: 0.98 }))),
    f(120, {}) ] },
  EnterSlide: { essential: true, frames: [ // clip slides in carrying the rolled mat, flips it open, hops on
    f(0, P(body({ x: 230, tilt: 8, squash: 1.04 }), mat({ visible: 1, unroll: 0, x: 255, y: -2 }))),
    f(340, P(body({ x: 0, tilt: 8, squash: 1.04 }), mat({ visible: 1, unroll: 0, x: 25 })), { ease: 'out' }),
    f(150, P(body({ tilt: -8, squash: 1.1, y: -4 }), mat({ visible: 1, unroll: 0, x: 25, y: -14, rot: -25 }))),
    f(300, P(body({ y: -20 }), mat({ unroll: 1 })), { ease: 'out' }),
    f(170, P(body({ y: 5, squash: 0.85 }), mat({ squash: 0.9 })), { ease: 'in' }),
    f(110, P(body({ y: -3, squash: 1.05 }), mat({ squash: 1.01 }))),
    f(120, {}) ] },
  EnterPop: { essential: true, frames: [ // clip pops up through the mat with a sparkle burst
    f(0, P(CLIP_HID, mat({ visible: 0 }))),
    f(150, P(CLIP_HID, mat({ visible: 1, squash: 0.92 })), { ease: 'out' }),
    f(0, P({ opacity: 1 }, body({ scale: 0.2, y: 30 }), mat({ squash: 0.92 }))),
    f(190, P(body({ scale: 1.12, y: -26, squash: 1.22 }), brows(-8), prop('sparkles', { rot: 40 }), mat({ squash: 0.88 })), { ease: 'out' }),
    f(130, P(body({ y: 2, squash: 0.88 }), prop('sparkles', { rot: 90 }), mat({ squash: 0.92 }))),
    f(110, P(body({ squash: 1.05 }), prop('sparkles', { rot: 140 }))),
    f(160, {}) ] },
  // ---- Exits: end at HIDDEN (clip opacity 0, mat invisible and rolled up) ----
  ExitWave: { essential: true, frames: [ // wave, hop off, mat rolls up and rolls away
    f(130, P(body({ tilt: 8, squash: 1.04 }), brows(-4))),
    f(130, P(body({ tilt: -6, squash: 0.97 }), brows(-4))),
    f(130, P(body({ tilt: 8, squash: 1.04 }), brows(-5))),
    f(110, P(body({ squash: 0.86, y: 4 }), mat({ squash: 0.92 }))),
    f(260, P(body({ x: 260, y: -34, tilt: 22 }), mat({})), { ease: 'in' }),
    f(260, P(body({ x: 260, y: -34, tilt: 22 }), mat({ unroll: 0 }))),
    f(260, P(body({ x: 260, y: -34, tilt: 22 }), mat({ unroll: 0, x: -280, rot: -360 })), { ease: 'in' }),
    f(0, HIDDEN_PATCH) ] },
  ExitRollUp: { essential: true, frames: [ // mat rolls up around the clip, which shrinks away
    f(120, P(body({ squash: 0.9 }), mat({ squash: 0.94 }))),
    f(300, P(body({ squash: 1.04, tilt: 4 }), mat({ unroll: 0, x: 62, y: -6, rot: -30 }))),
    f(260, P(body({ scale: 0, y: 10, tilt: 20 }), mat({ unroll: 0, x: 62, y: -6, scale: 0, rot: -120 })), { ease: 'in' }),
    f(0, HIDDEN_PATCH) ] },
  ExitSpring: { essential: true, frames: [ // clip springs out of frame, then the mat rolls up and away
    f(120, P(body({ squash: 0.78, y: 5 }), mat({ squash: 0.88 }))),
    f(240, P(body({ y: -430, squash: 1.3 }), brows(-8)), { ease: 'in' }),
    f(120, P(body({ y: -430 }), mat({}))),
    f(260, P(body({ y: -430 }), mat({ unroll: 0 })), { ease: 'out' }),
    f(180, P(body({ y: -430 }), mat({ unroll: 0, x: -120, rot: -200, scale: 0 })), { ease: 'in' }),
    f(0, HIDDEN_PATCH) ] },
  // ---- Sleep ----
  FallAsleep: { frames: [ // yawn, droop, slump onto the mat; ends in SLEEP_POSE
    f(240, P(brows(-7), mouth(0.5), look(0, -0.4), body({ squash: 1.06 }))),
    f(500, P(brows(-9), mouth(1), lids(0.5), body({ squash: 1.1, y: -4 }), { eyes: { sy: 0.9 } })),
    f(300, P(brows(4, -8), mouth(0.4), lids(0.7), body({ tilt: 6, squash: 0.95 }))),
    f(450, P(brows(4, -6), lids(1), body({ tilt: 14, squash: 0.88, y: 2 }), mat({ squash: 0.97 }))),
    f(250, P(brows(2, -4), lids(0.4), body({ tilt: 9, squash: 0.9, y: 1 }), mat({ squash: 0.98 }))), // head-nod jerk
    f(520, SLEEP_POSE) ] },
  Sleeping: { useExitBranching: true, frames: [ // slow ~3.5 s breathing cycle, loops until exit
    f(1750, P(SLEEP_POSE, body({ squash: 0.87, y: 4, tilt: 25 }), mat({ squash: 0.955 }))),
    f(1750, SLEEP_POSE, loop(0, 2)),
    f(200, SLEEP_POSE) ] },
  WakeUp: { frames: [ // startled jolt, rapid blinks, stretch, mat flex
    f(90, P(body({ y: -22, squash: 1.2 }), brows(-10), { eyes: { sx: 1.15, sy: 1.15 } }, mat({ squash: 0.88 }))),
    f(90, P(body({ squash: 0.92 }), lids(1), brows(-6))),
    f(90, P(brows(-6))),
    f(90, P(lids(1), brows(-4))),
    f(90, P(brows(-4))),
    f(260, P(body({ squash: 1.14, y: -8, tilt: -3 }), brows(-4), lids(0.3), mouth(0.6), mat({ squash: 0.97 }))),
    f(200, P(body({ squash: 1.05 }), mouth(0.2))),
    f(200, {}) ] },
  Blink: { frames: [ f(80, lids(1), { ease: 'linear' }), f(40), f(90, {}, { ease: 'linear' }) ] },
  Greeting: { frames: [
    f(140, P(body({ tilt: 4, y: -4 }), brows(-6), { eyes: { sy: 1.08 } })),
    f(120, P(body({ tilt: -3, y: -8, squash: 1.05 }), brows(-8, -6), prop('sparkles', {}))),
    f(160, P(body({ tilt: -3, y: -8, squash: 1.05 }), brows(-8, -6), prop('sparkles', { rot: 15 }))),
    f(140, P(body({ tilt: 2 }), brows(-4), lids(0.35), prop('sparkles', { rot: 25 }))),
    f(300),
    f(200, {}) ] },
  Wave: { frames: [
    f(120, P(body({ tilt: 8, squash: 1.04 }), brows(-4))),
    f(120, P(body({ tilt: -6, squash: 0.97 }), brows(-4))),
    f(120, P(body({ tilt: 8, squash: 1.04 }), brows(-5))),
    f(120, P(body({ tilt: -6, squash: 0.97 }), brows(-4))),
    f(160, {}) ] },
  LookLeft:  { frames: [ f(120, P(look(-1, 0), { eyes: { x: -3 } }, body({ tilt: -3 }))), f(600), f(160, {}) ] },
  LookRight: { frames: [ f(120, P(look(1, 0),  { eyes: { x: 3 } },  body({ tilt: 3 }))),  f(600), f(160, {}) ] },
  LookUp:    { frames: [ f(120, P(look(0, -1), { eyes: { y: -3 } }, brows(-5))), f(600), f(160, {}) ] },
  LookDown:  { frames: [ f(120, P(look(0, 1),  { eyes: { y: 2 } },  brows(2), lids(0.25))), f(600), f(160, {}) ] },
  Thinking: { useExitBranching: true, frames: [
    f(160, P(look(0.6, -1), thinkBrows, body({ tilt: -4 }), prop('question', {}))),
    f(200, P(look(0.6, -1), thinkBrows, body({ tilt: -5 }), prop('question', { rot: -8 }))),
    f(200, P(look(0.6, -1), thinkBrows, body({ tilt: -3 }), prop('question', { rot: 8 })), loop(1, 3)),
    f(120, P(brows(-7), { eyes: { sx: 1.1, sy: 1.1 } }, prop('bulb', {}))), // "idea!"
    f(300),
    f(160, {}) ] },
  Writing: { useExitBranching: true, frames: [
    f(160, P(look(0.7, 0.8), lids(0.2), brows(2, 4), prop('pencil', {}))),
    f(120, P(look(0.7, 0.8), lids(0.2), brows(2, 4), body({ tilt: 2 }), prop('pencil', { x: -4, rot: -6 }))),
    f(120, P(look(0.8, 0.8), lids(0.2), brows(2, 4), body({ tilt: 4 }), prop('pencil', { x: 3, rot: 4 }))),
    f(120, P(look(0.7, 0.8), lids(0.2), brows(2, 4), body({ tilt: 3 }), prop('pencil', { x: -2, rot: -4 })), loop(1, 4)),
    f(160, {}) ] },
  GetAttention: { frames: [
    f(100, body({ squash: 0.85, y: 4 })),
    f(120, P(body({ squash: 1.15, y: -14 }), brows(-8), { eyes: { sx: 1.12, sy: 1.12 } })),
    f(100, P(body({ squash: 0.92 }), brows(-6))),
    f(120, P(body({ squash: 1.1, y: -10, tilt: 5 }), brows(-8))),
    f(100, P(body({ squash: 0.95, tilt: -4 }), brows(-4))),
    f(160, {}) ] },
  Explain: { useExitBranching: true, frames: [
    f(160, P(brows(-5, -4), look(-0.5, 0.3), body({ tilt: -3 }))),
    f(200, P({ browL: { lift: -3, angle: -4 }, browR: { lift: -6, angle: -4 } }, look(-0.3, 0.2), body({ tilt: 2 }))),
    f(200, P({ browL: { lift: -6, angle: -4 }, browR: { lift: -3, angle: -4 } }, look(-0.5, 0.3), body({ tilt: -2 })),
      { branching: { branches: [{ frameIndex: 1, weight: 70 }] }, exitBranch: 5 }), // 30% -> blink frames
    f(80, P(brows(-4, -4), lids(1), body({ tilt: -1 })), { ease: 'linear' }),
    f(90, P(brows(-4, -4), body({ tilt: -1 })), loop(1, 5)),
    f(160, {}) ] },
  Congratulate: { frames: [
    f(120, body({ squash: 0.88, y: 4 })),
    f(140, P(body({ squash: 1.12, y: -16, tilt: -6 }), lids(0.45), brows(-6), prop('sparkles', {}))),
    f(120, P(body({ squash: 0.95, tilt: 6 }), lids(0.45), brows(-6), prop('sparkles', { rot: 20 }))),
    f(140, P(body({ y: -8, tilt: -4 }), lids(0.45), brows(-6), prop('sparkles', { rot: 40 }))),
    f(200, P(lids(0.45), brows(-5), prop('sparkles', { rot: 60 }))),
    f(200, {}) ] },
  IdleEyeRoll: { frames: [
    f(140, P(look(-0.8, -0.6), { browL: { lift: -4, angle: 0 } })),
    f(140, P(look(0, -1), brows(-6))),
    f(140, P(look(0.8, -0.6), { browR: { lift: -4, angle: 0 } })),
    f(160, P(look(0.4, 0), lids(0.3), brows(1, 6))),
    f(400),
    f(180, {}) ] },
  IdleSideToSide: { frames: [
    f(160, P(body({ x: -6, tilt: -6 }), look(-0.6, 0))), f(200),
    f(200, P(body({ x: 6, tilt: 6 }), look(0.6, 0))),   f(200),
    f(180, {}) ] },
  IdleHeadScratch: { frames: [
    f(160, scratch(-70)),
    f(100, scratch(-74)),
    f(100, scratch(-68)),
    f(100, scratch(-74)),
    f(100, scratch(-68)),
    f(180, {}) ] },
  Dizzy: { timeScale: 1.5, frames: [
    f(120, P(look(1, 0), { eyes: { rot: 12 } }, body({ tilt: 10.0, x: 7.0, squash: 0.96 }), { browL: { angle: -8, lift: -3 }, browR: { angle: -10, lift: 3 } }, lids(0.2), prop('sparkles', { rot: 60 }))),
    f(120, P(look(0, 1), { eyes: { rot: -12 } }, body({ tilt: -9.2, x: -6.4, squash: 1.037 }), { browL: { angle: -8, lift: -3 }, browR: { angle: -10, lift: 3 } }, lids(0.2), prop('sparkles', { rot: 120 }))),
    f(120, P(look(-1, 0), { eyes: { rot: 12 } }, body({ tilt: 8.3, x: 5.8, squash: 0.967 }), { browL: { angle: -8, lift: -3 }, browR: { angle: -10, lift: 3 } }, lids(0.2), prop('sparkles', { rot: 180 }))),
    f(120, P(look(0, -1), { eyes: { rot: -12 } }, body({ tilt: -7.5, x: -5.2, squash: 1.03 }), { browL: { angle: -8, lift: -3 }, browR: { angle: -10, lift: 3 } }, lids(0.2), prop('sparkles', { rot: 240 }))),
    f(120, P(look(1, 0), { eyes: { rot: 12 } }, body({ tilt: 6.7, x: 4.7, squash: 0.973 }), { browL: { angle: -8, lift: -3 }, browR: { angle: -10, lift: 3 } }, lids(0.2), prop('sparkles', { rot: 300 }))),
    f(120, P(look(0, 1), { eyes: { rot: -12 } }, body({ tilt: -5.8, x: -4.1, squash: 1.023 }), { browL: { angle: -8, lift: -3 }, browR: { angle: -10, lift: 3 } }, lids(0.2), prop('sparkles', { rot: 360 }))),
    f(120, P(look(-1, 0), { eyes: { rot: 12 } }, body({ tilt: 5.0, x: 3.5, squash: 0.98 }), { browL: { angle: -8, lift: -3 }, browR: { angle: -10, lift: 3 } }, lids(0.2), prop('sparkles', { rot: 420 }))),
    f(120, P(look(0, -1), { eyes: { rot: -12 } }, body({ tilt: -4.2, x: -2.9, squash: 1.017 }), { browL: { angle: -8, lift: -3 }, browR: { angle: -10, lift: 3 } }, lids(0.2), prop('sparkles', { rot: 480 }))),
    f(120, P(look(1, 0), { eyes: { rot: 12 } }, body({ tilt: 3.3, x: 2.3, squash: 0.987 }), { browL: { angle: -8, lift: -3 }, browR: { angle: -10, lift: 3 } }, lids(0.2), prop('sparkles', { rot: 540 }))),
    f(120, P(look(0, 1), { eyes: { rot: -12 } }, body({ tilt: -2.5, x: -1.8, squash: 1.01 }), { browL: { angle: -8, lift: -3 }, browR: { angle: -10, lift: 3 } }, lids(0.2), prop('sparkles', { rot: 600 }))),
    f(120, P(look(-1, 0), { eyes: { rot: 12 } }, body({ tilt: 1.7, x: 1.2, squash: 0.993 }), { browL: { angle: -8, lift: -3 }, browR: { angle: -10, lift: 3 } }, lids(0.2), prop('sparkles', { rot: 660 }))),
    f(120, P(look(0, -1), { eyes: { rot: -12 } }, body({ tilt: -0.8, x: -0.6, squash: 1.003 }), { browL: { angle: -8, lift: -3 }, browR: { angle: -10, lift: 3 } }, lids(0.2), prop('sparkles', { rot: 720 }))),
    f(200, P(lids(0.3), brows(2, 3), prop('sparkles', { rot: 800 }))),
    f(160, {}) ] },
  // Trampoline bounce off the yoga mat (tap the mat). Short settle so chained jumps flow together.
  Drink: { frames: [ // pulls out a glass of water, two sips, refreshed sparkle, puts it away (~2.1 s)
    f(160, P(look(0.7, 0.4), brows(-4), prop('glass', { y: 30 }))),
    f(240, P(look(0.5, 0.3), brows(-6), body({ tilt: -2 }), prop('glass', { x: -20, y: -8, rot: -8 }))),
    f(200, P(look(0.3, 0.2), brows(-6), body({ tilt: -2 }), prop('glass', { x: -20, y: -8, rot: -8 }))),
    f(260, P(lids(0.85), brows(-8), body({ tilt: -4, squash: 1.03 }), prop('glass', { x: -27, y: -12, rot: -40 }))),
    f(180, P(lids(0.15), brows(-6), body({ tilt: -2 }), prop('glass', { x: -20, y: -8, rot: -8 }))),
    f(260, P(lids(0.85), brows(-8), body({ tilt: -4, squash: 1.04 }), prop('glass', { x: -27, y: -12, rot: -44 }))),
    f(220, P(lids(0.45), brows(-7), body({ y: -4, squash: 1.06 }), prop('glass', { x: -18, y: -4, rot: -4 }), prop('sparkles', { rot: 30 }))),
    f(240, P(lids(0.3), brows(-5), prop('glass', { x: 0, y: 22 }), prop('sparkles', { rot: 70 }))),
    f(160, P(brows(-2))),
    f(160, {}) ] },
  Noticed: { frames: [ // 'noticed you' cue when eye-follow starts: brows lift ~150 ms
    f(150, P(brows(-7), { eyes: { sx: 1.06, sy: 1.06 } })),
    f(120),
    f(160, {}) ] },
  // ---- Presence reactions (phase 1): all end at NEUTRAL ----
  Tired: { frames: [ // low battery: heavy lids, drooping brows, a slow slump and a sigh (~2.4 s)
    f(320, P(brows(4, -7), lids(0.5), body({ tilt: 5, squash: 0.95, y: 1 }), look(0, 0.5))),
    f(520, P(brows(5, -9), lids(0.72), body({ tilt: 10, squash: 0.9, y: 4 }), look(0, 0.7), mat({ squash: 0.98 }))),
    f(380, P(brows(3, -6), lids(0.3), body({ tilt: 3, squash: 1.05, y: -2 }), mouth(0.3), mat({ squash: 1 }))), // sigh: inhale
    f(480, P(brows(5, -9), lids(0.75), body({ tilt: 9, squash: 0.9, y: 4 }), mouth(0.15), look(0.3, 0.7), mat({ squash: 0.98 }))), // exhale
    f(260, P(brows(3, -5), lids(0.4), body({ tilt: 4, squash: 0.96 }))),
    f(220, {}) ] },
  Sweat: { frames: [ // CPU pegged: worried brows, darting eyes, a sweat drop runs down, then relief (~2.2 s)
    f(160, P(brows(-4, -10), look(-0.8, 0.2), prop('sweat', { v: 0.6 }), body({ squash: 0.97 }))),
    f(300, P(brows(-5, -10), look(0.8, 0.2), prop('sweat', { y: 10 }), body({ tilt: 2, squash: 0.96 }), mouth(0.12))),
    f(300, P(brows(-5, -10), look(-0.8, 0.3), prop('sweat', { y: 22 }), body({ tilt: -2, squash: 0.96 }), mouth(0.12))),
    f(280, P(brows(-4, -9), look(0.6, 0.2), prop('sweat', { v: 0.6, y: 34 }), body({ tilt: 2, squash: 0.97 }))),
    f(260, P(brows(-2, -4), lids(0.35), prop('sweat', { v: 0, y: 44 }), body({ squash: 1.06, y: -3 }), mouth(0.3))), // phew
    f(320, P(brows(-1), lids(0.25), body({ squash: 1.02 }))),
    f(200, {}) ] },
  Dance: { frames: [ // music is playing: sway, bounce and sparkles on the beat (~2.7 s)
    f(110, P(body({ squash: 0.88, y: 3 }), brows(-4), mat({ squash: 0.95 }))),
    f(220, P(body({ tilt: -12, x: -8, y: -14, squash: 1.1 }), brows(-8), mouth(0.4), lids(0.25), prop('sparkles', { rot: 20 })), { ease: 'out' }),
    f(160, P(body({ tilt: -8, x: -5, y: 2, squash: 0.9 }), brows(-6), lids(0.3), prop('sparkles', { rot: 40 }), mat({ squash: 0.96 })), { ease: 'in' }),
    f(220, P(body({ tilt: 12, x: 8, y: -14, squash: 1.1 }), brows(-8), mouth(0.4), lids(0.25), prop('sparkles', { rot: 70 })), { ease: 'out' }),
    f(160, P(body({ tilt: 8, x: 5, y: 2, squash: 0.9 }), brows(-6), lids(0.3), prop('sparkles', { rot: 90 }), mat({ squash: 0.96 })), { ease: 'in' }),
    f(220, P(body({ tilt: -12, x: -8, y: -14, squash: 1.1 }), brows(-8), mouth(0.4), lids(0.25), prop('sparkles', { rot: 120 })), { ease: 'out' }),
    f(160, P(body({ tilt: -8, x: -5, y: 2, squash: 0.9 }), brows(-6), lids(0.3), prop('sparkles', { rot: 140 }), mat({ squash: 0.96 })), { ease: 'in' }),
    f(220, P(body({ tilt: 12, x: 8, y: -14, squash: 1.1 }), brows(-8), mouth(0.4), lids(0.25), prop('sparkles', { rot: 170 })), { ease: 'out' }),
    f(160, P(body({ tilt: 8, x: 5, y: 2, squash: 0.9 }), brows(-6), lids(0.3), prop('sparkles', { rot: 190 }), mat({ squash: 0.96 })), { ease: 'in' }),
    f(260, P(body({ y: -18, squash: 1.18 }), brows(-9), mouth(0.6), prop('sparkles', { rot: 230 })), { ease: 'out' }), // big finish hop
    f(150, P(body({ y: 3, squash: 0.86 }), brows(-3), mat({ squash: 0.93 })), { ease: 'in' }),
    f(180, {}) ] },
  Yawn: { frames: [ // late night: stretch, a huge yawn with squeezed eyes, blink it off (~2.4 s)
    f(260, P(brows(-7), mouth(0.4), look(0, -0.4), body({ squash: 1.05 }))),
    f(520, P(brows(-9), mouth(1), lids(0.6), body({ squash: 1.13, y: -5 }), { eyes: { sy: 0.9 } })),
    f(460, P(brows(-8), mouth(0.9), lids(0.8), body({ squash: 1.12, y: -5 }), { eyes: { sy: 0.88 } })),
    f(300, P(brows(3, -6), mouth(0.25), lids(0.85), body({ tilt: 4, squash: 0.95 }))),
    f(260, P(brows(1, -3), lids(0.2), body({ squash: 1.02 }))),
    f(200, {}) ] },
  // ---- Wellbeing (phase 2): all end at NEUTRAL ----
  Stretch: cuttable({ frames: [ // stretch-break cue on the mat: reach up, side bend both ways, forward fold (~4.6 s)
    f(260, P(body({ squash: 0.92, y: 2 }), brows(2), mat({ squash: 0.97 }))), // breathe in
    f(520, P(body({ squash: 1.24, y: -8 }), brows(-6), lids(0.35), mouth(0.25), mat({ squash: 1 })), { ease: 'out' }), // reach up
    f(360, P(body({ squash: 1.24, y: -8 }), brows(-7), lids(0.4), mouth(0.25))),
    f(420, P(body({ squash: 1.1, tilt: -22, x: -11, y: -2 }), brows(-4), lids(0.4))), // side bend left
    f(340, P(body({ squash: 1.1, tilt: -23, x: -12, y: -2 }), brows(-4), lids(0.45))),
    f(480, P(body({ squash: 1.1, tilt: 22, x: 11, y: -2 }), brows(-4), lids(0.4))), // and right
    f(340, P(body({ squash: 1.1, tilt: 23, x: 12, y: -2 }), brows(-4), lids(0.45))),
    f(520, P(body({ squash: 0.72, y: 9, tilt: 5 }), brows(3, -4), lids(0.7), mat({ squash: 0.95 })), { ease: 'in' }), // forward fold
    f(420, P(body({ squash: 0.7, y: 10, tilt: 8 }), brows(3, -4), lids(0.75), mat({ squash: 0.95 }))),
    f(380, P(body({ squash: 1.06, y: -2 }), brows(-3), lids(0.2), mouth(0.2), mat({ squash: 1 }))), // roll back up, exhale
    f(220, {}) ] }),
  StretchReach: cuttable({ frames: [ // guided: breathe in, reach for the ceiling, hold, breathe out (~7 s)
    f(700, P(body({ squash: 0.94, y: 2 }), brows(2), lids(0.2), mat({ squash: 0.98 }))),
    f(1500, P(body({ squash: 1.24, y: -8 }), brows(-6), lids(0.35), mouth(0.3), mat({ squash: 1 })), { ease: 'out' }),
    ...hold(1700, P(body({ squash: 1.27, y: -10 }), brows(-7), lids(0.5), mouth(0.2))),
    ...hold(1500, P(body({ squash: 1.25, y: -9, tilt: 1.5 }), brows(-7), lids(0.5), mouth(0.2))),
    f(1000, P(body({ squash: 1.05, y: -1 }), brows(-3), lids(0.3), mouth(0.35))), // exhale
    f(600, {}) ] }),
  StretchSide: cuttable({ frames: [ // guided: lean left, hold, back up, lean right, hold (~9.5 s)
    f(800, P(body({ squash: 1.1, y: -3 }), brows(-4), lids(0.3))),
    f(1900, P(body({ squash: 1.08, tilt: -24, x: -12, y: -2 }), brows(-4), lids(0.45), mat({ squash: 0.99 })), { ease: 'out' }),
    ...hold(1600, P(body({ squash: 1.08, tilt: -26, x: -13, y: -2 }), brows(-4), lids(0.55))),
    f(1200, P(body({ squash: 1.1, y: -3 }), brows(-4), lids(0.3))),
    f(1900, P(body({ squash: 1.08, tilt: 24, x: 12, y: -2 }), brows(-4), lids(0.45), mat({ squash: 0.99 })), { ease: 'out' }),
    ...hold(1600, P(body({ squash: 1.08, tilt: 26, x: 13, y: -2 }), brows(-4), lids(0.55))),
    f(500, {}) ] }),
  StretchFold: cuttable({ frames: [ // guided: inhale, forward fold, hang and sway, roll up (~7.5 s)
    f(900, P(body({ squash: 1.12, y: -4 }), brows(-4), lids(0.3), mouth(0.2))),
    f(1800, P(body({ squash: 0.7, y: 10, tilt: 6 }), brows(3, -4), lids(0.7), mat({ squash: 0.95 })), { ease: 'in' }),
    ...hold(1400, P(body({ squash: 0.68, y: 11, tilt: 10 }), brows(3, -5), lids(0.8), mat({ squash: 0.94 }))),
    ...hold(1400, P(body({ squash: 0.68, y: 11, tilt: 3 }), brows(3, -5), lids(0.8), mat({ squash: 0.94 }))),
    f(1500, P(body({ squash: 1.06, y: -2 }), brows(-3), lids(0.2), mouth(0.25), mat({ squash: 1 }))),
    f(500, {}) ] }),
  Celebrate: { frames: [ // focus round finished: two big hops, spin-wiggle, confetti sparkles (~2.4 s)
    f(120, P(body({ squash: 0.8, y: 4 }), brows(2), mat({ squash: 0.9 }))),
    f(200, P(body({ squash: 1.24, y: -34, tilt: -8 }), brows(-9), mouth(0.7), lids(0.3), prop('sparkles', { rot: 20 }), mat({ squash: 1.03 })), { ease: 'out' }),
    f(180, P(body({ squash: 0.84, y: 3, tilt: 4 }), brows(-4), prop('sparkles', { rot: 50 }), mat({ squash: 0.9 })), { ease: 'in' }),
    f(200, P(body({ squash: 1.24, y: -38, tilt: 9 }), brows(-9), mouth(0.7), lids(0.3), prop('sparkles', { rot: 90 }), mat({ squash: 1.03 })), { ease: 'out' }),
    f(180, P(body({ squash: 0.84, y: 3, tilt: -4 }), brows(-4), prop('sparkles', { rot: 130 }), mat({ squash: 0.9 })), { ease: 'in' }),
    f(160, P(body({ tilt: -10, x: -5, squash: 1.06 }), brows(-8), mouth(0.4), lids(0.3), prop('sparkles', { rot: 170 }))),
    f(160, P(body({ tilt: 10, x: 5, squash: 1.06 }), brows(-8), mouth(0.4), lids(0.3), prop('sparkles', { rot: 210 }))),
    f(160, P(body({ tilt: -6, x: -3 }), brows(-6), lids(0.35), prop('sparkles', { rot: 250 }))),
    f(260, P(brows(-5), lids(0.4), prop('sparkles', { rot: 290 }))),
    f(200, {}) ] },
  // ---- Play (phase 3): all end at NEUTRAL ----
  Fling: { frames: [ // thrown: a startled "whoa" as he leaves the pointer (~0.5 s)
    f(90, P(brows(-9), mouth(0.7), { eyes: { sx: 1.12, sy: 1.12 } }, body({ tilt: -14, squash: 1.1 }), look(0, -0.4))),
    f(260, P(brows(-8), mouth(0.5), { eyes: { sx: 1.08, sy: 1.08 } }, body({ tilt: -9, squash: 1.05 }))),
    f(160, {}) ] },
  Thud: { frames: [ // landed on the floor or ceiling: squash flat, wobble back (~0.25 s)
    f(55, P(body({ squash: 0.76, y: 3 }), brows(4), lids(0.4), mat({ squash: 0.9 })), { ease: 'out' }),
    f(100, P(body({ squash: 1.1, y: -3 }), brows(-3), mouth(0.25), mat({ squash: 1.02 }))),
    f(90, {}) ] },
  Bump: { frames: [ // hit a side wall: squeezed narrow and tall, wobble back (~0.25 s)
    f(55, P(body({ squash: 1.16, tilt: 6 }), brows(4), lids(0.4)), { ease: 'out' }),
    f(100, P(body({ squash: 0.92, tilt: -5 }), brows(-3), mouth(0.25))),
    f(90, {}) ] },
  Ooh: { useExitBranching: true, frames: [ // a file is being dragged over him: leans in, eyes wide, small "o" (loops until the drag ends)
    f(240, P(body({ tilt: 7, squash: 0.97 }), brows(-9), { eyes: { sx: 1.14, sy: 1.14 } }, mouth(0.35), look(0, 0.55)), { ease: 'out' }),
    f(700, P(body({ tilt: 6, squash: 0.96 }), brows(-8), { eyes: { sx: 1.12, sy: 1.12 } }, mouth(0.3), look(0, 0.6)), loop(1, 2)),
    f(200, {}) ] },
  Jump: { frames: [
    f(80,  P(body({ squash: 0.8, y: 4 }), brows(3), lids(0.25), mat({ squash: 0.88 }))),                     // crouch, mat dips
    f(130, P(body({ squash: 1.2, y: -40 }), brows(-9), mouth(0.6), mat({ squash: 1.04 })), { ease: 'out' }), // launch, mat springs back
    f(110, P(body({ squash: 1.02, y: -48, tilt: -4 }), brows(-10), mouth(0.8), { eyes: { sx: 1.1, sy: 1.1 } }, look(0, -0.6)), { ease: 'out' }), // apex
    f(120, P(body({ squash: 1.12, y: -6 }), brows(-5), mouth(0.4), look(0, 0.4)), { ease: 'in' }),         // fall
    f(70,  P(body({ squash: 0.82, y: 3 }), brows(2), mat({ squash: 0.86 })), { ease: 'out' }),               // land, mat absorbs
    f(110, P(body({ squash: 1.04 }), mat({ squash: 0.99 }))),
    f(90, {}) ] },
};

export const ENTER_ANIMS: AnimName[] = ['EnterTumble', 'EnterSlide', 'EnterPop'];
export const EXIT_ANIMS: AnimName[] = ['ExitWave', 'ExitRollUp', 'ExitSpring'];
export const IDLE_ANIMS: AnimName[] = ['IdleEyeRoll', 'IdleSideToSide', 'IdleHeadScratch', 'LookLeft', 'LookRight', 'LookUp', 'LookDown'];
export const SHOWY_ANIMS: AnimName[] = ['Wave', 'GetAttention', 'Congratulate', 'Thinking', 'Writing', 'Greeting'];

/** True when any frame branches back to an index <= itself (i.e. can loop forever). */
export function isLooping(a: Animation): boolean {
  return a.frames.some((fr, i) => fr.branching?.branches.some((b) => b.frameIndex <= i) ?? false);
}
