import welcome from '../content/welcome.json';
import { ShuffleBag } from '../util/shuffleBag';
import type { Rng } from '../util/rng';
import { dateKey } from './hydration';

export type AwayGroup = 'short' | 'medium' | 'long';
export const SHORT_AWAY_S = 10 * 60; // < 10 min
export const MEDIUM_AWAY_S = 2 * 3600; // 10 min .. 2 h; beyond (or unknown) = long
export const GREET_COOLDOWN_MS = 2 * 60_000;
export const MORNING_START_HOUR = 5;
export const MORNING_END_HOUR = 11;

export function awayGroup(awaySeconds: number | null): AwayGroup {
  if (awaySeconds === null) return 'long';
  if (awaySeconds < SHORT_AWAY_S) return 'short';
  return awaySeconds <= MEDIUM_AWAY_S ? 'medium' : 'long';
}

export function isMorning(d: Date): boolean {
  const h = d.getHours();
  return h >= MORNING_START_HOUR && h < MORNING_END_HOUR;
}

export interface LinePicker { pick(group: AwayGroup | 'morning'): string }

/** Welcome lines, one shuffle bag per group so nothing repeats back-to-back. */
export class WelcomeLines implements LinePicker {
  private readonly bags: Record<AwayGroup | 'morning', ShuffleBag<string>>;

  constructor(rng: Rng = Math.random) {
    const of = (g: string) => welcome.filter((w) => w.group === g).map((w) => w.text);
    this.bags = {
      short: new ShuffleBag(of('short'), rng),
      medium: new ShuffleBag(of('medium'), rng),
      long: new ShuffleBag(of('long'), rng),
      morning: new ShuffleBag(of('morning'), rng),
    };
  }

  pick(group: AwayGroup | 'morning'): string {
    return this.bags[group].next();
  }
}

export interface WelcomeDeps {
  enabled(): boolean; // "Greet me when I unlock"
  isHidden(): boolean; // hidden by the user: do nothing
  isAsleep(): boolean;
  isQuiet(): boolean; // quiet mode: wave only, no balloon
  waitForReminder(): Promise<void>; // resolves once no hydration reminder is open
  wake(): Promise<void>; // WakeUp without the sleep line
  endFollow(): void;
  interrupt(): void; // cut idle animations
  wave(): Promise<void>;
  speak(text: string): Promise<void>;
}

export type WelcomeResult = 'greeted' | 'waved' | 'skipped';

export class WelcomeBack {
  private lastGreetAt = -Infinity;
  private morningDate = '';

  constructor(
    private readonly d: WelcomeDeps,
    private readonly lines: LinePicker,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async onUnlock(awaySeconds: number | null): Promise<WelcomeResult> {
    if (!this.d.enabled() || this.d.isHidden()) return 'skipped';
    if (this.now() - this.lastGreetAt < GREET_COOLDOWN_MS) return 'skipped';
    this.lastGreetAt = this.now(); // claim the slot so a quick second unlock can't double up
    await this.d.waitForReminder(); // never interrupt an open water reminder: queue behind it
    if (this.d.isHidden()) return 'skipped';
    if (this.d.isAsleep()) await this.d.wake();
    this.d.endFollow();
    this.d.interrupt();
    const t = this.now();
    let group: AwayGroup | 'morning' = awayGroup(awaySeconds);
    if (isMorning(new Date(t)) && this.morningDate !== dateKey(t)) {
      this.morningDate = dateKey(t);
      group = 'morning';
    }
    await this.d.wave();
    if (this.d.isQuiet()) return 'waved';
    await this.d.speak(this.lines.pick(group));
    return 'greeted';
  }
}
