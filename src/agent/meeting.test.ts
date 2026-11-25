import { describe, expect, it } from 'vitest';
import { MeetingAlerts, meetingKey, meetingLine, tidyTitle } from './meeting';
import type { CalEvent } from './meeting';

const MIN = 60_000;
const NOW = 1_700_000_000_000;
const ev = (over: Partial<CalEvent> = {}): CalEvent => ({ id: 'a', title: 'Standup', startMs: NOW + 5 * MIN, allDay: false, ...over });

describe('MeetingAlerts', () => {
  it('fires once when a meeting is 5 minutes away', () => {
    const m = new MeetingAlerts();
    expect(m.take([ev()], NOW).map((e) => e.title)).toEqual(['Standup']);
    expect(m.take([ev()], NOW + MIN / 2)).toEqual([]); // the next 60 s poll sees it again
  });

  it('waits until it is within 5 minutes (the poll window is 6 min)', () => {
    const m = new MeetingAlerts();
    const e = ev({ startMs: NOW + 5.8 * MIN });
    expect(m.take([e], NOW)).toEqual([]);
    expect(m.take([e], NOW + MIN)).toHaveLength(1); // 4.8 min away now
  });

  it('skips all-day events, past events and anything beyond 6 minutes', () => {
    const m = new MeetingAlerts();
    expect(m.take([ev({ allDay: true })], NOW)).toEqual([]);
    expect(m.take([ev({ startMs: NOW - MIN })], NOW)).toEqual([]);
    expect(m.take([ev({ startMs: NOW })], NOW)).toEqual([]);
    expect(m.take([ev({ startMs: NOW + 20 * MIN })], NOW)).toEqual([]);
  });

  it('dedupes the same meeting that is on two calendars or comes back with another id', () => {
    const m = new MeetingAlerts();
    const got = m.take([ev({ id: 'x' }), ev({ id: 'y', title: ' standup ' })], NOW);
    expect(got).toHaveLength(1);
    expect(m.take([ev({ id: 'z' })], NOW + MIN)).toEqual([]);
  });

  it('a recurring event fires again for its next occurrence', () => {
    const m = new MeetingAlerts();
    expect(m.take([ev()], NOW)).toHaveLength(1);
    const next = ev({ startMs: NOW + 24 * 60 * MIN + 5 * MIN });
    expect(m.take([next], NOW + 24 * 60 * MIN)).toHaveLength(1);
  });

  it('different meetings at the same time both fire (sorted, earliest first)', () => {
    const m = new MeetingAlerts();
    const got = m.take([ev({ title: 'B', startMs: NOW + 4 * MIN }), ev({ title: 'A', startMs: NOW + 3 * MIN })], NOW);
    expect(got.map((e) => e.title)).toEqual(['A', 'B']);
  });

  it('peek does not consume, so a blocked moment can retry on the next poll', () => {
    const m = new MeetingAlerts();
    expect(m.peek([ev()], NOW)).toHaveLength(1);
    expect(m.peek([ev()], NOW)).toHaveLength(1);
    m.markFired(m.peek([ev()], NOW));
    expect(m.peek([ev()], NOW)).toEqual([]);
  });

  it('forgets old keys so the set cannot grow forever', () => {
    const m = new MeetingAlerts();
    m.take([ev()], NOW);
    expect(m.size).toBe(1);
    m.take([], NOW + 3 * 60 * MIN);
    expect(m.size).toBe(0);
  });

  it('meetingKey ignores case, spacing and the event id', () => {
    expect(meetingKey(ev({ id: '1', title: 'Team  Sync' }))).toBe(meetingKey(ev({ id: '2', title: 'team sync ' })));
  });
});

describe('meeting lines', () => {
  it('tidyTitle trims, collapses whitespace and shortens', () => {
    expect(tidyTitle('  Q3   planning \n')).toBe('Q3 planning');
    expect(tidyTitle('')).toBe('a meeting');
    expect(tidyTitle('x'.repeat(100)).length).toBeLessThanOrEqual(48);
    expect(tidyTitle('x'.repeat(100)).endsWith('…')).toBe(true);
  });
  it('says "in 5 minutes" with the title', () => {
    const line = meetingLine([ev()], NOW, 'It looks like you have a meeting in {when}: {title}');
    expect(line).toBe('It looks like you have a meeting in 5 minutes: Standup');
  });
  it('singular minute and "and N more"', () => {
    const l = meetingLine([ev({ startMs: NOW + 40_000 }), ev({ title: 'B' }), ev({ title: 'C' })], NOW, 'In {when}: {title}');
    expect(l).toBe('In 1 minute: Standup (+2 more)');
  });
});
