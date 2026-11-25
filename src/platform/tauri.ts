import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow, PhysicalPosition } from '@tauri-apps/api/window';
import { check } from '@tauri-apps/plugin-updater';
import type { Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import type { WindowCtl } from '../agent/agent';
import type { Rect } from '../ui/hitRects';
import type { CalEvent } from '../agent/meeting';
import type { AskFailure, AskResult, Turn } from '../agent/ask';

async function guard<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    console.warn(`${label} failed`, e);
    return undefined;
  }
}

export const win: WindowCtl & { startDragging(): Promise<void>; setPosition(x: number, y: number): Promise<void>; onMoved(cb: (pos: { x: number; y: number }) => void): Promise<() => void> } = {
  async show() { await guard('window.show', () => getCurrentWindow().show()); },
  async hide() { await guard('window.hide', () => getCurrentWindow().hide()); },
  async startDragging() { await getCurrentWindow().startDragging(); },
  /** Physical px, outer position (the unit `onMoved` reports). */
  async setPosition(x, y) { await getCurrentWindow().setPosition(new PhysicalPosition(x, y)); },
  async onMoved(cb) {
    const un = await getCurrentWindow().onMoved((e) => cb({ x: e.payload.x, y: e.payload.y }));
    return un;
  },
};

export async function pushHitRects(rects: Rect[]): Promise<void> {
  await guard('set_hit_rects', () => invoke('set_hit_rects', { rects }));
}
export async function onSessionUnlocked(cb: (p: { awaySeconds: number | null }) => void): Promise<() => void> {
  return listen<{ awaySeconds: number | null }>('session-unlocked', (e) => cb(e.payload));
}
export async function setEyeFollow(enabled: boolean): Promise<void> {
  await guard('set_eye_follow', () => invoke('set_eye_follow', { enabled }));
}
export async function onCursor(cb: (p: { x: number; y: number }) => void): Promise<() => void> {
  return listen<{ x: number; y: number }>('cursor', (e) => cb(e.payload));
}
export interface SystemInfo {
  fullscreen: boolean;
  batteryPct: number | null;
  charging: boolean | null;
  cpuPct: number;
  audioPlaying: boolean;
  idleSecs: number;
}
/** Emitted by the Rust sampler (5 s cadence, only when something changed). */
export async function onSystem(cb: (s: SystemInfo) => void): Promise<() => void> {
  return listen<SystemInfo>('system', (e) => cb(e.payload));
}
export async function getSystem(): Promise<SystemInfo | undefined> {
  return guard('get_system', () => invoke<SystemInfo>('get_system'));
}
export interface WellbeingTray {
  stretchEnabled: boolean;
  stretchInterval: number;
  focusLeft: number | null; // whole minutes left in a running focus session
  meeting: boolean;
  outfits: boolean;
  askKey: boolean; // an API key is stored (enables the tray's "Remove API key")
  askModel: string; // the OpenRouter model id
  askGroqModel: string;
  askProvider: string;
  askClaudeModel: string;
}
export async function syncTray(
  visible: boolean,
  quiet: boolean,
  asleep = false,
  style = 'classic',
  water = { enabled: true, intervalMin: 45, glasses: 0 },
  greet = true,
  presence = { hidePresenting: true, music: true },
  wellbeing: WellbeingTray = { stretchEnabled: true, stretchInterval: 60, focusLeft: null, meeting: false, outfits: true, askKey: false, askModel: 'google/gemma-4-31b-it:free', askGroqModel: 'llama-3.3-70b-versatile', askProvider: 'openrouter', askClaudeModel: 'claude-haiku-5-5' },
): Promise<void> {
  await guard('sync_tray', () =>
    invoke('sync_tray', {
      sync: { visible, quiet, asleep, style, waterEnabled: water.enabled, waterInterval: water.intervalMin, glasses: water.glasses, greet, hidePresenting: presence.hidePresenting, reactToMusic: presence.music, stretchEnabled: wellbeing.stretchEnabled, stretchInterval: wellbeing.stretchInterval, focusLeft: wellbeing.focusLeft, meeting: wellbeing.meeting, outfits: wellbeing.outfits, askKey: wellbeing.askKey, askModel: wellbeing.askModel, askGroqModel: wellbeing.askGroqModel, askProvider: wellbeing.askProvider, askClaudeModel: wellbeing.askClaudeModel },
    }),
  );
}
export async function getDebugHit(): Promise<boolean> {
  return (await guard('debug_hit', () => invoke<boolean>('debug_hit'))) === true;
}
export async function quitApp(): Promise<void> {
  await guard('quit_app', () => invoke('quit_app'));
}
export async function onTrayAction(cb: (a: { id: string; checked?: boolean }) => void): Promise<() => void> {
  return listen<{ id: string; checked?: boolean }>('tray-action', (e) => cb(e.payload));
}

