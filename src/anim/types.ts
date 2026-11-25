import type { EaseName } from './easing';
import type { PosePatch } from './pose';

export interface Branch { frameIndex: number; weight: number } // weight in percent
export interface Frame {
  duration: number; // ms; 0 = snap instantly
  pose?: PosePatch; // patch over NEUTRAL (NOT cumulative). Omitted = hold previous target.
  ease?: EaseName; // default 'inOut'
  branching?: { branches: Branch[] };
  exitBranch?: number; // frame index to jump to when exit was requested
}
export interface Animation { frames: Frame[]; useExitBranching?: boolean; /** enter/exit: needs full-size motion even with reduced motion */ essential?: boolean; timeScale?: number /* overrides the global duration multiplier */ }
export type AnimName =
  | 'EnterTumble' | 'EnterSlide' | 'EnterPop' | 'ExitWave' | 'ExitRollUp' | 'ExitSpring'
  | 'FallAsleep' | 'Sleeping' | 'WakeUp' | 'Greeting' | 'Wave' | 'Blink' | 'LookLeft' | 'LookRight' | 'LookUp'
  | 'LookDown' | 'Thinking' | 'Writing' | 'GetAttention' | 'Explain' | 'Congratulate'
  | 'IdleEyeRoll' | 'IdleSideToSide' | 'IdleHeadScratch' | 'Dizzy' | 'Jump' | 'Drink' | 'Noticed'
  | 'Tired' | 'Sweat' | 'Dance' | 'Yawn';
