// What every guide screen gets from the host.
import type { GuideState } from './flow';
import type { GuidePlatform } from './platform';
import type { Stage } from './stage';
import type { ContentProvider } from '../content/provider';

export interface ScreenContext {
  get(): GuideState;
  /** Stores a new state and refreshes the screen and footer. */
  set(s: GuideState): void;
  stage: Stage;
  platform: GuidePlatform;
  content: ContentProvider;
  reducedMotion: boolean;
  /** The pane balloon: the line, and optionally a smaller marigold line under it. */
  say(text: string, sub?: string): void;
  /** A one-off remark that replaces whatever he was saying. */
  interject(text: string): void;
  announce(text: string): void;
  /** Model id for the current provider; '' means the provider's default. */
  model(): string;
  finish(): void;
}

export interface ScreenView {
  /** Re-reads the state (called after every change). */
  update(): void;
  destroy(): void;
}
