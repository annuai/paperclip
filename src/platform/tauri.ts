import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { WindowCtl } from '../agent/agent';
import type { Rect } from '../ui/hitRects';

async function guard<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    console.warn(`${label} failed`, e);
    return undefined;
  }
}

export const win: WindowCtl & { startDragging(): Promise<void>; onMoved(cb: (pos: { x: number; y: number }) => void): Promise<() => void> } = {
  async show() { await guard('window.show', () => getCurrentWindow().show()); },
  async hide() { await guard('window.hide', () => getCurrentWindow().hide()); },
  async startDragging() { await getCurrentWindow().startDragging(); },
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
export async function syncTray(
  visible: boolean,
  quiet: boolean,
  asleep = false,
  style = 'classic',
  water = { enabled: true, intervalMin: 45, glasses: 0 },
  greet = true,
  presence = { hidePresenting: true, music: true },
): Promise<void> {
  await guard('sync_tray', () =>
    invoke('sync_tray', {
      sync: { visible, quiet, asleep, style, waterEnabled: water.enabled, waterInterval: water.intervalMin, glasses: water.glasses, greet, hidePresenting: presence.hidePresenting, reactToMusic: presence.music },
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
