import { describe, expect, it } from 'vitest';
import { lerpPose, mergePose, NEUTRAL, poseEquals } from './pose';

describe('pose', () => {
  const X = mergePose(NEUTRAL, { body: { tilt: 10, y: -4 }, props: { bulb: { v: 1 } }, opacity: 0.5 });
  it('merge returns new object and does not mutate NEUTRAL', () => {
    expect(X.body.tilt).toBe(10);
    expect(X.body.squash).toBe(1);
    expect(NEUTRAL.body.tilt).toBe(0);
    expect(NEUTRAL.props.bulb.v).toBe(0);
  });
  it('lerp endpoints', () => {
    expect(poseEquals(lerpPose(NEUTRAL, X, 0), NEUTRAL)).toBe(true);
    expect(poseEquals(lerpPose(NEUTRAL, X, 1), X)).toBe(true);
    expect(lerpPose(NEUTRAL, X, 0.5).body.tilt).toBe(5);
  });
});
