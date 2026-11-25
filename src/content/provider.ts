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
import { ShuffleBag } from '../util/shuffleBag';
import type { Rng } from '../util/rng';

export type ContentKind = 'greeting' | 'quote' | 'joke' | 'tip' | 'dizzy' | 'sleep' | 'hydration' | 'thanks' | 'lowBattery' | 'overheating' | 'lateNight'
  | 'stretch' | 'stretchDone' | 'focusStart' | 'focusDone' | 'focusBreak' | 'meeting';
export interface ContentItem { kind: ContentKind; text: string; attribution?: string }
export interface ContentProvider { next(kind: ContentKind, ctx?: { now?: Date }): Promise<ContentItem> }

type Period = 'morning' | 'afternoon' | 'evening' | 'night';

export function periodOf(d: Date): Period {
  const h = d.getHours();
  if (h >= 5 && h <= 11) return 'morning';
  if (h >= 12 && h <= 16) return 'afternoon';
  if (h >= 17 && h <= 21) return 'evening';
  return 'night';
}

export class LocalContentProvider implements ContentProvider {
  private readonly greetingBags: Record<Period, ShuffleBag<string>>;
  private readonly quoteBag: ShuffleBag<{ text: string; author: string }>;
  private readonly jokeBag: ShuffleBag<string>;
  private readonly tipBag: ShuffleBag<string>;
  private readonly dizzyBag: ShuffleBag<string>;
  private readonly sleepBag: ShuffleBag<string>;
  private readonly hydrationBag: ShuffleBag<string>;
  private readonly thanksBag: ShuffleBag<string>;
  private readonly presenceBags: Record<'lowBattery' | 'overheating' | 'lateNight', ShuffleBag<string>>;
  private readonly wellbeingBags: Record<'stretch' | 'stretchDone' | 'focusStart' | 'focusDone' | 'focusBreak' | 'meeting', ShuffleBag<string>>;

  constructor(rng: Rng = Math.random) {
    const byPeriod = (p: Period) => greetings.filter((g) => g.period === p).map((g) => g.text);
    this.greetingBags = {
      morning: new ShuffleBag(byPeriod('morning'), rng),
      afternoon: new ShuffleBag(byPeriod('afternoon'), rng),
      evening: new ShuffleBag(byPeriod('evening'), rng),
      night: new ShuffleBag(byPeriod('night'), rng),
    };
    this.quoteBag = new ShuffleBag(quotes, rng);
    this.jokeBag = new ShuffleBag(jokes.map((j) => j.text), rng);
    this.tipBag = new ShuffleBag(tips.map((t) => t.text), rng);
    this.dizzyBag = new ShuffleBag(dizzy.map((t) => t.text), rng);
    this.sleepBag = new ShuffleBag(sleep.map((t) => t.text), rng);
    this.hydrationBag = new ShuffleBag(hydration.map((t) => t.text), rng);
    this.thanksBag = new ShuffleBag(thanks.map((t) => t.text), rng);
    const ofKind = (k: string) => presence.filter((l) => l.kind === k).map((l) => l.text);
    this.presenceBags = {
      lowBattery: new ShuffleBag(ofKind('lowBattery'), rng),
      overheating: new ShuffleBag(ofKind('overheating'), rng),
      lateNight: new ShuffleBag(ofKind('lateNight'), rng),
    };
    const lines = (xs: { kind: string; text: string }[], k: string) => new ShuffleBag(xs.filter((l) => l.kind === k).map((l) => l.text), rng);
    this.wellbeingBags = {
      stretch: lines(stretch, 'stretch'),
      stretchDone: lines(stretch, 'stretchDone'),
      focusStart: lines(focus, 'focusStart'),
      focusDone: lines(focus, 'focusDone'),
      focusBreak: lines(focus, 'focusBreak'),
      meeting: lines(meeting, 'meeting'), // templates: {when} and {title} are filled in by meetingLine()
    };
  }

  async next(kind: ContentKind, ctx?: { now?: Date }): Promise<ContentItem> {
    switch (kind) {
      case 'greeting':
        return { kind, text: this.greetingBags[periodOf(ctx?.now ?? new Date())].next() };
      case 'quote': {
        const q = this.quoteBag.next();
        return { kind, text: q.text, attribution: q.author };
      }
      case 'joke':
        return { kind, text: this.jokeBag.next() };
      case 'tip':
        return { kind, text: this.tipBag.next() };
      case 'dizzy':
        return { kind, text: this.dizzyBag.next() };
      case 'sleep':
        return { kind, text: this.sleepBag.next() };
      case 'hydration':
        return { kind, text: this.hydrationBag.next() };
      case 'thanks':
        return { kind, text: this.thanksBag.next() };
      case 'lowBattery':
      case 'overheating':
      case 'lateNight':
        return { kind, text: this.presenceBags[kind].next() };
      case 'stretch':
      case 'stretchDone':
      case 'focusStart':
      case 'focusDone':
      case 'focusBreak':
      case 'meeting':
        return { kind, text: this.wellbeingBags[kind].next() };
    }
  }
}