export type CalendarAccess = 'granted' | 'denied' | 'notDetermined' | 'unsupported';
/** macOS only. False elsewhere (and in a plain browser), which hides the Meeting heads-up toggle. */
export async function calendarSupported(): Promise<boolean> {
  return (await guard('calendar_supported', () => invoke<boolean>('calendar_supported'))) === true;
}
/** Reads the authorization without ever prompting. */
export async function calendarStatus(): Promise<CalendarAccess> {
  return (await guard('calendar_status', () => invoke<CalendarAccess>('calendar_status'))) ?? 'unsupported';
}
/** Shows the macOS calendar prompt (first time only). Call it only when the user turns the toggle on. */
export async function calendarRequestAccess(): Promise<CalendarAccess> {
  return (await guard('calendar_request_access', () => invoke<CalendarAccess>('calendar_request_access'))) ?? 'denied';
}
export async function calendarSetEnabled(enabled: boolean): Promise<void> {
  await guard('calendar_set_enabled', () => invoke('calendar_set_enabled', { enabled }));
}
export async function onMeetingEvents(cb: (events: CalEvent[]) => void): Promise<() => void> {
  return listen<CalEvent[]>('meeting-events', (e) => cb(e.payload));
}

// ---- File drop (paths never reach JS: Rust keeps them, JS gets names/sizes and asks Rust to zip "what was dropped") ----
export interface FileDragEvent { phase: 'enter' | 'over' | 'leave'; x: number; y: number }
export interface FilesDropped { count: number; name: string; kind: string; bytes: number; x: number; y: number }
export async function onFileDrag(cb: (e: FileDragEvent) => void): Promise<() => void> {
  return listen<FileDragEvent>('file-drag', (e) => cb(e.payload));
}
export async function onFilesDropped(cb: (e: FilesDropped) => void): Promise<() => void> {
  return listen<FilesDropped>('files-dropped', (e) => cb(e.payload));
}
/** Zips the last-dropped items next to the first one. Resolves with the zip's file name, or null on failure. */
export async function zipDropped(): Promise<string | null> {
  try {
    return (await invoke<{ name: string }>('zip_dropped')).name;
  } catch (e) {
    console.warn('zip_dropped failed', e);
    return null;
  }
}
export async function clearDropped(): Promise<void> {
  await guard('clear_dropped', () => invoke('clear_dropped'));
}
export async function revealZip(): Promise<void> {
  await guard('reveal_zip', () => invoke('reveal_zip'));
}

// ---- Ask Paperclip. The API key lives in the OS keychain; JS can store, remove and ask "is there one?" but never read it. ----
export async function askKeyStatus(provider: string): Promise<boolean> {
  return (await guard('ask_key_status', () => invoke<boolean>('ask_key_status', { provider }))) === true;
}
/** Stores the key in the keychain. Resolves false when it could not be saved (the value is never logged). */
export async function askSetKey(key: string, provider: string): Promise<boolean> {
  try {
    await invoke('ask_set_key', { key, provider });
    return true;
  } catch {
    return false; // deliberately no console output: the argument is a secret
  }
}
export async function askRemoveKey(provider: string): Promise<void> {
  await guard('ask_remove_key', () => invoke('ask_remove_key', { provider }));
}
/** One question to the active provider (done in Rust, which reads the key itself). Never throws: failures carry a friendly message. */
export async function askQuestion(question: string, history: Turn[], model: string, provider: string): Promise<AskResult> {
  try {
    const answer = await invoke<string>('ask', { question, history, model, provider });
    return { ok: true, answer };
  } catch (e) {
    const f = e as Partial<AskFailure> | null;
    if (f && typeof f.message === 'string' && typeof f.kind === 'string') return { ok: false, failure: { kind: f.kind, message: f.message } };
    return { ok: false, failure: { kind: 'other', message: "Something went wrong when I tried to ask. Try again later." } };
  }
}
/** Gives the (normally unfocused) window the keyboard for the ask input, or hands it back afterwards. */
export async function askFocus(on: boolean): Promise<void> {
  await guard('ask_focus', () => invoke('ask_focus', { on }));
}

// ---- Updates (tauri-plugin-updater runs the HTTP in Rust, so the CSP needs no change) ----
let foundUpdate: Update | null = null;
/** The newest version when it is newer than the running one, else null. Rejects when offline or the endpoint 404s. */
export async function checkForUpdate(): Promise<{ version: string } | null> {
  foundUpdate = null;
  const u = await check({ timeout: 15_000 });
  if (!u) return null;
  foundUpdate = u;
  return { version: u.version };
}
/** Downloads and installs the update found by `checkForUpdate`, then relaunches. */
export async function installUpdateAndRestart(): Promise<void> {
  if (!foundUpdate) throw new Error('no update checked');
  await foundUpdate.downloadAndInstall();
  await relaunch();
}
