import type { SchedulerConfig } from '../agent/scheduler';
import { DEFAULT_INTERVAL, INTERVAL_OPTIONS } from '../agent/hydration';
import type { IntervalMin } from '../agent/hydration';
import { DEFAULT_STRETCH_MIN, STRETCH_OPTIONS } from '../agent/stretch';
import type { StretchConfig } from '../agent/stretch';
import type { FocusSaved } from '../agent/focus';
import { DEFAULT_STYLE, normalizeStyle } from '../art/style';
import type { Style } from '../art/style';
import { DEFAULT_ASK_MODEL, DEFAULT_ASK_PROVIDER, DEFAULT_CLAUDE_MODEL, DEFAULT_GROQ_MODEL, normalizeAskModel, normalizeAskProvider, normalizeClaudeModel, normalizeGroqModel } from '../agent/ask';
import type { AskModel, AskProvider, ClaudeModel, GroqModel } from '../agent/ask';
import { DEFAULT_OUTFIT_SETTING, normalizeOutfitSetting } from '../art/outfits';
import type { OutfitSetting } from '../art/outfits';
import { DEFAULT_UPDATE_STATE, parseUpdateState } from '../agent/updates';
import type { UpdateState } from '../agent/updates';

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
  hideWhenPresenting: boolean; // slip away while another app is full screen / presenting (default on)
  reactToMusic: boolean; // dance now and then while audio is playing (default on)
  stretch: StretchConfig; // stretch-break nudges (default on, every 60 active minutes)
  focus: FocusSaved | null; // a running focus session's end timestamp (survives sleep and restarts)
  outfits: OutfitSetting; // seasonal outfits: 'auto' dresses for the date (default), 'off' never
  askProvider: AskProvider; // Ask Paperclip: 'openrouter' (default, also for existing users), 'groq' (optional, free tier) or 'anthropic' (optional, needs a Claude API key)
  askGroqModel: GroqModel; // the Groq provider's model id (default 'qwen/qwen3.8-27b'; the old default 'llama-3.3-70b-versatile' migrates to it, or 'openai/gpt-oss-120b', or any valid Groq id)
  askClaudeModel: ClaudeModel; // the Anthropic provider's model: 'claude-haiku-5-5' (default) or 'claude-sonnet-5-5'. Old stored `askModel: 'claude-*'` values land here.
  askModel: AskModel; // Ask Paperclip: an OpenRouter model id (default free 'google/gemma-4-31b-it:free'). The API key itself is NOT a setting: it lives in the OS keychain.
  askIntroSeen: boolean; // the one-time "only what you type is sent to the provider" line has been shown
  updates: UpdateState; // daily silent update check: when it last ran and the newest version he already mentioned
  meetingHeadsUp: boolean; // macOS: say something 5 min before a calendar event (default off, asks for access when turned on)
}

export const DEFAULT_WATER: WaterSettings = { enabled: true, intervalMin: DEFAULT_INTERVAL, lastReminderAt: null, glasses: 0, glassesDate: '' };

export const DEFAULTS: Settings = { quiet: false, scheduler: {}, position: null, hidden: false, style: DEFAULT_STYLE, water: DEFAULT_WATER, greetOnUnlock: true, hideWhenPresenting: true, reactToMusic: true, stretch: { enabled: true, everyMin: DEFAULT_STRETCH_MIN }, focus: null, meetingHeadsUp: false, outfits: DEFAULT_OUTFIT_SETTING, askProvider: DEFAULT_ASK_PROVIDER, askGroqModel: DEFAULT_GROQ_MODEL, askClaudeModel: DEFAULT_CLAUDE_MODEL, askModel: DEFAULT_ASK_MODEL, askIntroSeen: false, updates: DEFAULT_UPDATE_STATE };

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
    hideWhenPresenting: raw.hideWhenPresenting !== false,
    reactToMusic: raw.reactToMusic !== false,
    stretch: parseStretch(raw.stretch),
    focus: parseFocus(raw.focus),
    meetingHeadsUp: raw.meetingHeadsUp === true,
    outfits: normalizeOutfitSetting(raw.outfits),
    askProvider: normalizeAskProvider(raw.askProvider),
    askGroqModel: normalizeGroqModel(raw.askGroqModel),
    // Before providers existed `askModel` held the Claude id; it stays the Claude choice, the OpenRouter model starts at the free default.
    askClaudeModel: normalizeClaudeModel(raw.askClaudeModel ?? raw.askModel),
    askModel: normalizeAskModel(raw.askModel),
    askIntroSeen: raw.askIntroSeen === true,
    updates: parseUpdateState(raw.updates),
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

export function parseStretch(raw: unknown): StretchConfig {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    enabled: s.enabled !== false, // on by default
    everyMin: STRETCH_OPTIONS.find((n) => n === s.everyMin) ?? DEFAULT_STRETCH_MIN,
  };
}

export function parseFocus(raw: unknown): FocusSaved | null {
  const f = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;
  return ok(f.endsAt) && ok(f.minutes) ? { endsAt: f.endsAt, minutes: f.minutes } : null;
}
