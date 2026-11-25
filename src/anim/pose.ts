export interface Xf { x: number; y: number; rot: number; sx: number; sy: number }
export interface PropState { v: number; x: number; y: number; rot: number }
export interface Pose {
  body: { x: number; y: number; tilt: number; squash: number; scale: number };
  eyes: Xf;
  pupils: { x: number; y: number; conv: number }; // conv: eyes converge (cross slightly) 0..1
  lids: { l: number; r: number };
  browL: { angle: number; lift: number };
  browR: { angle: number; lift: number };
  props: { pencil: PropState; bulb: PropState; question: PropState; sparkles: PropState; glass: PropState; sweat: PropState };
  mouth: number; // 0 closed .. 1 wide open (yawn)
  mat: { x: number; y: number; rot: number; scale: number; squash: number; unroll: number; visible: number };
  opacity: number;
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };
export type PosePatch = DeepPartial<Pose>;

const prop = (): PropState => ({ v: 0, x: 0, y: 0, rot: 0 });

function makeNeutral(): Pose {
  return {
    body: { x: 0, y: 0, tilt: 0, squash: 1, scale: 1 },
    eyes: { x: 0, y: 0, rot: 0, sx: 1, sy: 1 },
    pupils: { x: 0, y: 0, conv: 0 },
    lids: { l: 0, r: 0 },
    browL: { angle: 0, lift: 0 },
    browR: { angle: 0, lift: 0 },
    props: { pencil: prop(), bulb: prop(), question: prop(), sparkles: prop(), glass: prop(), sweat: prop() },
    mouth: 0,
    mat: { x: 0, y: 0, rot: 0, scale: 1, squash: 1, unroll: 1, visible: 1 },
    opacity: 1,
  };
}

export const NEUTRAL: Pose = Object.freeze(makeNeutral()) as Pose;

/** Nothing on screen: clip gone, mat gone and rolled up. Exit animations end here; enter animations start here. */
export const HIDDEN: Pose = Object.freeze(
  deepMergeFrozen(makeNeutral(), { opacity: 0, body: { scale: 0, y: 20 }, mat: { visible: 0, unroll: 0 } }),
) as Pose;

function deepMergeFrozen(a: Pose, b: object): Pose {
  return deepMerge(a, b);
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Recursively merges `b` over `a` into a new object. */
export function deepMerge<T extends object>(a: T, b: object): T {
  const out: Record<string, unknown> = { ...(a as Record<string, unknown>) };
  for (const [k, v] of Object.entries(b)) {
    if (v === undefined) continue;
    const cur = out[k];
    out[k] = isObj(v) && isObj(cur) ? deepMerge(cur, v) : isObj(v) ? deepMerge({}, v) : v;
  }
  return out as T;
}

export function mergePose(base: Pose, patch: PosePatch): Pose {
  return deepMerge(base, patch);
}

function lerpAny<T>(a: T, b: T, t: number): T {
  if (typeof a === 'number' && typeof b === 'number') return (a + (b - a) * t) as T;
  if (isObj(a) && isObj(b)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(a)) out[k] = lerpAny(a[k], b[k], t);
    return out as T;
  }
  return b;
}

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  return lerpAny(a, b, t);
}

export function poseEquals(a: unknown, b: unknown, eps = 1e-6): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= eps;
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every((k) => poseEquals(a[k], b[k], eps));
  }
  return a === b;
}

/** Reduced-motion: shrink large bounces/wobbles (offsets, tilt, squash) toward neutral; blinks, brows and looks are kept. */
export function dampPose(p: Pose, k = 0.35): Pose {
  const sq = (s: number) => 1 + (s - 1) * k;
  return {
    ...p,
    body: { ...p.body, x: p.body.x * k, y: p.body.y * k, tilt: p.body.tilt * k, squash: sq(p.body.squash) },
    mat: { ...p.mat, x: p.mat.x * k, y: p.mat.y * k, rot: p.mat.rot * k, squash: sq(p.mat.squash) },
  };
}
