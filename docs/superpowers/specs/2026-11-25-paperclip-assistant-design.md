# Paperclip Desktop Assistant — Design

## Intent
A cross-platform (macOS, Windows, Linux) desktop pet in the spirit of the 90s Office
assistant: a paperclip that floats on the desktop, animates like the original
(greeting, blinking, looking around, idle fidgets, get-attention, thinking, goodbye),
says hi, offers random quotes and jokes in a yellow speech bubble.

## Goals
- Transparent, borderless, always-on-top, draggable window — only the character and bubble visible.
- Fast, smooth animation with a tiny footprint (target < 60 MB RSS idle, ~0% CPU when idle between animations).
- Behaves like the original: greets on launch, random idle animations, periodically pipes
  up with a quote/joke/tip, reacts to click / double-click / drag, right-click menu, tray icon.
- Works fully offline.

## Non-goals
- No AI chat in v1 (leave a clean seam for an optional Claude-powered content source later).
- No Office integration, no app-store distribution.

## Anti-goals
- Must NOT copy Microsoft's Clippy artwork. clippy.js is used only as a reference for
  the animation *catalogue, frame timing and branching behaviour*. The character art is original:
  our own paperclip drawing (different wire proportions, eye/brow design, colour accents).
- Must not be a resource hog (no constant render loop at idle).
- Must not steal clicks from apps underneath (transparent areas click-through).

## Constraints
- Tauri 2 (Rust core + system webview). Frontend: plain TypeScript + Vite, no heavy framework.
- Art: original vector paperclip, animated from parametric poses (SVG parts with transforms)
  or rendered into a single sprite atlas at build time. Either way: one draw per frame, rAF only
  while an animation plays.
- Animation data format modeled on clippy.js-style structure: named animations → frames
  (duration, pose/frame ref, optional sound, branching with weights, exitBranch).
- Content (greetings, quotes, jokes, tips) in local JSON.
- macOS transparency requires `macOSPrivateApi: true` (fine — not shipping via Mac App Store).

## Approaches considered
1. **Electron** — easy, but ~150 MB RAM and ~100 MB bundle. Rejected: too heavy.
2. **GPUI (Rust)** — light, but immature transparent/borderless window support off macOS, sparse docs. Rejected: risk.
3. **Pure Rust (winit + tiny-skia/wgpu)** — lightest, but text/bubble/menus by hand. Rejected: effort.
4. **Tauri 2** — Rust core, OS webview, 30–60 MB RAM, transparent windows on all three. **Chosen by user.**

## Left to the architect/builder
- Exact pose system vs. pre-rendered atlas, module layout, click-through strategy
  (`set_ignore_cursor_events` toggled by hit-testing), persistence of position/settings,
  scheduling of idle behaviour, tray/menu contents.
