# Paperclip Desktop Assistant — Implementation Plan

> Spec: `docs/superpowers/specs/2026-11-25-paperclip-assistant-design.md`
> Audience: a builder agent executing tasks in order (§M). Every value below is a decision, not a suggestion.
> If a library API differs slightly from what is written here (minor version drift), adapt to the installed
> types but keep the behaviour. Never copy Microsoft Clippy / clippy.js artwork or sprite data.

## 0. Summary

Tauri 2 app, one transparent 320x340 always-on-top window, vanilla TypeScript frontend built with Vite.
The character is an **original parametric SVG paperclip** whose parts (wire body, eyes, pupils, lids,
brows, props) are driven by a `Pose`. Animations are lists of pose keyframes (clippy.js-like structure:
frames, durations, weighted branching, exit branches). One `requestAnimationFrame` loop runs **only while
an animation plays**; idle behaviour is driven by `setTimeout` timers. A Rust thread polls the global
cursor and toggles `set_ignore_cursor_events` so transparent pixels are click-through. Settings and window
position persist via `tauri-plugin-store`. Tray menu and an HTML context menu expose actions.

---

## A. Stack and project configuration

Project root: `/Users/annuaip/Downloads/Clippy` (not a git repo; builder may `git init` in task 1).
Do **not** use `create-tauri-app` (interactive). Write the files below by hand.

### A.1 `package.json`

```json
{
  "name": "paperclip",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "tauri": "tauri",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "lint:rs": "cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings"
  },
  "dependencies": {
    "@tauri-apps/api": "^2",
    "@tauri-apps/plugin-store": "^2"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2",
    "typescript": "^5.6",
    "vite": "^7",
    "vitest": "^3.2"
  }
}
```

Autostart is controlled entirely from Rust (tray), so `@tauri-apps/plugin-autostart` is not needed in JS.
Install with `npm install` (versions resolve to latest 2.x / 5.x / 7.x / 3.x).

### A.2 `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2021", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

### A.3 `vite.config.ts`

```ts
import { defineConfig } from 'vitest/config';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari15',
    minify: process.env.TAURI_ENV_DEBUG ? false : 'esbuild',
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
```

### A.4 `index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Paperclip</title>
    <link rel="stylesheet" href="/src/styles.css" />
  </head>
  <body>
    <div id="stage">
      <div id="balloon" class="balloon hidden" role="status" aria-live="polite">
        <div class="balloon-text"></div>
      </div>
      <div id="character"></div>
      <div id="menu" class="menu hidden" role="menu"></div>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`styles.css` must set `html, body { margin:0; background: transparent; overflow:hidden;
user-select:none; -webkit-user-select:none; cursor: default; }` and `#stage { position:relative;
width:320px; height:340px; }`. Font: `system-ui, -apple-system, "Segoe UI", sans-serif`.

### A.5 `src-tauri/Cargo.toml`

```toml
[package]
name = "paperclip"
version = "0.1.0"
edition = "2021"

[lib]
name = "paperclip_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = ["tray-icon", "macos-private-api"] }
tauri-plugin-store = "2"
tauri-plugin-autostart = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"

[profile.release]
codegen-units = 1
lto = true
opt-level = "s"
panic = "abort"
strip = true
```

`macos-private-api` feature is **required** because `macOSPrivateApi: true` (tauri-build fails if the
config and the feature disagree). `src-tauri/build.rs`: `fn main() { tauri_build::build() }`.

### A.6 `src-tauri/tauri.conf.json`

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Paperclip",
  "version": "0.1.0",
  "identifier": "app.paperclip.desktop",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "macOSPrivateApi": true,
    "withGlobalTauri": false,
    "windows": [
      {
        "label": "main",
        "title": "Paperclip",
        "width": 320,
        "height": 340,
        "resizable": false,
        "maximizable": false,
        "minimizable": false,
        "decorations": false,
        "transparent": true,
        "alwaysOnTop": true,
        "skipTaskbar": true,
        "shadow": false,
        "visible": false,
        "focus": false,
        "acceptFirstMouse": true
      }
    ],
    "security": {
      "csp": "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src ipc: http://ipc.localhost"
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

Window starts `visible:false`; the frontend restores position first, then shows it (no flash at 0,0).

### A.7 `src-tauri/capabilities/default.json`

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Main window permissions",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:window:allow-start-dragging",
    "core:window:allow-set-position",
    "core:window:allow-show",
    "core:window:allow-hide",
    "core:window:allow-outer-position",
    "core:window:allow-outer-size",
    "core:window:allow-scale-factor",
    "core:window:allow-available-monitors",
    "core:window:allow-primary-monitor",
    "store:default"
  ]
}
```

App-defined commands (`set_hit_rects`, `sync_tray`, `quit_app`) need no permission entries in Tauri 2.

### A.8 Icons

Write `app-icon.svg` (1024x1024: the wire path from §C scaled 4.5x, centred, on transparent background,
no eyes needed). Run `npx tauri icon app-icon.svg`. If the CLI rejects SVG, rasterize first on macOS:
`qlmanage -t -s 1024 -o . app-icon.svg && mv app-icon.svg.png app-icon.png && npx tauri icon app-icon.png`.
The tray uses `app.default_window_icon()`.

---

## B. File tree, responsibilities, public APIs

```
app-icon.svg  index.html  package.json  tsconfig.json  vite.config.ts
src/
  main.ts                bootstrap: wires everything (§B.1)
  styles.css             stage, balloon, menu styles
  art/parts.ts           SVG markup string (§C) + part ids
  art/renderer.ts        applies a Pose to the mounted SVG
  anim/pose.ts           Pose types, NEUTRAL, mergePose, lerpPose
  anim/easing.ts         easing functions
  anim/types.ts          Animation / Frame types
  anim/animations.ts     the catalogue (§D)
  anim/animator.ts       rAF interpolating player (§E.1)
  anim/animator.test.ts
  agent/agent.ts         action queue facade (§E.2)
  agent/agent.test.ts
  agent/scheduler.ts     idle scheduler (§E.3)
  agent/scheduler.test.ts
  ui/balloon.ts          speech balloon (§F)
  ui/contextMenu.ts      HTML right-click menu (§H)
  ui/interaction.ts      pointer: click / drag / dblclick / contextmenu (§H)
  ui/hitRects.ts         computes rects, pushes to Rust (§I)
  content/{greetings,quotes,jokes,tips}.json
  content/provider.ts    ContentProvider + LocalContentProvider (§G)
  content/content.test.ts
  util/rng.ts            seeded RNG (mulberry32) + randInt/randRange/pick
  util/shuffleBag.ts     no-repeat shuffle bag
  util/shuffleBag.test.ts
  platform/tauri.ts      thin wrappers over @tauri-apps/api (only file importing it, besides settings.ts)
  platform/settings.ts   store load/save, position restore+clamp (§J)
