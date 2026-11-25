import { describe, expect, it } from 'vitest';
import greetings from './greetings.json';
import quotes from './quotes.json';
import jokes from './jokes.json';
import tips from './tips.json';
import dizzy from './dizzy.json';
import sleep from './sleep.json';
import hydration from './hydration.json';
import thanks from './thanks.json';
import presence from './presence.json';
import stretch from './stretch.json';
import focus from './focus.json';
import meeting from './meeting.json';
import { LocalContentProvider, periodOf } from './provider';
import { mulberry32 } from '../util/rng';

const texts = (xs: { text: string }[]) => xs.map((x) => x.text);
const valid = (xs: { text: string }[]) => {
  const t = texts(xs);
  expect(t.every((s) => s.trim().length > 0 && s.length <= 180)).toBe(true);
  expect(new Set(t).size).toBe(t.length);
};

describe('content', () => {
  it('has the right counts and period split', () => {
    expect(greetings).toHaveLength(15);
    for (const [p, n] of [['morning', 4], ['afternoon', 4], ['evening', 4], ['night', 3]] as const) {
      expect(greetings.filter((g) => g.period === p)).toHaveLength(n);
    }
    expect(quotes).toHaveLength(40);
    expect(jokes).toHaveLength(40);
    expect(tips).toHaveLength(20);
  });
  it('texts are non-empty, <=180 chars and unique', () => {
    [greetings, quotes, jokes, tips, dizzy, sleep, hydration, thanks, presence, stretch, focus, meeting].forEach(valid);
    expect(hydration.length).toBeGreaterThanOrEqual(15);
    expect(hydration.every((x) => x.text.length <= 100)).toBe(true); // must fit the balloon with its buttons
    expect(sleep.length).toBeGreaterThanOrEqual(10);
    expect(dizzy.length).toBeGreaterThanOrEqual(10);
  });
  it('presence lines: 10 per kind, balloon-sized, in his voice', () => {
    for (const k of ['lowBattery', 'overheating', 'lateNight']) {
      const lines = presence.filter((l) => l.kind === k);
      expect(lines.length, k).toBeGreaterThanOrEqual(10);
      expect(lines.every((l) => l.text.length <= 110), k).toBe(true);
    }
    expect(presence.every((l) => ['lowBattery', 'overheating', 'lateNight'].includes(l.kind))).toBe(true);
    expect(presence.filter((l) => l.text.startsWith("It looks like you're")).length).toBeGreaterThanOrEqual(6);
  });
  it('wellbeing lines: enough variety, balloon-sized, in his voice', () => {
    const of = <T extends { kind: string }>(xs: T[], k: string) => xs.filter((l) => l.kind === k);
    for (const [xs, k, min] of [[stretch, 'stretch', 10], [stretch, 'stretchDone', 8], [focus, 'focusStart', 5], [focus, 'focusDone', 8], [focus, 'focusBreak', 4], [meeting, 'meeting', 5]] as const) {
      const lines = of(xs, k);
      expect(lines.length, k).toBeGreaterThanOrEqual(min);
      expect(lines.every((l) => l.text.length <= 100), k).toBe(true); // offers carry two buttons: keep them short
    }
    expect(of(stretch, 'stretch').filter((l) => l.text.startsWith("It looks like you")).length).toBeGreaterThanOrEqual(4);
  });
  it('meeting templates use {when} and {title} exactly once and fit with a 48 char title', () => {
    for (const m of meeting) {
      expect(m.text.split('{title}').length, m.text).toBe(2);
      expect(m.text.includes('{when}'), m.text).toBe(true);
      expect(m.text.replace('{title}', 'x'.repeat(48)).replace('{when}', '5 minutes').length, m.text).toBeLessThanOrEqual(130);
    }
    expect(meeting.some((m) => m.text === 'It looks like you have a meeting in {when}: {title}')).toBe(true);
  });
  it('tips and quotes have the right shape', () => {
    expect(tips.every((t) => t.text.startsWith("It looks like you're"))).toBe(true);
    expect(tips.some((t) => /writing a letter/i.test(t.text))).toBe(false);
    expect(quotes.every((q) => q.author.trim().length > 0)).toBe(true);
    expect(new Set(quotes.map((q) => q.author)).size).toBeGreaterThanOrEqual(25);
  });
  it('periodOf boundaries', () => {
    const at = (h: number, m: number) => new Date(2026, 0, 1, h, m);
    expect(periodOf(at(4, 59))).toBe('night');
    expect(periodOf(at(5, 0))).toBe('morning');
    expect(periodOf(at(11, 59))).toBe('morning');
    expect(periodOf(at(12, 0))).toBe('afternoon');
    expect(periodOf(at(17, 0))).toBe('evening');
    expect(periodOf(at(22, 0))).toBe('night');
  });
  it('provider returns items of the requested kind', async () => {
    const p = new LocalContentProvider(mulberry32(3));
    expect((await p.next('quote')).attribution).toBeTruthy();
    expect((await p.next('joke')).kind).toBe('joke');
    expect((await p.next('tip')).text.startsWith("It looks like")).toBe(true);
    for (const k of ['lowBattery', 'overheating', 'lateNight'] as const) {
      const item = await p.next(k);
      expect(presence.filter((l) => l.kind === k).map((l) => l.text)).toContain(item.text);
    }
    const g = await p.next('greeting', { now: new Date(2026, 0, 1, 8, 0) });
    expect(greetings.filter((x) => x.period === 'morning').map((x) => x.text)).toContain(g.text);
  });
});
