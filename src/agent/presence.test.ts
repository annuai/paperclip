import { describe, expect, it } from 'vitest';
import { Presence, isLowBattery, isNight } from './presence';
import type { PresenceConfig, PresenceCtx, SystemSnapshot } from './presence';

const snap = (over: Partial<SystemSnapshot> = {}): SystemSnapshot => ({
  fullscreen: false, batteryPct: 80, charging: false, cpuPct: 10, audioPlaying: false, idleSecs: 0, ...over,
});
const DAY = new Date(2026, 0, 5, 14, 0, 0).getTime();
const at = (h: number, m = 0, day = 5) => new Date(2026, 0, day, h, m, 0).getTime();
const ctx = (over: Partial<PresenceCtx> = {}): PresenceCtx => ({ now: DAY, hidden: false, quiet: false, busy: false, ...over });
const cfg = (over: Partial<PresenceConfig> = {}): PresenceConfig => ({ hideWhenPresenting: true, reactToMusic: true, ...over });
const make = (c: Partial<PresenceConfig> = {}, rng: () => number = () => 0) => new Presence(cfg(c), rng);

describe('helpers', () => {
  it('isLowBattery: <= 15 % and not charging', () => {
    expect(isLowBattery(snap({ batteryPct: 15 }))).toBe(true);
    expect(isLowBattery(snap({ batteryPct: 16 }))).toBe(false);
    expect(isLowBattery(snap({ batteryPct: 10, charging: true }))).toBe(false);
    expect(isLowBattery(snap({ batteryPct: 10, charging: null }))).toBe(true);
    expect(isLowBattery(snap({ batteryPct: null, charging: null }))).toBe(false);
  });
  it('isNight: 00:00 to 05:00 local', () => {
    expect(isNight(at(0, 0))).toBe(true);
    expect(isNight(at(4, 59))).toBe(true);
    expect(isNight(at(5, 0))).toBe(false);
    expect(isNight(at(23, 59))).toBe(false);
  });
});

describe('hide while presenting', () => {
  it('hides when full screen starts and shows again when it ends', () => {
    const p = make();
    expect(p.update(snap(), ctx())).toEqual([]);
    expect(p.update(snap({ fullscreen: true }), ctx())).toEqual([{ type: 'hide' }]);
    expect(p.update(snap({ fullscreen: true }), ctx({ hidden: true }))).toEqual([]); // no repeat
    expect(p.update(snap(), ctx({ hidden: true }))).toEqual([{ type: 'show' }]);
    expect(p.update(snap(), ctx())).toEqual([]);
  });
  it('does not repeat hide while the hide animation is still running', () => {
    const p = make();
    expect(p.update(snap({ fullscreen: true }), ctx())).toEqual([{ type: 'hide' }]);
    expect(p.tick(ctx({ hidden: false }))).toEqual([]); // hidden flag lags the animation
  });
  it('never re-shows a clip the user hid on purpose', () => {
    const p = make();
    p.update(snap(), ctx({ hidden: true })); // user hid him
    expect(p.update(snap({ fullscreen: true }), ctx({ hidden: true }))).toEqual([]);
    expect(p.update(snap(), ctx({ hidden: true }))).toEqual([]);
  });
  it('a user hide during presenting cancels the automatic re-show', () => {
    const p = make();
    p.update(snap({ fullscreen: true }), ctx());
    p.userChangedVisibility();
    expect(p.update(snap(), ctx({ hidden: true }))).toEqual([]);
  });
  it('a user summon during presenting keeps him up, and the next full screen hides him again', () => {
    const p = make();
    p.update(snap({ fullscreen: true }), ctx());
    p.userChangedVisibility(); // user clicked the tray: he is back
    expect(p.update(snap(), ctx())).toEqual([]);
    expect(p.update(snap({ fullscreen: true }), ctx())).toEqual([{ type: 'hide' }]);
  });
  it('does nothing when the setting is off', () => {
    const p = make({ hideWhenPresenting: false });
    expect(p.update(snap({ fullscreen: true }), ctx())).toEqual([]);
    expect(p.update(snap(), ctx())).toEqual([]);
  });
  it('turning the setting on while presenting hides him; turning it off brings him back', () => {
    const p = make({ hideWhenPresenting: false });
    p.update(snap({ fullscreen: true }), ctx());
    expect(p.setConfig(cfg(), ctx())).toEqual([{ type: 'hide' }]);
    expect(p.setConfig(cfg({ hideWhenPresenting: false }), ctx({ hidden: true }))).toEqual([{ type: 'show' }]);
  });
  it('quiet mode does not suppress hide/show', () => {
    const p = make();
    expect(p.update(snap({ fullscreen: true }), ctx({ quiet: true }))).toEqual([{ type: 'hide' }]);
    expect(p.update(snap(), ctx({ quiet: true, hidden: true }))).toEqual([{ type: 'show' }]);
  });
  it('already presenting at launch hides him', () => {
    expect(make().update(snap({ fullscreen: true }), ctx())).toEqual([{ type: 'hide' }]);
  });
});

