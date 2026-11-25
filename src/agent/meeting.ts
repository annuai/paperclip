/** One upcoming calendar event as the Rust poller (`calendar.rs`) reports it. */
export interface CalEvent {
  id: string;
  title: string;
  startMs: number; // epoch ms
  allDay: boolean;
}

const MIN = 60_000;
/** The heads-up goes out once a meeting is this close (the Rust poll looks 6 min ahead, once a minute). */
export const HEADS_UP_MIN = 5;
export const LOOKAHEAD_MIN = 6;
const KEEP_MS = 60 * MIN;
const TITLE_MAX = 48;

export function tidyTitle(raw: string): string {
  const t = raw.replace(/\s+/g, ' ').trim();
  if (!t) return 'a meeting';
  return t.length > TITLE_MAX ? t.slice(0, TITLE_MAX - 1).trimEnd() + '…' : t;
}

/**
 * Dedupe key: the same meeting can sit on two calendars (different ids) and a recurring series reuses one
 * id, so the key is the start time plus the normalised title.
 */
export function meetingKey(e: CalEvent): string {
  return `${e.startMs}|${e.title.replace(/\s+/g, ' ').trim().toLowerCase()}`;
}

/** Decides which polled events deserve a heads-up, each one exactly once. Pure and clock-free. */
export class MeetingAlerts {
  private readonly fired = new Map<string, number>(); // key -> startMs

  get size(): number { return this.fired.size; }

  /** The events that are due now and not yet announced (earliest first, duplicates folded). Consumes nothing. */
  peek(events: CalEvent[], now: number): CalEvent[] {
    const seen = new Set<string>();
    return events
      .filter((e) => !e.allDay && e.startMs > now && e.startMs - now <= HEADS_UP_MIN * MIN)
      .sort((a, b) => a.startMs - b.startMs)
      .filter((e) => {
        const k = meetingKey(e);
        if (this.fired.has(k) || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
  }

  markFired(events: CalEvent[]): void {
    for (const e of events) this.fired.set(meetingKey(e), e.startMs);
  }

  /** peek + markFired, plus forgetting meetings that started more than an hour ago. */
  take(events: CalEvent[], now: number): CalEvent[] {
    for (const [k, start] of this.fired) if (start < now - KEEP_MS) this.fired.delete(k);
    const due = this.peek(events, now);
    this.markFired(due);
    return due;
  }
}

/** Fills a content template: `{when}` = "5 minutes" and `{title}`; extra meetings become "(+N more)". */
export function meetingLine(due: CalEvent[], now: number, template: string): string {
  const first = due[0];
  const mins = Math.max(1, Math.round((first.startMs - now) / MIN));
  const when = `${mins} ${mins === 1 ? 'minute' : 'minutes'}`;
  const more = due.length > 1 ? ` (+${due.length - 1} more)` : '';
  return template.replace('{when}', when).replace('{title}', tidyTitle(first.title)) + more;
}