src-tauri/
  Cargo.toml build.rs tauri.conf.json capabilities/default.json icons/*
  src/main.rs            calls paperclip_lib::run()
  src/lib.rs             builder, plugins, setup, command registration
  src/tray.rs            tray menu + handles + sync_tray command
  src/clickthrough.rs    HitState, set_hit_rects command, polling thread
```

Rule: everything under `anim/`, `agent/`, `content/`, `util/` is pure TS with no Tauri or DOM imports
(DOM only in `art/` and `ui/`), so it is unit-testable in node.

### B.1 TypeScript APIs

```ts
// util/rng.ts
export type Rng = () => number;                       // [0,1)
export function mulberry32(seed: number): Rng;
export function randRange(rng: Rng, min: number, max: number): number;
export function pick<T>(rng: Rng, items: readonly T[]): T;

// util/shuffleBag.ts
export class ShuffleBag<T> {
  constructor(items: readonly T[], rng?: Rng);
  next(): T;        // throws if items empty
  get size(): number;
}

// anim/pose.ts  (full schema in §C.3)
export const NEUTRAL: Pose;
export type PosePatch = DeepPartial<Pose>;
export function mergePose(base: Pose, patch: PosePatch): Pose;      // returns a new object
export function lerpPose(a: Pose, b: Pose, t: number): Pose;        // recursive numeric lerp
export function poseEquals(a: Pose, b: Pose, eps?: number): boolean;

// anim/easing.ts
export type EaseName = 'linear' | 'inOut' | 'out' | 'in' | 'step';
export const EASE: Record<EaseName, (t: number) => number>;          // inOut = cubic in-out

// anim/types.ts  (§D)
// anim/animations.ts
export const ANIMATIONS: Record<AnimName, Animation>;
export const IDLE_ANIMS: AnimName[];        // ['IdleEyeRoll','IdleSideToSide','IdleHeadScratch','LookLeft','LookRight','LookUp','LookDown']
export const SHOWY_ANIMS: AnimName[];       // ['Wave','GetAttention','Congratulate','Thinking','Writing','Greeting']
export function isLooping(a: Animation): boolean;  // any frame branches to an index <= itself

// anim/animator.ts
export interface AnimatorDeps { render(p: Pose): void; now?(): number;
  raf?(cb: (t: number) => void): number; caf?(id: number): void; rng?: Rng; }
export type AnimEnd = 'completed' | 'exited' | 'replaced';
export class Animator {
  constructor(deps: AnimatorDeps);
  play(anim: Animation): Promise<AnimEnd>;   // starts from the currently displayed pose
  exit(): void;                              // request exit branching (no-op if idle)
  stop(): void;                              // halt immediately, keep current pose, resolve 'replaced'
  setPose(p: Pose): void;                    // immediate render, no loop
  readonly animating: boolean;
  readonly pose: Pose;
  step(now: number): void;                   // one tick; used by rAF callback and by tests
}

// agent/agent.ts
export interface BalloonLike { speak(text: string, attribution?: string): Promise<'done'|'closed'>;
  close(): void; readonly visible: boolean; }
export interface WindowCtl { show(): Promise<void>; hide(): Promise<void>; }
export type Action =
  | { type: 'play'; name: AnimName; timeoutMs?: number }
  | { type: 'speak'; text: string; attribution?: string }
  | { type: 'wait'; ms: number }
  | { type: 'show' } | { type: 'hide' };
export class Agent {
  constructor(deps: { animator: Animator; balloon: BalloonLike; win: WindowCtl;
                      animations?: Record<AnimName, Animation> });
  play(name: AnimName, timeoutMs?: number): Promise<void>;
  speak(text: string, attribution?: string): Promise<void>;
  wait(ms: number): Promise<void>;
  show(): Promise<void>;
  hide(): Promise<void>;
  interrupt(): void;         // clear queue, exit current anim, close balloon
  readonly busy: boolean;    // queue non-empty or action running
  readonly hidden: boolean;
  onIdle(cb: () => void): () => void;   // fires when queue drains
}

// agent/scheduler.ts  (§E.3)
export interface SchedulerConfig { blinkMinMs: number; blinkMaxMs: number; idleMinMs: number;
  idleMaxMs: number; talkMinMs: number; talkMaxMs: number; quiet: boolean; }
export const DEFAULT_SCHEDULER: SchedulerConfig;
export interface SchedulerHandlers { blink(): void; idleAnim(): void; talk(): void; isBusy(): boolean; }
export interface Timers { setTimeout(fn: () => void, ms: number): unknown; clearTimeout(id: unknown): void; }
export class IdleScheduler {
  constructor(cfg: SchedulerConfig, h: SchedulerHandlers, rng?: Rng, timers?: Timers);
  start(): void; stop(): void; readonly running: boolean;
  setConfig(patch: Partial<SchedulerConfig>): void;   // reschedules affected timers
  notifyActivity(): void;                              // user interacted: restart idle+talk timers
}

// content/provider.ts  (§G)
export type ContentKind = 'greeting' | 'quote' | 'joke' | 'tip';
export interface ContentItem { kind: ContentKind; text: string; attribution?: string }
export interface ContentProvider { next(kind: ContentKind, ctx?: { now?: Date }): Promise<ContentItem>; }
export class LocalContentProvider implements ContentProvider { constructor(rng?: Rng); }
export function periodOf(d: Date): 'morning'|'afternoon'|'evening'|'night';

// art/renderer.ts
export class Renderer { constructor(container: HTMLElement); render(p: Pose): void;
  characterRect(): DOMRect; /* neutral wire bbox in CSS px relative to #stage, padded 10px */ }

// ui/balloon.ts
export class Balloon implements BalloonLike { constructor(el: HTMLElement, onVisibility: (v: boolean) => void); }

// ui/contextMenu.ts
export interface MenuItem { id: string; label: string; checked?: boolean; separatorBefore?: boolean }
export class ContextMenu { constructor(el: HTMLElement, onPick: (id: string) => void,
  onVisibility: (v: boolean) => void); open(x: number, y: number, items: MenuItem[]): void;
  close(): void; readonly visible: boolean; }

// ui/interaction.ts
export interface InteractionHandlers { click(): void; doubleClick(): void;
  contextMenu(x: number, y: number): void; dragStart(): void; }
export function attachInteraction(target: HTMLElement, h: InteractionHandlers,
  startDragging: () => Promise<void>): () => void;

// ui/hitRects.ts
export interface Rect { x: number; y: number; w: number; h: number }
export class HitRects { constructor(push: (rects: Rect[]) => Promise<void>);
  set(key: 'character'|'balloon'|'menu', r: Rect | null): void;  // pushes (coalesced via microtask) on change
}

// platform/tauri.ts
export const win: WindowCtl & { startDragging(): Promise<void>;
  onMoved(cb: () => void): Promise<() => void> };
export function pushHitRects(rects: Rect[]): Promise<void>;          // invoke('set_hit_rects', { rects })
export function syncTray(visible: boolean, quiet: boolean): Promise<void>;
export function quitApp(): Promise<void>;
export function onTrayAction(cb: (a: { id: string; checked?: boolean }) => void): Promise<() => void>;

// platform/settings.ts  (§J)
export interface Settings { quiet: boolean; scheduler: Partial<SchedulerConfig>;
  position: { x: number; y: number } | null; }   // physical px, outer position
export function loadSettings(): Promise<Settings>;
export function saveSettings(patch: Partial<Settings>): Promise<void>;
export function restorePosition(saved: Settings['position']): Promise<void>;
export function trackPosition(): Promise<void>;  // onMoved -> debounce 500 ms -> save outerPosition
```

### B.2 Rust commands and modules

| Item | Signature | Behaviour |
|---|---|---|
| `clickthrough::set_hit_rects` | `#[tauri::command] fn set_hit_rects(state: State<'_, Arc<HitState>>, rects: Vec<HitRect>)` | replaces rects (CSS px, relative to window content) |
| `clickthrough::spawn_poller` | `pub fn spawn_poller(app: AppHandle)` | §I thread |
| `tray::build` | `pub fn build(app: &AppHandle) -> tauri::Result<()>` | builds tray, manages `TrayHandles` |
| `tray::sync_tray` | `#[tauri::command] fn sync_tray(state: State<'_, TrayHandles>, visible: bool, quiet: bool) -> Result<(), String>` | sets toggle label ("Hide Paperclip"/"Show Paperclip") and quiet check |
| `lib::quit_app` | `#[tauri::command] fn quit_app(app: AppHandle)` | `app.exit(0)` |
| event `tray-action` | payload `{ id: String, checked: Option<bool> }` | emitted for ids `toggle, hi, joke, quote, animate, quiet` |

