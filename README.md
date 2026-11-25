# Paperclip

Tauri 2 desktop assistant (original SVG paperclip). `npm install`, `npm test`, `npm run tauri dev`, `npm run tauri build`.

## Platform notes
- Click-through uses a global cursor poll. Linux/Wayland has no global cursor position, so the whole window stays
  interactive there (transparent area blocks clicks); run with `GDK_BACKEND=x11` for full behaviour.
- Windows/Linux bundles must be built on those OSes (not tested here).
