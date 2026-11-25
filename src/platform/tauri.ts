import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow, PhysicalPosition } from '@tauri-apps/api/window';
import type { WindowCtl } from '../agent/agent';
import type { Rect } from '../ui/hitRects';
import type { CalEvent } from '../agent/meeting';

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
}
export async function syncTray(
  visible: boolean,
  quiet: boolean,
  asleep = false,
  style = 'classic',
  water = { enabled: true, intervalMin: 45, glasses: 0 },
  greet = true,
  presence = { hidePresenting: true, music: true },
  wellbeing: WellbeingTray = { stretchEnabled: true, stretchInterval: 60, focusLeft: null, meeting: false, outfits: true },
): Promise<void> {
  await guard('sync_tray', () =>
    invoke('sync_tray', {
      sync: { visible, quiet, asleep, style, waterEnabled: water.enabled, waterInterval: water.intervalMin, glasses: water.glasses, greet, hidePresenting: presence.hidePresenting, reactToMusic: presence.music, stretchEnabled: wellbeing.stretchEnabled, stretchInterval: wellbeing.stretchInterval, focusLeft: wellbeing.focusLeft, meeting: wellbeing.meeting, outfits: wellbeing.outfits },
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