`lib.rs::run()`:

```rust
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .manage(std::sync::Arc::new(clickthrough::HitState::default()))
        .invoke_handler(tauri::generate_handler![clickthrough::set_hit_rects, tray::sync_tray, quit_app])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory); // no Dock icon
            tray::build(app.handle())?;
            clickthrough::spawn_poller(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running paperclip");
}
```

---

## C. Original paperclip art (parametric SVG)

Original design, drawn from scratch: a three-turn gem clip with full semicircular (rounder) loops, a
-8 deg resting tilt, two-tone silver wire with a dark outline, a small teal highlight, big asymmetric eyes
sitting in front of the wire, and thick rounded floating brows. Do not trace or reference any Clippy sprite.

### C.1 Geometry (viewBox units; pivot for tilt/squash = bottom centre `(70,200)`)

- Wire: `M 60 140 L 60 62 A 12 12 0 0 1 84 62 L 84 176 A 22 22 0 0 1 40 176 L 40 50 A 30 30 0 0 1 100 50 L 100 150`
  (inner leg x=60, small top loop r=12, right leg x=84, bottom loop r=22, outer left leg x=40,
  big top loop r=30 peaking at y=20, outer right leg x=100 ending at y=150). All arcs sweep=1.
- Teal highlights: `M 36.5 72 L 36.5 118` and `M 47 27 A 32.5 32.5 0 0 1 58.9 19.5`.
- Eyes (whites): L `cx=57 cy=80 rx=11.5 ry=13.5`, R `cx=85 cy=78 rx=11.5 ry=13.5` (R is 2 px higher: asymmetry).
- Pupils: `r=5` at eye centre; glint `r=1.6` at (-1.8,-2) from pupil centre. Range: x ±4.5, y ±5.
- Brows: local paths, L `M -10 2 Q 0 -5 10 0` at `translate(57,58)`; R `M -10 0 Q 0 -5 10 2` at `translate(85,56)`.
- Shadow: ellipse `cx=70 cy=206 rx=30 ry=5`.

### C.2 `art/parts.ts` markup (insert verbatim into `#character`; ids are what the renderer grabs)

```html
<svg id="pc" viewBox="-20 -40 180 250" width="160" height="222" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="wireGrad" x1="0" y1="0" x2="1" y2="0.15">
      <stop offset="0" stop-color="#8e97a1"/><stop offset="0.35" stop-color="#eef1f4"/>
      <stop offset="0.6" stop-color="#c3c9d0"/><stop offset="1" stop-color="#7b848e"/>
    </linearGradient>
    <clipPath id="clipEyeL"><ellipse cx="57" cy="80" rx="11.5" ry="13.5"/></clipPath>
    <clipPath id="clipEyeR"><ellipse cx="85" cy="78" rx="11.5" ry="13.5"/></clipPath>
  </defs>
  <g id="root">
    <ellipse id="shadow" cx="70" cy="206" rx="30" ry="5" fill="rgba(0,0,0,0.18)"/>
    <g id="body">
      <path id="wireOutline" d="WIRE" fill="none" stroke="#4b535d" stroke-width="10.5"
            stroke-linecap="round" stroke-linejoin="round"/>
      <path id="wire" d="WIRE" fill="none" stroke="url(#wireGrad)" stroke-width="7.5"
            stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M 36.5 72 L 36.5 118" stroke="#3cc6c0" stroke-width="2.2" stroke-linecap="round" opacity="0.9"/>
      <path d="M 47 27 A 32.5 32.5 0 0 1 58.9 19.5" fill="none" stroke="#3cc6c0" stroke-width="2.2"
            stroke-linecap="round" opacity="0.9"/>
      <g id="eyes">
        <ellipse cx="57" cy="80" rx="11.5" ry="13.5" fill="#fff"/>
        <ellipse cx="85" cy="78" rx="11.5" ry="13.5" fill="#fff"/>
        <g id="pupilL"><circle cx="57" cy="80" r="5" fill="#1f2430"/><circle cx="55.2" cy="78" r="1.6" fill="#fff"/></g>
        <g id="pupilR"><circle cx="85" cy="78" r="5" fill="#1f2430"/><circle cx="83.2" cy="76" r="1.6" fill="#fff"/></g>
        <rect id="lidL" x="45" y="66" width="24" height="0" fill="#aab2bb" clip-path="url(#clipEyeL)"/>
        <rect id="lidR" x="73" y="64" width="24" height="0" fill="#aab2bb" clip-path="url(#clipEyeR)"/>
        <ellipse cx="57" cy="80" rx="11.5" ry="13.5" fill="none" stroke="#2b2f36" stroke-width="2"/>
        <ellipse cx="85" cy="78" rx="11.5" ry="13.5" fill="none" stroke="#2b2f36" stroke-width="2"/>
        <g id="browL"><path d="M -10 2 Q 0 -5 10 0" fill="none" stroke="#2b2f36" stroke-width="5.5" stroke-linecap="round"/></g>
        <g id="browR"><path d="M -10 0 Q 0 -5 10 2" fill="none" stroke="#2b2f36" stroke-width="5.5" stroke-linecap="round"/></g>
      </g>
      <g id="pencil"><g>
        <rect x="-3.5" y="-28" width="7" height="40" rx="1.5" fill="#f2c14e" stroke="#6b4e16" stroke-width="1.2"/>
        <rect x="-3.5" y="-32" width="7" height="6" rx="1.5" fill="#e98aa0"/>
        <path d="M -3.5 12 L 0 20 L 3.5 12 Z" fill="#f3dfb8" stroke="#6b4e16" stroke-width="1.2"/>
        <path d="M -1.2 17.3 L 0 20 L 1.2 17.3 Z" fill="#333"/></g></g>
      <g id="bulb"><g>
        <circle cy="-4" r="11" fill="#fff3a6" stroke="#c9a227" stroke-width="1.5"/>
        <path d="M -3 2 L -1 -4 L 1 2 L 3 -4" fill="none" stroke="#c9a227" stroke-width="1.2"/>
        <rect x="-5" y="6" width="10" height="7" rx="1.5" fill="#9aa3ad"/>
        <path d="M 0 -20 V -25 M 14 -14 L 18 -18 M -14 -14 L -18 -18 M 17 -4 H 22 M -17 -4 H -22"
              stroke="#e8b923" stroke-width="2" stroke-linecap="round"/></g></g>
      <g id="question"><g>
        <path d="M -6 -8 Q -6 -16 1 -16 Q 8 -16 8 -9 Q 8 -4 2 -1 Q 0 0 0 4" fill="none"
              stroke="#3cc6c0" stroke-width="4" stroke-linecap="round"/>
        <circle cy="10" r="2.4" fill="#3cc6c0"/></g></g>
      <g id="sparkles"><g>
        <path transform="translate(18 10)" d="M 0 -7 Q 1 -1 7 0 Q 1 1 0 7 Q -1 1 -7 0 Q -1 -1 0 -7 Z" fill="#ffd54a"/>
        <path transform="translate(118 4) scale(0.7)" d="M 0 -7 Q 1 -1 7 0 Q 1 1 0 7 Q -1 1 -7 0 Q -1 -1 0 -7 Z" fill="#ffd54a"/>
        <path transform="translate(124 60) scale(0.5)" d="M 0 -7 Q 1 -1 7 0 Q 1 1 0 7 Q -1 1 -7 0 Q -1 -1 0 -7 Z" fill="#ffd54a"/></g></g>
    </g>
  </g>
</svg>
```

`WIRE` = the wire path from C.1 (define once as a TS constant and interpolate). Prop anchors (base
position before pose offsets): pencil `(108,120)` rot `-30`; bulb `(70,-14)` rot 0; question `(114,22)`
rot 0; sparkles `(0,0)` rot 0 with rotation pivot `(70,40)`.