describe('low battery', () => {
  it('speaks a sleepy line once per drop and re-arms after charging or recovery', () => {
    const p = make();
    expect(p.update(snap({ batteryPct: 20 }), ctx())).toEqual([]);
    expect(p.update(snap({ batteryPct: 15 }), ctx())).toEqual([{ type: 'react', line: 'lowBattery', anim: 'Tired', speak: true }]);
    expect(p.update(snap({ batteryPct: 12 }), ctx())).toEqual([]);
    expect(p.tick(ctx())).toEqual([]);
    expect(p.update(snap({ batteryPct: 40, charging: true }), ctx())).toEqual([]);
    expect(p.update(snap({ batteryPct: 14 }), ctx())).toHaveLength(1); // a second drop
  });
  it('plugging in clears the low state', () => {
    const p = make();
    p.update(snap({ batteryPct: 10 }), ctx());
    expect(p.low).toBe(true);
    p.update(snap({ batteryPct: 10, charging: true }), ctx());
    expect(p.low).toBe(false);
  });
  it('quiet mode: no line (consumed), but the Tired idle animation still applies', () => {
    const p = make();
    expect(p.update(snap({ batteryPct: 10 }), ctx({ quiet: true }))).toEqual([{ type: 'react', line: 'lowBattery', anim: 'Tired', speak: false }]);
    expect(p.tick(ctx())).toEqual([]);
    expect(p.low).toBe(true);
  });
  it('waits while busy or hidden instead of losing the line', () => {
    const p = make();
    expect(p.update(snap({ batteryPct: 10 }), ctx({ busy: true }))).toEqual([]);
    expect(p.update(snap({ batteryPct: 10 }), ctx({ hidden: true }))).toEqual([]);
    expect(p.tick(ctx())).toHaveLength(1);
  });
});

describe('idle animations', () => {
  it('Tired while low on battery, not otherwise', () => {
    const p = make();
    expect(p.idleAnim(ctx())).toBeNull();
    p.update(snap({ batteryPct: 8 }), ctx({ busy: true }));
    expect(p.idleAnim(ctx())).toBe('Tired');
  });
  it('Tired is rate limited and probabilistic', () => {
    const p = make({}, () => 0.99);
    p.update(snap({ batteryPct: 8 }), ctx({ busy: true }));
    expect(p.idleAnim(ctx())).toBeNull(); // rng roll fails
    const q = make({}, () => 0);
    q.update(snap({ batteryPct: 8 }), ctx({ busy: true }));
    expect(q.idleAnim(ctx({ now: DAY }))).toBe('Tired');
    expect(q.idleAnim(ctx({ now: DAY + 10_000 }))).toBeNull();
    expect(q.idleAnim(ctx({ now: DAY + 60_000 }))).toBe('Tired');
  });
  it('Dance when audio plays, at most once every 3 minutes', () => {
    const p = make();
    p.update(snap({ audioPlaying: true }), ctx());
    expect(p.idleAnim(ctx({ now: DAY }))).toBe('Dance');
    expect(p.idleAnim(ctx({ now: DAY + 179_000 }))).toBeNull();
    expect(p.idleAnim(ctx({ now: DAY + 180_000 }))).toBe('Dance');
  });
  it('no Dance without audio, when the setting is off, or after the music stops', () => {
    const p = make();
    expect(p.idleAnim(ctx())).toBeNull();
    const off = make({ reactToMusic: false });
    off.update(snap({ audioPlaying: true }), ctx());
    expect(off.idleAnim(ctx())).toBeNull();
    const stop = make();
    stop.update(snap({ audioPlaying: true }), ctx());
    stop.update(snap({ audioPlaying: false }), ctx());
    expect(stop.idleAnim(ctx())).toBeNull();
    off.setConfig(cfg(), ctx());
    expect(off.idleAnim(ctx())).toBe('Dance');
  });
  it('Dance outranks Tired', () => {
    const p = make();
    p.update(snap({ audioPlaying: true, batteryPct: 5 }), ctx({ busy: true }));
    expect(p.idleAnim(ctx())).toBe('Dance');
  });
  it('Yawn sometimes at night only', () => {
    const p = make({}, () => 0);
    expect(p.idleAnim(ctx({ now: at(14) }))).toBeNull();
    expect(p.idleAnim(ctx({ now: at(2) }))).toBe('Yawn');
    expect(p.idleAnim(ctx({ now: at(2, 1) }))).toBeNull(); // cooldown
    const unlucky = make({}, () => 0.99);
    expect(unlucky.idleAnim(ctx({ now: at(2) }))).toBeNull();
  });
});

