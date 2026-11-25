import type { SchedulerConfig } from '../agent/scheduler';
import { DEFAULT_INTERVAL, INTERVAL_OPTIONS } from '../agent/hydration';
import type { IntervalMin } from '../agent/hydration';
import { DEFAULT_STYLE, normalizeStyle } from '../art/style';
import type { Style } from '../art/style';

export interface WaterSettings {
  enabled: boolean; // default on
  intervalMin: IntervalMin;
  lastReminderAt: number | null;
  glasses: number;
  glassesDate: string; // local YYYY-MM-DD the count belongs to
}

export interface Settings {
  quiet: boolean;
  scheduler: Partial<SchedulerConfig>;
  position: { x: number; y: number } | null; // physical px, outer position
  hidden: boolean; // user hid Paperclip to the tray; next launch starts hidden (default: shown)
  style: Style; // visual skin, default 'classic'
  water: WaterSettings;
  greetOnUnlock: boolean; // say hello when the screen is unlocked (default on)
}

export const DEFAULT_WATER: WaterSettings = { enabled: true, intervalMin: DEFAULT_INTERVAL, lastReminderAt: null, glasses: 0, glassesDate: '' };

export const DEFAULTS: Settings = { quiet: false, scheduler: {}, position: null, hidden: false, style: DEFAULT_STYLE, water: DEFAULT_WATER, greetOnUnlock: true };

/** Validate raw persisted values (anything can be in the store file) into a Settings object. */
export function parseSettings(raw: Record<string, unknown>): Settings {
  const pos = raw.position as { x?: unknown; y?: unknown } | null | undefined;
  const position =
    pos && typeof pos.x === 'number' && typeof pos.y === 'number' && Number.isFinite(pos.x) && Number.isFinite(pos.y)
      ? { x: pos.x, y: pos.y }
      : null;
  const sched = raw.scheduler;
  return {
    quiet: raw.quiet === true,
    scheduler: sched && typeof sched === 'object' ? (sched as Partial<SchedulerConfig>) : {},
    position,
    hidden: raw.hidden === true,
    style: normalizeStyle(raw.style),
    water: parseWater(raw.water),
    greetOnUnlock: raw.greetOnUnlock !== false,
  };
}

export function parseWater(raw: unknown): WaterSettings {
  const w = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const interval = INTERVAL_OPTIONS.find((n) => n === w.intervalMin) ?? DEFAULT_INTERVAL;
  const last = typeof w.lastReminderAt === 'number' && Number.isFinite(w.lastReminderAt) ? w.lastReminderAt : null;
  const glasses = typeof w.glasses === 'number' && Number.isFinite(w.glasses) && w.glasses >= 0 ? Math.floor(w.glasses) : 0;
  return {
    enabled: w.enabled !== false, // on by default
    intervalMin: interval,
    lastReminderAt: last,
    glasses,
    glassesDate: typeof w.glassesDate === 'string' ? w.glassesDate : '',
  };
}