### C.3 Pose schema (`anim/pose.ts`)

```ts
export interface Xf { x: number; y: number; rot: number; sx: number; sy: number }
export interface PropState { v: number; x: number; y: number; rot: number } // v: visibility 0..1
export interface Pose {
  body: { x: number; y: number; tilt: number; squash: number; scale: number }; // tilt deg added to -8
  eyes: Xf;                                   // relative to eye-pair centre (71,79)
  pupils: { x: number; y: number };           // -1..1, mapped to ±4.5 / ±5 px
  lids: { l: number; r: number };             // 0 open .. 1 closed
  browL: { angle: number; lift: number };     // angle deg: >0 outer end UP (stern), <0 inner end up (worried)
  browR: { angle: number; lift: number };     // lift px: negative = raised
  props: { pencil: PropState; bulb: PropState; question: PropState; sparkles: PropState };
  opacity: number;                            // whole character 0..1
}
// NEUTRAL: all zeros except body.squash=1, body.scale=1, eyes.sx=1, eyes.sy=1, opacity=1.
```

### C.4 Renderer mapping (one `setAttribute('transform', …)` per part per frame; nothing else)

- `#root`: `opacity` style = `pose.opacity`.
- `#shadow`: `transform = translate(70 206) scale(${scale*(1/squash)} ${scale}) translate(-70 -206)`.
- `#body`: `translate(x y) translate(70 200) rotate(-8+tilt) scale(scale/squash, scale*squash) translate(-70 -200)`.
- `#eyes`: `translate(71+x 79+y) rotate(rot) scale(sx sy) translate(-71 -79)`.
- `#pupilL/#pupilR`: `translate(4.5*pupils.x, 5*pupils.y)`.
- `#lidL/#lidR`: set `height = 28*lids.l` (attribute, not transform).
- `#browL`: `translate(57 58+lift) rotate(angle)`; `#browR`: `translate(85 56+lift) rotate(-angle)`.
- Props: inner `<g>` gets `translate(ax+x ay+y) rotate(arot+rot) scale(0.6+0.4*v)`; outer gets
  `opacity=v` and `display=none` when `v < 0.01` (avoid painting hidden props). Sparkles instead use
  `translate(x y) translate(70 40) rotate(rot) scale(0.6+0.4*v) translate(-70 -40)`.
- `body.squash > 1` = taller/thinner, `< 1` = squat. Keep `body.x` within ±8 so the character stays
  inside its hit rect.
- Cache element refs at construction; skip writes whose string value is unchanged.

---

## D. Animation data format and catalogue

### D.1 Types (`anim/types.ts`)

```ts
export interface Branch { frameIndex: number; weight: number }        // weight in percent
export interface Frame {
  duration: number;            // ms; 0 = snap instantly
  pose?: PosePatch;            // patch over NEUTRAL (NOT cumulative). Omitted = hold previous target.
  ease?: EaseName;             // default 'inOut'
  branching?: { branches: Branch[] };
  exitBranch?: number;         // frame index to jump to when exit was requested
}
export interface Animation { frames: Frame[]; useExitBranching?: boolean }
export type AnimName = 'Show'|'Hide'|'Greeting'|'Wave'|'Blink'|'LookLeft'|'LookRight'|'LookUp'|
  'LookDown'|'Thinking'|'Writing'|'GetAttention'|'Explain'|'Congratulate'|'IdleEyeRoll'|
  'IdleSideToSide'|'IdleHeadScratch';
```

Semantics (structure inspired by clippy.js; data is ours):
- Each frame's resolved target = `mergePose(NEUTRAL, pose)` (or previous target if `pose` omitted).
  During the frame the animator renders `lerpPose(startPose, target, ease(elapsed/duration))`, where
  `startPose` is whatever was displayed when the frame began (so interruptions blend smoothly).
- At frame end choose the next index: (1) if exit requested and `exitBranch !== undefined` → `exitBranch`;
  (2) else if `branching`: roll `r = rng()*100`, walk branches accumulating weight, first with `r < acc`
  wins; if none wins → `index+1`; (3) else `index+1`. Index past the end → animation completes.
- Durations: motion frames 80–200 ms. "Hold" frames (pose omitted) may be 200–600 ms.
- Convention (tested): the final frame of every animation resolves to NEUTRAL (except `Hide`, which ends
  at `opacity 0, scale 0`). Looping animations (Thinking, Writing, Explain) loop via `branching` weight
  100 and must have `useExitBranching: true` and an `exitBranch` on every looping frame.

### D.2 `anim/animations.ts` (write exactly this data)