describe('sustained CPU', () => {
  it('reacts after 30 s above 85 %, once per 10 minutes', () => {
    const p = make();
    const hot = snap({ cpuPct: 92 });
    expect(p.update(hot, ctx({ now: DAY }))).toEqual([]);
    expect(p.tick(ctx({ now: DAY + 29_000 }))).toEqual([]);
    expect(p.tick(ctx({ now: DAY + 30_000 }))).toEqual([{ type: 'react', line: 'overheating', anim: 'Sweat', speak: true }]);
    expect(p.tick(ctx({ now: DAY + 60_000 }))).toEqual([]);
    expect(p.tick(ctx({ now: DAY + 10 * 60_000 + 29_000 }))).toEqual([]);
    expect(p.tick(ctx({ now: DAY + 10 * 60_000 + 30_000 }))).toHaveLength(1);
  });
  it('a dip below the threshold restarts the 30 s clock', () => {
    const p = make();
    p.update(snap({ cpuPct: 92 }), ctx({ now: DAY }));
    p.update(snap({ cpuPct: 40 }), ctx({ now: DAY + 20_000 }));
    expect(p.tick(ctx({ now: DAY + 40_000 }))).toEqual([]);
    p.update(snap({ cpuPct: 90 }), ctx({ now: DAY + 41_000 }));
    expect(p.tick(ctx({ now: DAY + 70_000 }))).toEqual([]);
    expect(p.tick(ctx({ now: DAY + 71_000 }))).toHaveLength(1);
  });
  it('85 % exactly is not "above"', () => {
    const p = make();
    p.update(snap({ cpuPct: 85 }), ctx({ now: DAY }));
    expect(p.tick(ctx({ now: DAY + 60_000 }))).toEqual([]);
  });
  it('quiet mode keeps the animation but drops the line; busy defers; hidden does nothing', () => {
    const p = make();
    p.update(snap({ cpuPct: 95 }), ctx({ now: DAY }));
    expect(p.tick(ctx({ now: DAY + 31_000, busy: true }))).toEqual([]);
    expect(p.tick(ctx({ now: DAY + 32_000, hidden: true }))).toEqual([]);
    expect(p.tick(ctx({ now: DAY + 33_000, quiet: true }))).toEqual([{ type: 'react', line: 'overheating', anim: 'Sweat', speak: false }]);
  });
});

describe('late night', () => {
  it('says "it is late" once per night, with a yawn', () => {
    const p = make();
    expect(p.update(snap(), ctx({ now: at(1, 10) }))).toEqual([{ type: 'react', line: 'lateNight', anim: 'Yawn', speak: true }]);
    expect(p.tick(ctx({ now: at(1, 40) }))).toEqual([]);
    expect(p.tick(ctx({ now: at(4, 30) }))).toEqual([]);
    expect(p.tick(ctx({ now: at(0, 30, 6) }))).toHaveLength(1); // next night
  });
  it('not by day, not while busy (retries), not when quiet (consumed)', () => {
    const p = make();
    expect(p.update(snap(), ctx({ now: at(15) }))).toEqual([]);
    expect(p.update(snap(), ctx({ now: at(2), busy: true }))).toEqual([]);
    expect(p.tick(ctx({ now: at(2, 1) }))).toHaveLength(1);
    const q = make();
    expect(q.update(snap(), ctx({ now: at(2), quiet: true }))).toEqual([]);
    expect(q.tick(ctx({ now: at(2, 5) }))).toEqual([]);
  });
});
