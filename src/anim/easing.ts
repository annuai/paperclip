export type EaseName = 'linear' | 'inOut' | 'out' | 'in' | 'step';

export const EASE: Record<EaseName, (t: number) => number> = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  step: (t) => (t >= 1 ? 1 : 0),
};