```ts
const P = (...ps: PosePatch[]): PosePatch => ps.reduce((a, b) => deepMerge(a, b), {}); // deepMerge in pose.ts
const f = (duration: number, pose?: PosePatch, extra: Partial<Frame> = {}): Frame => ({ duration, pose, ...extra });
const brows = (lift: number, angle = 0): PosePatch => ({ browL: { lift, angle }, browR: { lift, angle } });
const lids = (v: number): PosePatch => ({ lids: { l: v, r: v } });
const body = (b: Partial<Pose['body']>): PosePatch => ({ body: b });
const look = (x: number, y: number): PosePatch => ({ pupils: { x, y } });
const prop = (k: keyof Pose['props'], s: Partial<PropState>): PosePatch => ({ props: { [k]: { v: 1, ...s } } });
const loop = (to: number, exit: number) => ({ branching: { branches: [{ frameIndex: to, weight: 100 }] }, exitBranch: exit });

export const ANIMATIONS: Record<AnimName, Animation> = {
  Show: { frames: [
    f(0, P(body({ scale: 0, y: 20 }), { opacity: 0 })),
    f(160, P(body({ scale: 1.08, squash: 0.9 }))),
    f(120, body({ squash: 1.06, scale: 0.97 })),
    f(100, {}) ] },
  Hide: { frames: [
    f(100, body({ squash: 0.88 })),
    f(120, body({ squash: 1.12, y: -6 })),
    f(160, P(body({ scale: 0, y: 20 }), { opacity: 0 }), { ease: 'in' }) ] },
  Blink: { frames: [ f(80, lids(1), { ease: 'linear' }), f(40), f(90, {}, { ease: 'linear' }) ] },
  Greeting: { frames: [
    f(140, P(body({ tilt: 4, y: -4 }), brows(-6), { eyes: { sy: 1.08 } as Xf })),
    f(120, P(body({ tilt: -3, y: -8, squash: 1.05 }), brows(-8, -6), prop('sparkles', {}))),
    f(160, P(body({ tilt: -3, y: -8, squash: 1.05 }), brows(-8, -6), prop('sparkles', { rot: 15 }))),
    f(140, P(body({ tilt: 2 }), brows(-4), lids(0.35), prop('sparkles', { rot: 25 }))),
    f(300),
    f(200, {}) ] },
  Wave: { frames: [
    f(120, P(body({ tilt: 8, squash: 1.04 }), brows(-4))),
    f(120, P(body({ tilt: -6, squash: 0.97 }), brows(-4))),
    f(120, P(body({ tilt: 8, squash: 1.04 }), brows(-5))),
    f(120, P(body({ tilt: -6, squash: 0.97 }), brows(-4))),
    f(160, {}) ] },
  LookLeft:  { frames: [ f(120, P(look(-1, 0), { eyes: { x: -3 } as Xf }, body({ tilt: -3 }))), f(600), f(160, {}) ] },
  LookRight: { frames: [ f(120, P(look(1, 0),  { eyes: { x: 3 } as Xf },  body({ tilt: 3 }))),  f(600), f(160, {}) ] },
  LookUp:    { frames: [ f(120, P(look(0, -1), { eyes: { y: -3 } as Xf }, brows(-5))), f(600), f(160, {}) ] },
  LookDown:  { frames: [ f(120, P(look(0, 1),  { eyes: { y: 2 } as Xf },  brows(2), lids(0.25))), f(600), f(160, {}) ] },
  Thinking: { useExitBranching: true, frames: [
    f(160, P(look(0.6, -1), { browL: { angle: -8, lift: -5 }, browR: { angle: 8, lift: 1 } }, body({ tilt: -4 }), prop('question', {}))),
    f(200, P(look(0.6, -1), { browL: { angle: -8, lift: -5 }, browR: { angle: 8, lift: 1 } }, body({ tilt: -5 }), prop('question', { rot: -8 }))),
    f(200, P(look(0.6, -1), { browL: { angle: -8, lift: -5 }, browR: { angle: 8, lift: 1 } }, body({ tilt: -3 }), prop('question', { rot: 8 })), loop(1, 3)),
    f(120, P(brows(-7), { eyes: { sx: 1.1, sy: 1.1 } as Xf }, prop('bulb', {}))),   // "idea!"
    f(300),
    f(160, {}) ] },
  Writing: { useExitBranching: true, frames: [
    f(160, P(look(0.7, 0.8), lids(0.2), brows(2, 4), prop('pencil', {}))),
    f(120, P(look(0.7, 0.8), lids(0.2), brows(2, 4), body({ tilt: 2 }), prop('pencil', { x: -4, rot: -6 }))),
    f(120, P(look(0.8, 0.8), lids(0.2), brows(2, 4), body({ tilt: 4 }), prop('pencil', { x: 3, rot: 4 }))),
    f(120, P(look(0.7, 0.8), lids(0.2), brows(2, 4), body({ tilt: 3 }), prop('pencil', { x: -2, rot: -4 })), loop(1, 4)),
    f(160, {}) ] },
  GetAttention: { frames: [
    f(100, body({ squash: 0.85, y: 4 })),
    f(120, P(body({ squash: 1.15, y: -14 }), brows(-8), { eyes: { sx: 1.12, sy: 1.12 } as Xf })),
    f(100, P(body({ squash: 0.92 }), brows(-6))),
    f(120, P(body({ squash: 1.1, y: -10, tilt: 5 }), brows(-8))),
    f(100, P(body({ squash: 0.95, tilt: -4 }), brows(-4))),
    f(160, {}) ] },
  Explain: { useExitBranching: true, frames: [
    f(160, P(brows(-5, -4), look(-0.5, 0.3), body({ tilt: -3 }))),
    f(200, P({ browL: { lift: -3, angle: -4 }, browR: { lift: -6, angle: -4 } }, look(-0.3, 0.2), body({ tilt: 2 }))),
    f(200, P({ browL: { lift: -6, angle: -4 }, browR: { lift: -3, angle: -4 } }, look(-0.5, 0.3), body({ tilt: -2 })),
      { branching: { branches: [{ frameIndex: 1, weight: 70 }] }, exitBranch: 5 }),   // 30% → blink frames
    f(80, P(brows(-4, -4), lids(1), body({ tilt: -1 })), { ease: 'linear' }),
    f(90, P(brows(-4, -4), body({ tilt: -1 })), loop(1, 5)),
    f(160, {}) ] },
  Congratulate: { frames: [
    f(120, body({ squash: 0.88, y: 4 })),
    f(140, P(body({ squash: 1.12, y: -16, tilt: -6 }), lids(0.45), brows(-6), prop('sparkles', {}))),
    f(120, P(body({ squash: 0.95, tilt: 6 }), lids(0.45), brows(-6), prop('sparkles', { rot: 20 }))),
    f(140, P(body({ y: -8, tilt: -4 }), lids(0.45), brows(-6), prop('sparkles', { rot: 40 }))),
    f(200, P(lids(0.45), brows(-5), prop('sparkles', { rot: 60 }))),
    f(200, {}) ] },
  IdleEyeRoll: { frames: [
    f(140, P(look(-0.8, -0.6), { browL: { lift: -4, angle: 0 } })),
    f(140, P(look(0, -1), brows(-6))),
    f(140, P(look(0.8, -0.6), { browR: { lift: -4, angle: 0 } })),
    f(160, P(look(0.4, 0), lids(0.3), brows(1, 6))),
    f(400),
    f(180, {}) ] },
  IdleSideToSide: { frames: [
    f(160, P(body({ x: -6, tilt: -6 }), look(-0.6, 0))), f(200),
    f(200, P(body({ x: 6, tilt: 6 }), look(0.6, 0))),   f(200),
    f(180, {}) ] },
  IdleHeadScratch: { frames: [
    f(160, P(prop('pencil', { x: -4, y: -70, rot: -50 }), { browL: { angle: -6, lift: -3 }, browR: { angle: 6, lift: 0 } }, look(0.5, -0.7), body({ tilt: 3 }))),
    f(100, P(prop('pencil', { x: -4, y: -74, rot: -50 }), { browL: { angle: -6, lift: -3 }, browR: { angle: 6, lift: 0 } }, look(0.5, -0.7), body({ tilt: 3 }))),
    f(100, P(prop('pencil', { x: -4, y: -68, rot: -50 }), { browL: { angle: -6, lift: -3 }, browR: { angle: 6, lift: 0 } }, look(0.5, -0.7), body({ tilt: 3 }))),
    f(100, P(prop('pencil', { x: -4, y: -74, rot: -50 }), { browL: { angle: -6, lift: -3 }, browR: { angle: 6, lift: 0 } }, look(0.5, -0.7), body({ tilt: 3 }))),
    f(100, P(prop('pencil', { x: -4, y: -68, rot: -50 }), { browL: { angle: -6, lift: -3 }, browR: { angle: 6, lift: 0 } }, look(0.5, -0.7), body({ tilt: 3 }))),
    f(180, {}) ] },
};
```

Notes: `{ eyes: { sy: 1.08 } as Xf }` is shorthand — type `PosePatch` as `DeepPartial<Pose>` so the casts
are unnecessary; drop them if TS accepts. Factor repeated sub-patches into local consts if preferred.
A prop that is not mentioned in a frame's patch resolves to `v: 0`, so props fade out automatically.

---

## E. Engine

### E.1 Animator (`anim/animator.ts`)

- Defaults: `now = () => performance.now()`, `raf = requestAnimationFrame`, `caf = cancelAnimationFrame`, `rng = Math.random`.
- State: `anim | null`, `frameIndex`, `frameStart`, `startPose`, `target`, `exiting`, `rafId | null`, `resolve`.
- `play(anim)`: if one is running, resolve it with `'replaced'`; set `startPose = this.pose`, frame 0,
  `exiting=false`, schedule rAF if not scheduled. Returns a Promise resolved on end.
- `step(now)`: `t = duration===0 ? 1 : min(1,(now-frameStart)/duration)`; render
  `lerpPose(startPose, target, EASE[ease](t))`; if `t>=1`, pick next index (§D.1) — possibly advancing
  several zero-duration frames in one step; on completion render final target, set `anim=null`,
  **do not request another rAF**, resolve `'completed'` (or `'exited'` if exit had been requested).
  Otherwise request the next rAF. Only one rAF id may be outstanding at a time.
- `exit()`: `exiting = true`. If the animation has no `useExitBranching`, exit has no effect on path (it just plays out).
- Expose `globalThis.__pcDebug = { rafActive: () => this.rafId !== null }` in dev builds for §K checks.

### E.2 Agent action queue (`agent/agent.ts`)

