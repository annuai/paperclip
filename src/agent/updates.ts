import type { ContentKind } from '../content/provider';

export const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;

/** What survives restarts: when we last asked the server, and the newest version he has already mentioned. */
export interface UpdateState {
  lastCheckAt: number | null;
  mentionedVersion: string | null;
}
export const DEFAULT_UPDATE_STATE: UpdateState = { lastCheckAt: null, mentionedVersion: null };

export function parseUpdateState(raw: unknown): UpdateState {
  const u = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    lastCheckAt: typeof u.lastCheckAt === 'number' && Number.isFinite(u.lastCheckAt) && u.lastCheckAt > 0 ? u.lastCheckAt : null,
    mentionedVersion: typeof u.mentionedVersion === 'string' && u.mentionedVersion.trim() ? u.mentionedVersion : null,
  };
}

/** True when the daily silent check is due (never checked, a day has passed, or the clock went backwards). */
export function checkDue(last: number | null, now: number): boolean {
  return last === null || now < last || now - last >= CHECK_EVERY_MS;
}

export interface UpdateDeps {
  /** The newest version when it is newer than the running one, else null. Rejects when the server is unreachable or 404s. */
  check(): Promise<{ version: string } | null>;
  /** Download, install and relaunch. Rejects on failure; resolves (rarely observed) when the relaunch did not happen. */
  install(): Promise<void>;
  now(): number;
  state(): UpdateState;
  save(s: UpdateState): void;
  line(kind: ContentKind): Promise<string>;
  say(text: string): Promise<unknown>;
  choose(text: string, actions: { id: string; label: string }[]): Promise<string | null>;
  /** He should not interrupt right now (hidden, a balloon is up, focus mode, quiet mode, asleep...). Only the silent path asks. */
  busy(): boolean;
}

export type CheckOutcome = 'upToDate' | 'available' | 'error';

/**
 * Update flow. The manual check always answers out loud. The daily silent check says nothing when there is nothing
 * to say (up to date, offline, 404 on a private repo) and mentions a given version once, however many days it stays out.
 */
export class UpdateFlow {
  private running = false;
  private pending: string | null = null; // found by the silent check, not yet mentioned (he was busy)

  constructor(private readonly d: UpdateDeps) {}

  private stamp(): void {
    this.d.save({ ...this.d.state(), lastCheckAt: this.d.now() });
  }

  private async offer(version: string): Promise<void> {
    this.d.save({ ...this.d.state(), mentionedVersion: version });
    this.pending = null;
    const text = (await this.d.line('updateAvailable')).replace('{version}', version);
    const choice = await this.d.choose(text, [
      { id: 'update', label: 'Update and restart' },
      { id: 'later', label: 'Later' },
    ]);
    if (choice !== 'update') return;
    await this.d.say(await this.d.line('updateInstalling'));
    try {
      await this.d.install();
    } catch (e) {
      console.warn('update install failed', e);
      await this.d.say(await this.d.line('updateInstallFailed'));
    }
  }

  /** "Check for updates…": always speaks. */
  async checkNow(): Promise<CheckOutcome> {
    if (this.running) return 'error';
    this.running = true;
    try {
      let found: { version: string } | null;
      try {
        found = await this.d.check();
      } catch (e) {
        console.warn('update check failed', e);
        await this.d.say(await this.d.line('updateCheckFailed'));
        return 'error';
      }
      this.stamp();
      if (!found) {
        await this.d.say(await this.d.line('updateUpToDate'));
        return 'upToDate';
      }
      await this.offer(found.version);
      return 'available';
    } finally {
      this.running = false;
    }
  }

  /** Called every so often (cheap: no network unless a check is due). Never speaks unless an unmentioned version exists. */
  async tick(): Promise<void> {
    if (this.running || this.d.busy()) return;
    this.running = true;
    try {
      if (this.pending === null) {
        if (!checkDue(this.d.state().lastCheckAt, this.d.now())) return;
        this.stamp(); // stamped up front: an offline or 404 day is simply skipped, not retried every tick
        let found: { version: string } | null = null;
        try {
          found = await this.d.check();
        } catch (e) {
          console.debug('silent update check failed', e);
          return;
        }
        if (!found || found.version === this.d.state().mentionedVersion) return;
        this.pending = found.version;
      }
      await this.offer(this.pending);
    } finally {
      this.running = false;
    }
  }
}
