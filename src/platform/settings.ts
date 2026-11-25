import { load } from '@tauri-apps/plugin-store';
import type { Store } from '@tauri-apps/plugin-store';
import { availableMonitors, getCurrentWindow, PhysicalPosition, primaryMonitor } from '@tauri-apps/api/window';
import { DEFAULTS, parseSettings } from './settingsParse';
import type { Settings } from './settingsParse';

export type { Settings } from './settingsParse';

let storePromise: Promise<Store | null> | null = null;

function getStore(): Promise<Store | null> {
  storePromise ??= load('settings.json', { defaults: {}, autoSave: 300 }).catch((e) => {
    console.warn('settings store unavailable', e);
    return null;
  });
  return storePromise;
}

export async function loadSettings(): Promise<Settings> {
  try {
    const s = await getStore();
    if (!s) return { ...DEFAULTS };
    const raw: Record<string, unknown> = {};
    for (const k of ['quiet', 'scheduler', 'position', 'hidden', 'style', 'water', 'greetOnUnlock', 'hideWhenPresenting', 'reactToMusic', 'stretch', 'focus', 'meetingHeadsUp', 'outfits', 'askModel', 'askIntroSeen', 'updates']) raw[k] = await s.get(k);
    return parseSettings(raw);
  } catch (e) {
    console.warn('loadSettings failed', e);
    return { ...DEFAULTS };
  }
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  try {
    const s = await getStore();
    if (!s) return;
    for (const [k, v] of Object.entries(patch)) await s.set(k, v);
    await s.save();
  } catch (e) {
    console.warn('saveSettings failed', e);
  }
}

interface MRect { x: number; y: number; w: number; h: number }

export async function restorePosition(saved: Settings['position']): Promise<void> {
  try {
    const w = getCurrentWindow();
    const monitors = await availableMonitors();
    const size = await w.outerSize();
    const rectOf = (m: { position: { x: number; y: number }; size: { width: number; height: number }; workArea?: { position: { x: number; y: number }; size: { width: number; height: number } } }): MRect => {
      const a = m.workArea ?? m;
      return { x: a.position.x, y: a.position.y, w: a.size.width, h: a.size.height };
    };
    if (saved) {
      for (const m of monitors) {
        const r = rectOf(m);
        const ox = Math.min(saved.x + size.width, r.x + r.w) - Math.max(saved.x, r.x);
        const oy = Math.min(saved.y + size.height, r.y + r.h) - Math.max(saved.y, r.y);
        if (ox >= 80 && oy >= 80) {
          const x = Math.min(Math.max(saved.x, r.x), r.x + r.w - size.width);
          const y = Math.min(Math.max(saved.y, r.y), r.y + r.h - size.height);
          await w.setPosition(new PhysicalPosition(Math.round(x), Math.round(y)));
          return;
        }
      }
    }
    const m = (await primaryMonitor()) ?? monitors[0];
    if (!m) return;
    const r = rectOf(m);
    const sf = m.scaleFactor || 1;
    await w.setPosition(new PhysicalPosition(
      Math.round(r.x + r.w - size.width - 24 * sf),
      Math.round(r.y + r.h - size.height - 64 * sf),
    ));
  } catch (e) {
    console.warn('restorePosition failed', e);
  }
}

export async function trackPosition(): Promise<void> {
  try {
    const w = getCurrentWindow();
    let timer: ReturnType<typeof setTimeout> | null = null;
    await w.onMoved(() => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          const p = await w.outerPosition();
          await saveSettings({ position: { x: p.x, y: p.y } });
        } catch (e) {
          console.warn('position save failed', e);
        }
      }, 500);
    });
  } catch (e) {
    console.warn('trackPosition failed', e);
  }
}

/** Persist the current window position right now (used when a throw comes to rest). */
export async function savePosition(): Promise<void> {
  try {
    const p = await getCurrentWindow().outerPosition();
    await saveSettings({ position: { x: p.x, y: p.y } });
  } catch (e) {
    console.warn('savePosition failed', e);
  }
}

/** Monitor the window is on, as the physics needs it: work area (physical px), scale factor. */
export async function locateWindow(pos: { x: number; y: number }): Promise<{ area: MRect; scale: number } | null> {
  try {
    const w = getCurrentWindow();
    const size = await w.outerSize();
    const monitors = await availableMonitors();
    const dpr = window.devicePixelRatio || 1;
    const rectOf = (m: (typeof monitors)[number]): MRect => {
      const a = m.workArea ?? m;
      return { x: a.position.x, y: a.position.y, w: a.size.width, h: a.size.height };
    };
    const cx = pos.x + size.width / 2;
    const cy = pos.y + size.height / 2;
    const inside = (r: MRect, x: number, y: number) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
    // Same-scale monitors first (physical coordinates agree), then a logical-px test for mixed-DPI desktops
    // (macOS positions monitors in points), then any physical hit, then the primary monitor.
    const same = monitors.filter((m) => Math.abs((m.scaleFactor || 1) - dpr) < 0.01);
    const pick =
      same.find((m) => inside(rectOf(m), cx, cy)) ??
      monitors.find((m) => { const s = m.scaleFactor || 1; const r = rectOf(m); return inside({ x: r.x / s, y: r.y / s, w: r.w / s, h: r.h / s }, cx / dpr, cy / dpr); }) ??
      monitors.find((m) => inside(rectOf(m), cx, cy)) ??
      (await primaryMonitor()) ??
      monitors[0];
    if (!pick) return null;
    return { area: rectOf(pick), scale: pick.scaleFactor || 1 };
  } catch (e) {
    console.warn('locateWindow failed', e);
    return null;
  }
}

export async function windowSize(): Promise<{ w: number; h: number } | null> {
  try {
    const s = await getCurrentWindow().outerSize();
    return { w: s.width, h: s.height };
  } catch {
    return null;
  }
}