- Internal FIFO of `{ action, resolve }`; a single async `pump()` runs actions sequentially.
- `play`: `animator.play(anim)`. If `isLooping(anim)`, set a timer `timeoutMs ?? 3000` that calls `animator.exit()`.
- `speak`: start `animator.play(Explain)` (do not await), `await balloon.speak(text, attribution)`,
  then `animator.exit()` and await the Explain promise. Balloon handles its own hold/auto-hide.
- `wait`: setTimeout. `show`: `await win.show()` then play `Show`. `hide`: play `Hide`, then `await win.hide()`; sets `hidden`.
- Actions other than `show` are dropped (resolved immediately) while `hidden`.
- `interrupt()`: resolve and drop all queued actions, `animator.exit()`, `balloon.close()`. User-initiated
  commands in `main.ts` call `agent.interrupt()` first, then enqueue (so a click during a long idle
  anim feels immediate: looping anims leave via exitBranch, others finish their remaining short frames).
- `onIdle` listeners fire when the queue drains and nothing is running.

### E.3 Idle scheduler (`agent/scheduler.ts`)

`DEFAULT_SCHEDULER = { blinkMinMs: 3000, blinkMaxMs: 7000, idleMinMs: 8000, idleMaxMs: 20000,
talkMinMs: 120000, talkMaxMs: 300000, quiet: false }`.

- Three independent timers (blink, idle, talk), each re-armed with `randRange(min,max)` after firing.
- On fire: if `h.isBusy()` → re-arm that timer with a short retry (blink 1000 ms, idle 3000 ms, talk 10000 ms) and skip.
- Quiet mode: talk timer not armed; idle interval multiplied by 2. Blinks continue.
- `notifyActivity()`: re-arm idle and talk timers from now (blink untouched).
- `stop()` clears all timers (called when hidden). `start()` is idempotent.
- `main.ts` handlers: `blink → agent.play('Blink')`; `idleAnim → agent.play(pick(IDLE_ANIMS))`;
  `talk → speakRandom(pick(['quote','joke','tip'], weighted 40/40/20))`.
- All waits are timers; nothing renders between animations → CPU ~0.

## F. Speech balloon (`ui/balloon.ts`, styles in `styles.css`)

- Layout: `#balloon { position:absolute; right:20px; bottom:212px; max-width:250px; min-width:120px;
  max-height:118px; padding:10px 12px; background:#fff8c4; border:1.5px solid #3a3a3a; border-radius:10px;
  font-size:13px; line-height:1.35; color:#222; box-shadow:none; }`. Tail: `::after` 14px triangle at
  bottom-right (`right:46px; bottom:-14px`) pointing down at the clip's head; `::before` for the border.
- Character container `#character { position:absolute; right:12px; bottom:4px; width:160px; height:222px; }`.
- `speak(text, attribution)`: show, then typewriter: reveal one character every 22 ms (setTimeout chain;
  whitespace revealed in the same tick as the following char). Attribution rendered after text as
  `<div class="attr">— Name</div>` (italic, 11px) once typing completes. Use `textContent`, never `innerHTML`.
- Hold after typing: `clamp(1500 + 60 * text.length, 3000, 12000)` ms, then fade out (150 ms CSS opacity) and resolve `'done'`.
- Click on balloon: if still typing → finish instantly; if typed → close and resolve `'closed'`.
- `onVisibility(v)` callback used by `main.ts` to update the balloon hit rect (`el.getBoundingClientRect()`
  after layout, via `requestAnimationFrame` once).
- Content must fit: max 180 chars per item (enforced by tests), so no scrolling is needed.

## G. Content (`src/content/*.json`, `content/provider.ts`)

Builder writes original text (quotes excepted, which are real, well-attested short quotes; no song lyrics;
no quotes of uncertain attribution). All items ≤ 180 chars, family-friendly, no politics/religion.

| File | Shape | Count |
|---|---|---|
| `greetings.json` | `[{ "period": "morning"|"afternoon"|"evening"|"night", "text": "..." }]` | 15: 4 morning, 4 afternoon, 4 evening, 3 night |
| `quotes.json` | `[{ "text": "...", "author": "..." }]` | 40, distinct authors ≥ 25 |
| `jokes.json` | `[{ "text": "..." }]` (setup + punchline in one string) | 40 clean, short, puns welcome |
| `tips.json` | `[{ "text": "It looks like you're …" }]` | 20, each starts with "It looks like you're"; playful offers of (fake) help. Do not use "writing a letter". |

- `periodOf(d)`: hours 5–11 morning, 12–16 afternoon, 17–21 evening, otherwise night.
- `LocalContentProvider`: one `ShuffleBag` per kind (greetings: one bag per period). `next('quote')`
  returns `{ kind, text, attribution: author }`. Returns a resolved Promise (async signature is the seam).
- **ShuffleBag**: Fisher–Yates over a copy using `rng`; when exhausted, reshuffle; if `size > 1` and the
  first item of the new cycle equals the last item returned, swap it with a random other position.
  Guarantees: no item repeats within a cycle, no back-to-back repeat across cycles.
- Future seam: a `ClaudeContentProvider` would implement the same interface; `main.ts` takes a
  `ContentProvider` instance and never imports JSON directly. No network code in v1 (CSP blocks it anyway).

## H. Interaction (`ui/interaction.ts`, `ui/contextMenu.ts`, tray)

Pointer on `#character svg` (the hit area is the svg element; transparent pixels outside the rect are
click-through via §I):
- `mousedown` (button 0): record `(x,y)`, `armed=true`. `mousemove` while armed: if distance > 4 px →
  `armed=false`, `h.dragStart()`, `await startDragging()` (OS takes over; `mouseup` may never arrive, so
  reset state on the next `mousedown` and on `blur`).
- `mouseup` while armed (no drag) → single-click candidate: start a 250 ms timer → `h.click()`.
  `dblclick` cancels that timer → `h.doubleClick()`.
- `contextmenu`: `preventDefault()` → `h.contextMenu(e.clientX, e.clientY)`.
- `main.ts` handlers (each calls `agent.interrupt()` + `scheduler.notifyActivity()` first):
  - click → random reaction from `['GetAttention','Wave','IdleEyeRoll','LookUp','Congratulate']`; 30% chance
    to follow with a short quip from a small inline list (`"Hey!"`, `"That tickles."`, `"Need something?"`, `"Boing!"`).
  - doubleClick → `play('Thinking', 900)` then speak a joke.
  - dragStart → `balloon.close()`, `menu.close()`.
- **Context menu** (HTML, inside the window): absolutely positioned, width 180px, item height 26px,
  clamped inside 320x340; closes on outside mousedown, Escape, or pick. Items:
  `Say hi`, `Tell a joke`, `Give a quote`, `Give me a tip`, `Animate!`, ─, `Quiet mode` (✓ when on), ─,
  `Hide`, `Quit`. Ids: `hi, joke, quote, tip, animate, quiet, hide, quit`. Its rect is pushed as hit rect `menu`.
- **Tray** (`src-tauri/src/tray.rs`): items `toggle` ("Hide Paperclip"/"Show Paperclip"), ─, `hi` "Say hi",
  `joke` "Tell a joke", `quote` "Give a quote", `animate` "Animate!", ─, `quiet` CheckMenuItem "Quiet mode",
  `autostart` CheckMenuItem "Launch at login" (initial = `app.autolaunch().is_enabled().unwrap_or(false)`), ─, `quit` "Quit".
  `TrayIconBuilder::with_id("main").icon(app.default_window_icon().unwrap().clone()).tooltip("Paperclip")
  .menu(&menu).show_menu_on_left_click(true)` (older 2.x: `menu_on_left_click(true)`).
  `on_menu_event`: `autostart` → enable/disable via `tauri_plugin_autostart::ManagerExt`, on error revert the
  check; `quit` → `app.exit(0)` directly (position is already saved on every move); every other id → `app.emit("tray-action", TrayAction { id, checked })` where `checked` is
  `Some(quiet.is_checked()?)` for `quiet`. Store `MenuItem<Wry>` (toggle) and `CheckMenuItem<Wry>` (quiet) in
  `app.manage(TrayHandles { .. })` for `sync_tray`.
