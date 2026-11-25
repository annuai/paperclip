import { describe, expect, it, vi } from 'vitest';
import { CHECK_EVERY_MS, UpdateFlow, checkDue, parseUpdateState } from './updates';
import type { UpdateDeps, UpdateState } from './updates';

describe('parseUpdateState / checkDue', () => {
  it('defaults and drops garbage', () => {
    expect(parseUpdateState(undefined)).toEqual({ lastCheckAt: null, mentionedVersion: null });
    expect(parseUpdateState({ lastCheckAt: 'x', mentionedVersion: 5 })).toEqual({ lastCheckAt: null, mentionedVersion: null });
    expect(parseUpdateState({ lastCheckAt: 123, mentionedVersion: '0.2.0' })).toEqual({ lastCheckAt: 123, mentionedVersion: '0.2.0' });
  });
  it('is due when never checked, after a day, or when the clock went backwards', () => {
    expect(checkDue(null, 1000)).toBe(true);
    expect(checkDue(1000, 1000 + CHECK_EVERY_MS - 1)).toBe(false);
    expect(checkDue(1000, 1000 + CHECK_EVERY_MS)).toBe(true);
    expect(checkDue(5000, 1000)).toBe(true);
  });
});

function rig(over: Partial<UpdateDeps> = {}) {
  const said: string[] = [];
  const asked: string[] = [];
  const st = { state: { lastCheckAt: null, mentionedVersion: null } as UpdateState, now: 10 * CHECK_EVERY_MS, answer: 'later' as string | null, busy: false };
  const deps: UpdateDeps = {
    check: vi.fn(async () => null),
    install: vi.fn(async () => {}),
    now: () => st.now,
    state: () => st.state,
    save: (s) => { st.state = s; },
    line: async (k) => (k === 'updateAvailable' ? 'Version {version} is out!' : k),
    say: async (t) => { said.push(t); },
    choose: async (t) => { asked.push(t); return st.answer; },
    busy: () => st.busy,
    ...over,
  };
  return { flow: new UpdateFlow(deps), deps, st, said, asked };
}

describe('UpdateFlow manual check', () => {
  it('says he is up to date', async () => {
    const r = rig();
    expect(await r.flow.checkNow()).toBe('upToDate');
    expect(r.said).toEqual(['updateUpToDate']);
    expect(r.st.state.lastCheckAt).toBe(r.st.now);
  });
  it('offers the update and installs on "update"', async () => {
    const r = rig({ check: vi.fn(async () => ({ version: '0.2.0' })) });
    r.st.answer = 'update';
    expect(await r.flow.checkNow()).toBe('available');
    expect(r.asked).toEqual(['Version 0.2.0 is out!']);
    expect(r.deps.install).toHaveBeenCalledTimes(1);
    expect(r.said).toEqual(['updateInstalling']);
    expect(r.st.state.mentionedVersion).toBe('0.2.0');
  });
  it('does not install on Later', async () => {
    const r = rig({ check: vi.fn(async () => ({ version: '0.2.0' })) });
    await r.flow.checkNow();
    expect(r.deps.install).not.toHaveBeenCalled();
  });
  it('speaks the failure when the check throws, and when the install does', async () => {
    const r = rig({ check: vi.fn(async () => { throw new Error('offline'); }) });
    expect(await r.flow.checkNow()).toBe('error');
    expect(r.said).toEqual(['updateCheckFailed']);
    const r2 = rig({ check: vi.fn(async () => ({ version: '0.3.0' })), install: vi.fn(async () => { throw new Error('bad sig'); }) });
    r2.st.answer = 'update';
    await r2.flow.checkNow();
    expect(r2.said).toEqual(['updateInstalling', 'updateInstallFailed']);
  });
  it('a manual check re-offers a version he already mentioned', async () => {
    const r = rig({ check: vi.fn(async () => ({ version: '0.2.0' })) });
    r.st.state = { lastCheckAt: null, mentionedVersion: '0.2.0' };
    await r.flow.checkNow();
    expect(r.asked).toHaveLength(1);
  });
});

describe('UpdateFlow silent tick', () => {
  it('stays silent and offline-proof: nothing said when up to date, failing or 404', async () => {
    const r = rig();
    await r.flow.tick();
    expect(r.said).toEqual([]);
    expect(r.asked).toEqual([]);
    const r2 = rig({ check: vi.fn(async () => { throw new Error('404'); }) });
    await r2.flow.tick();
    expect(r2.said).toEqual([]);
    expect(r2.asked).toEqual([]);
    expect(r2.st.state.lastCheckAt).toBe(r2.st.now); // a failed day is not retried every tick
  });
  it('checks at most once a day', async () => {
    const r = rig();
    await r.flow.tick();
    await r.flow.tick();
    r.st.now += CHECK_EVERY_MS - 1;
    await r.flow.tick();
    expect(r.deps.check).toHaveBeenCalledTimes(1);
    r.st.now += 1;
    await r.flow.tick();
    expect(r.deps.check).toHaveBeenCalledTimes(2);
  });
  it('mentions a new version once, not again the next day', async () => {
    const r = rig({ check: vi.fn(async () => ({ version: '0.2.0' })) });
    await r.flow.tick();
    expect(r.asked).toHaveLength(1);
    r.st.now += CHECK_EVERY_MS;
    await r.flow.tick();
    expect(r.asked).toHaveLength(1);
    expect(r.deps.check).toHaveBeenCalledTimes(2);
  });
  it('mentions a newer version after an older one', async () => {
    let v = '0.2.0';
    const r = rig({ check: vi.fn(async () => ({ version: v })) });
    await r.flow.tick();
    v = '0.2.1';
    r.st.now += CHECK_EVERY_MS;
    await r.flow.tick();
    expect(r.asked).toHaveLength(2);
  });
  it('does nothing while busy, then mentions it without asking the server again', async () => {
    const r = rig({ check: vi.fn(async () => ({ version: '0.2.0' })) });
    r.st.busy = true;
    await r.flow.tick();
    expect(r.deps.check).not.toHaveBeenCalled();
    r.st.busy = false;
    await r.flow.tick();
    expect(r.asked).toHaveLength(1);
  });
});
