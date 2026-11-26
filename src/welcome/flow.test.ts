import { describe, expect, it } from 'vitest';
import * as f from './flow';

const none = { openrouter: false, groq: false, anthropic: false };
const start = (q = '', saved = none) => f.initial(new URLSearchParams(q), saved);
const on = (screen: f.Screen) => f.goto(start(), screen);

describe('guide flow', () => {
  it('initial reads the query and falls back on junk', () => {
    expect(start('start=key&provider=groq&platform=windows')).toMatchObject({ screen: 'key', provider: 'groq', platform: 'windows' });
    expect(start('start=nope&provider=x&platform=amiga')).toMatchObject({ screen: 'hello', provider: 'openrouter', platform: 'macos' });
  });
  it('runs lessons in order', () => {
    const s = on('try');
    expect(f.activeLesson(s)).toBe('click');
    expect(f.perform(s, 'doubleClick')).toEqual(s);
    expect(f.activeLesson(f.perform(s, 'click'))).toBe('doubleClick');
    expect(s.lessons.click).toBe('todo'); // pure
  });
  it('skipping advances and finishes the screen', () => {
    let s = on('try');
    for (let i = 0; i < 4; i++) s = f.skipLesson(s);
    expect(s.lessons.click).toBe('skipped');
    expect(f.screenDone(s)).toBe(true);
    expect(f.activeLesson(s)).toBeNull();
  });
  it('labels the forward action', () => {
    expect(f.forward(on('hello'))).toEqual({ label: "Let's go ›", primary: true });
    let t = on('try');
    expect(f.forward(t)).toEqual({ label: 'Skip ›', primary: false });
    for (const l of f.LESSONS.try) t = f.perform(t, l);
    expect(f.forward(t)).toEqual({ label: 'Next ›', primary: true });
    expect(f.forward(on('key'))).toEqual({ label: 'Skip for now ›', primary: false });
    expect(f.forward(f.markKeySaved(on('key'), 'openrouter'))).toEqual({ label: 'Next ›', primary: true });
    expect(f.forward(on('ask'))).toEqual({ label: 'Finish ›', primary: false });
    expect(f.forward(f.markAsked(on('ask')))).toEqual({ label: 'Finish ›', primary: true });
  });
  it('is never a trap and stops at the ends', () => {
    expect(f.next(on('try')).screen).toBe('menus');
    expect(f.back(on('hello')).screen).toBe('hello');
    expect(f.next(on('ask')).screen).toBe('ask');
    expect(f.back(on('ask')).screen).toBe('key');
  });
  it('rehearses in order, then waits for "now for real"', () => {
    let s = on('key');
    expect(s).toMatchObject({ keyPhase: 'rehearse', rehearsal: 'signIn' });
    expect(f.rehearse(s, 'copy')).toEqual(s);
    for (const step of f.REHEARSAL) s = f.rehearse(s, step);
    expect(s).toMatchObject({ keyPhase: 'rehearse', rehearsal: 'done' });
    expect(f.skipRehearsal(s).keyPhase).toBe('real');
  });
  it('phase follows saved keys', () => {
    expect(start('', { ...none, openrouter: true }).keyPhase).toBe('real');
    const mid = f.rehearse(on('key'), 'signIn');
    expect(f.setProvider(mid, 'groq')).toMatchObject({ provider: 'groq', keyPhase: 'rehearse', rehearsal: 'createKey' });
    expect(f.markKeySaved(f.setProvider(mid, 'groq'), 'groq')).toMatchObject({ keyPhase: 'real', keySaved: { groq: true } });
    expect(f.setProvider(start('', { ...none, groq: true }), 'groq').keyPhase).toBe('real');
  });
  it('counts the tray only on the menus screen when it is the active lesson', () => {
    let s = on('menus');
    expect(f.perform(s, 'tray')).toEqual(s);
    s = f.perform(f.perform(s, 'menuPick'), 'askBox');
    expect(f.perform(f.goto(s, 'try'), 'tray').lessons.tray).toBe('todo');
    expect(f.perform(s, 'tray').lessons.tray).toBe('done');
  });
  it('keeps a typed question for the ask screen', () => {
    expect(f.setDraft(on('menus'), 'hi?').draftQuestion).toBe('hi?');
  });
});