- Shared action dispatcher in `main.ts`: `runCommand(id)` used by both menus:
  `hi` → Greeting + greeting text; `joke`/`quote`/`tip` → speak; `animate` → `play(pick(SHOWY_ANIMS))`;
  `quiet` → toggle, persist, `scheduler.setConfig({quiet})`, `syncTray`; `hide`/`toggle` → `agent.hide()`
  or `agent.show()`, `scheduler.stop()/start()`, `syncTray`; `quit` → `quitApp()`.

---

## I. Click-through (`src-tauri/src/clickthrough.rs`, `ui/hitRects.ts`)

Frontend: `HitRects` holds up to three rects in CSS px relative to the window content: `character`
(= `renderer.characterRect()`, the neutral wire bbox + props margin, padded 10 px; computed once after
mount and on scale change), `balloon` (when visible), `menu` (when open). On any change it calls
`invoke('set_hit_rects', { rects })` once per microtask.

Rust:

```rust
#[derive(Clone, Copy, Debug, serde::Deserialize)]
pub struct HitRect { pub x: f64, pub y: f64, pub w: f64, pub h: f64 }

#[derive(Default)]
pub struct HitState { pub rects: std::sync::Mutex<Vec<HitRect>> }

#[tauri::command]
pub fn set_hit_rects(state: tauri::State<'_, std::sync::Arc<HitState>>, rects: Vec<HitRect>) {
    *state.rects.lock().unwrap() = rects;
}

pub fn spawn_poller(app: tauri::AppHandle) {
    let state = app.state::<std::sync::Arc<HitState>>().inner().clone();
    std::thread::spawn(move || {
        let mut ignoring: Option<bool> = None;
        loop {
            let mut sleep_ms = 100;
            if let Some(win) = app.get_webview_window("main") {
                match sample(&app, &win, &state) {
                    Ok(Some((inside, near))) => {
                        let want = !inside;
                        if ignoring != Some(want) && win.set_ignore_cursor_events(want).is_ok() {
                            ignoring = Some(want);
                        }
                        if near { sleep_ms = 33; }            // ~30 Hz near the window, 10 Hz far away
                    }
                    Ok(None) => sleep_ms = 250,               // hidden
                    Err(_) => {                               // cursor position unsupported (e.g. Wayland)
                        if ignoring != Some(false) { let _ = win.set_ignore_cursor_events(false); ignoring = Some(false); }
                        sleep_ms = 1000;
                    }
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(sleep_ms));
        }
    });
}
```

`sample()` → `tauri::Result<Option<(bool, bool)>>`: return `None` if `!win.is_visible()?`; otherwise
`cursor = app.cursor_position()?` (global physical px), `pos = win.inner_position()?`, `size = win.inner_size()?`,
`scale = win.scale_factor()?`; local CSS px `lx = (cursor.x - pos.x as f64)/scale`, `ly` likewise;
`inside` = any rect contains `(lx,ly)`; `near` = cursor within 150 physical px of the window rect.
Only call `set_ignore_cursor_events` when the desired state changes. Window getters are safe from a
background thread (Tauri dispatches to the main thread); never hold the rects lock across them.

Platform caveats (document in a code comment):
- **macOS**: works with `macOSPrivateApi`; while ignoring, the webview receives no mouse events (hence the Rust
  poller). `acceptFirstMouse` lets the first click on the unfocused window register.
- **Windows**: works; coordinates are physical; verify on a 150% display (scale factor path).
- **Linux X11**: works. **Wayland**: global cursor position is unavailable → `Err` path keeps the whole
  window interactive (transparent area blocks clicks; acceptable degradation). Transparency also depends on
  the compositor. Users can run with `GDK_BACKEND=x11` for full behaviour.
- Dragging: cursor stays over the character during `startDragging`, so no special case.

## J. Persistence (`platform/settings.ts`)

- `load('settings.json', { defaults: {}, autoSave: 300 })` from `@tauri-apps/plugin-store` (if the installed
  version has no `defaults` option, omit it). Keys: `quiet: boolean`, `scheduler: Partial<SchedulerConfig>`,
  `position: {x,y} | null` (physical outer position).
- `trackPosition()`: `getCurrentWindow().onMoved` → debounce 500 ms → save `outerPosition()`.
- `restorePosition(saved)` (before first `show()`):
  1. `monitors = await availableMonitors()`, `size = await win.outerSize()`.
  2. If `saved` and some monitor rect (use `workArea` when present, else `position/size`) overlaps the
     window rect at `saved` by ≥ 80x80 physical px → clamp `saved` fully inside that monitor and `setPosition(new PhysicalPosition(x,y))`.
  3. Else default: primary monitor (fallback `monitors[0]`) bottom-right:
     `x = m.x + m.w - size.width - 24*sf`, `y = m.y + m.h - size.height - 64*sf`.
- Startup order in `main.ts`: load settings → mount renderer (pose = Show frame 0, invisible) → restore
  position → `agent.show()` → Greeting + time-of-day greeting → `scheduler.start()` → `syncTray(true, quiet)`.

## K. Budgets and measurement

Targets (release build, after 60 s idle with no balloon): **RSS < 60 MB** total (app + its webview
processes), **CPU ≈ 0%** (< 0.5% averaged over 30 s), rAF inactive between animations, bundle < 15 MB.

Rules that keep it there: no rAF while idle; no CSS animations/transitions running at idle (balloon fade
only while visible); no `filter`/`backdrop-filter`/SVG filters; hidden props `display:none`; poller at
10 Hz when the cursor is far; no timers faster than the typewriter (22 ms, only while typing).

How to measure (macOS):
```sh
npm run tauri build                       # release
open src-tauri/target/release/bundle/macos/Paperclip.app
sleep 60
APP=$(pgrep -x paperclip); echo "app pid $APP"
ps -o pid,rss,%cpu,comm -p $APP
ps -axo pid,ppid,rss,%cpu,comm | grep -i 'WebKit' # WebContent/Networking/GPU children of the app
top -l 6 -s 5 -stats pid,command,cpu,mem | grep -Ei 'paperclip|WebKit'
```
Sum RSS of the app + its `com.apple.WebKit.*` processes (check `ppid`/launch time to pick ours). Also check
`footprint $APP` if available. Windows: Task Manager → Details, sum `paperclip.exe` + its
`msedgewebview2.exe` children (Memory: private working set). Linux: `ps -o rss` for `paperclip` +
`WebKitWebProcess`. rAF check: in a debug build open devtools (right-click is overridden, so use
`Cmd+Opt+I`), run `__pcDebug.rafActive()` while idle → `false`; Performance panel shows no frames at idle.
Record results in `docs/superpowers/plans/measurements.md` (task M-30).

---

## L. Tests and quality gates

Vitest (node env, no DOM, deterministic: `mulberry32(42)`, fake `now`/`raf`):
- `util/shuffleBag.test.ts`: every item appears exactly once per cycle (run 10 cycles of 7 items); no
  back-to-back repeat across 1000 draws; size-1 bag always returns the item; empty bag throws.
- `anim/animator.test.ts` (fake raf collects callbacks; test drives `step(now)`):
  - interpolation: halfway through a 100 ms linear frame from NEUTRAL to `{body:{tilt:10}}` renders tilt 5.
  - zero-duration frame snaps; completion resolves `'completed'` and leaves no pending rAF (`rafActive` false).
  - branching: with a stubbed rng returning 0.1, a frame with `[{frameIndex:0, weight:20}]` jumps to 0; with 0.5 goes to `index+1`.
  - exit: playing `Thinking`, stepping 2 s (still looping), then `exit()` → reaches the last frame and resolves `'exited'`.
  - `play()` while playing resolves the first promise with `'replaced'` and starts from the displayed pose (no jump).
- `anim/animations` checks (in animator.test.ts): all 17 names exist; every frame duration is 0 or 40–600;
  every `branching.frameIndex` / `exitBranch` is in range; looping anims have `useExitBranching`; final
  frame resolves to NEUTRAL (`poseEquals`) for all except `Hide`; every anim completes within 3 s when
  `exit()` is called at t=0 (simulate with fake clock).
- `agent/scheduler.test.ts` (`vi.useFakeTimers()`, timers = global fake): blink fires within 3–7 s, idle
  within 8–20 s, talk within 120–300 s; busy → retry after 1 s (blink); quiet → talk never fires in 30 min
  and idle uses doubled range; `stop()` → no handler calls afterwards; `notifyActivity()` postpones idle.
- `agent/agent.test.ts` (fake animator/balloon/win): actions run in order; `interrupt()` resolves queued
  actions and calls `exit()` + `close()`; actions ignored while hidden except `show`.
- `content/content.test.ts`: counts exactly 15/40/40/20 with period split 4/4/4/3; all texts non-empty,
  ≤ 180 chars, unique; tips start with "It looks like you're"; quotes have non-empty `author`;
  `periodOf` boundaries (4:59 night, 5:00 morning, 11:59 morning, 12:00 afternoon, 17:00 evening, 22:00 night).

Gates (all must pass at the end): `npm test`, `npm run typecheck`, `npm run lint:rs` (clippy `-D warnings`),
`npm run tauri build -- --debug` succeeds and produces `src-tauri/target/debug/bundle/macos/Paperclip.app`.

---

## M. Ordered task list

Each task: do it, then run its check. Don't start the next task with a failing check.

**Scaffold**
1. Write `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, minimal `src/main.ts`
   (`console.log('ok')`) and `src/styles.css` (§A). `npm install`. Add `.gitignore` (`node_modules`, `dist`,
   `src-tauri/target`, `src-tauri/gen`). — Check: `npm run build` creates `dist/index.html`.
2. Write `src-tauri/` files: `Cargo.toml`, `build.rs`, `tauri.conf.json`, `capabilities/default.json`,
   `src/main.rs`, `src/lib.rs` (plugins + `quit_app` only, no tray/poller yet). — Check: `cargo check --manifest-path src-tauri/Cargo.toml` passes (create a placeholder `icons/` first via task 3 if tauri-build complains).
3. Write `app-icon.svg`, generate icons (§A.8). — Check: `src-tauri/icons/icon.icns` and `icon.ico` exist.
4. `npm run tauri dev` once. — Check: app launches with no visible window chrome and no errors in the terminal (window may be invisible: `visible:false`; temporarily call `getCurrentWindow().show()` in main.ts to see a transparent window, then keep it — task 22 replaces it).

**Pure core (TDD: write the test first, then the module)**
5. `util/rng.ts`. — Check: `mulberry32(42)` yields identical sequences across calls (tiny test).
6. `util/shuffleBag.ts` + tests (§L). — Check: `npm test` green.
7. `anim/pose.ts` (types, NEUTRAL, deepMerge, mergePose, lerpPose, poseEquals) + `anim/easing.ts`. — Check: unit test that `lerpPose(NEUTRAL, X, 0)` equals NEUTRAL and `…,1)` equals X.
8. `anim/types.ts` + `anim/animations.ts` (§D.2) + catalogue tests. — Check: catalogue tests green.
9. `anim/animator.ts` + tests. — Check: animator tests green.
10. `agent/scheduler.ts` + tests. — Check: green.
11. `agent/agent.ts` + tests. — Check: green.
12. Content JSON files (§G) + `content/provider.ts` + tests. — Check: content tests green; read through the jokes/quotes once for tone and correctness of attributions.

**Art and UI**
13. `art/parts.ts` (§C.2) and `art/renderer.ts` (§C.4). Temporarily render NEUTRAL in `main.ts`. — Check: in `npm run tauri dev` the silver paperclip with eyes, brows and teal highlight is visible, tilted slightly left, nothing clipped; take a screenshot.
14. Dev-only pose sandbox: when `import.meta.env.DEV` and URL has `?sandbox`, play every animation in turn in a browser tab (`npm run dev`, open `http://localhost:1420/?sandbox`). — Check: all 17 animations play, end neutral (Hide ends invisible), no props stuck visible.
15. `ui/balloon.ts` + CSS (§F). — Check: in sandbox, a 180-char string fits without scrolling; typewriter, click-to-finish, click-to-close, auto-hide all work.
16. Wire `Agent` + `Animator` + `Balloon` in `main.ts`; `speak` plays Explain. — Check: on launch it shows, greets and the Explain loop exits when the text finishes.
17. `ui/interaction.ts` (§H): click / dblclick / drag via `startDragging`. — Check: drag moves the window without triggering a click reaction; click → reaction after ~250 ms; double-click → joke only (no click reaction).
18. `ui/contextMenu.ts` + `runCommand` dispatcher. — Check: right-click opens menu clamped inside the window; each item works; Escape/outside click closes.

**Native**
19. `tray.rs` + `sync_tray` + `tray-action` listener in `platform/tauri.ts`. — Check: tray icon appears; every item works; Show/Hide label flips; Quiet check stays in sync with the context menu.
20. Autostart toggle. — Check (macOS): toggling on creates `~/Library/LaunchAgents/Paperclip.plist` (name may vary); toggling off removes it.
21. `clickthrough.rs` + `ui/hitRects.ts` (§I). — Check: clicking a transparent part of the window (e.g. top-left corner when no balloon) reaches the app underneath; character, balloon and menu stay clickable; temporarily log state flips and confirm they happen only at rect edges.
22. `platform/settings.ts` (§J) + startup order. — Check: move the window, quit, relaunch → same place; edit the store file to `{x: 99999, y: 99999}` → relaunch lands bottom-right of the primary monitor. Store file: `~/Library/Application Support/app.paperclip.desktop/settings.json`.
23. Scheduler wired (blink/idle/talk; quiet persists; stop when hidden). — Check: temporarily set `talkMinMs/MaxMs` to 15–20 s via store and observe speech; quiet mode suppresses it; hidden window → no activity.
24. macOS Accessory activation policy, `focus:false`. — Check: no Dock icon; launching does not steal focus from the frontmost app.

**Hardening and gates**
25. Error handling: every `invoke`/store call wrapped so failures log via `console.warn` and never break the agent; Rust code has no `unwrap()` except the rects mutex. — Check: `npm run typecheck` clean.
26. `npm run lint:rs` and fix all warnings. — Check: exit code 0.
27. `npm test`. — Check: all green.
28. `npm run tauri build -- --debug`. — Check: succeeds; open the produced `.app`; greeting plays.
29. Release build `npm run tauri build`. — Check: succeeds; bundle in `src-tauri/target/release/bundle/`.
30. Measure per §K; write numbers (RSS app+webview, CPU idle, rAF idle) to `docs/superpowers/plans/measurements.md`. — Check: RSS < 60 MB and idle CPU < 0.5%, or a short note of what exceeds and why.
31. Cross-platform notes: add a short `README.md` section listing the Wayland/X11 caveat (§I) and that Windows/Linux builds must be built on those OSes. — Check: file exists.

### Definition of done
All §L gates pass; behaviour in §E–§J verified by the task checks; art is the original design in §C;
idle CPU ~0 with no rAF running; position and settings survive restart.
