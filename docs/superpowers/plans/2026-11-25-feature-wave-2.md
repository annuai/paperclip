# Paperclip feature wave 2: architecture

This plan covers ten features. They are built in five phases, one after another, because they share `main.ts`, `tray.rs`, `contextMenu.ts` and settings.

## Ground rules for every phase

- **Read first.** Read `PRODUCT.md`, `DESIGN.md`, `src/main.ts`, `src-tauri/src/lib.rs`, `src-tauri/src/tray.rs`, `src/ui/contextMenu.ts`, `src/platform/settingsParse.ts` and `src/anim/animations.ts`.
- **Menus.** Every new menu item goes in BOTH the right-click menu (`contextMenu.ts`) and the tray menu (`tray.rs`, via `sync_tray`). Follow the existing pattern.
- **Settings.** New settings go through `settingsParse.ts`, with defaults and parse tests, and through the key list in `settings.ts`.
- **Logic and tests.** Behaviour lives in small pure modules under `src/agent/` with Vitest tests, like `hydration.ts`. `main.ts` only wires things up.
- **Animations.** New animations go in `animations.ts` and must return to `NEUTRAL`. Then update the count in `animator.test.ts` and check the result in the sandbox (`?sandbox&compare`).
- **Art.** Every new prop needs both a Classic version and a Flat version. Flat follows `DESIGN.md`: the palette tokens, no gradients, no outlines.
- **Content.** Lines go in JSON under `src/content/`, with variety and his voice: warm, a little dorky, "It looks like you're…".
- **Rust.**
  - Keep the poll threads cheap: 5 s or slower, never busy loops.
  - Platform code goes under `#[cfg]`.
  - Unsupported platforms return `None` or `false`. They must never panic.
  - `npm run lint:rs` (`cargo clippy -D warnings`) must pass.
- **Idle CPU must not get worse.** No new always-running rAF loops and no polling faster than 1 s in JS.
- **Gate for every phase.** `npm test`, `npm run typecheck` and `npm run lint:rs` all pass, then `npm run tauri build -- --debug --bundles app` succeeds.
- **No commits.** The lead reviews the work and commits it.

## Phase 1: presence (system awareness)

**Rust, `src-tauri/src/system.rs`.**
- One thread samples every 5 s and emits a `system` event only when something changes. Battery and CPU changes count once they pass a threshold, for example 5 percentage points. The snapshot has these fields:
  - `fullscreen: bool`: another app is full screen or presenting on Paperclip's display.
  - `batteryPct: Option<u8>`
  - `charging: Option<bool>`
  - `cpuPct: f32`: system-wide, smoothed.
  - `audioPlaying: bool`
  - `idleSecs: u32`: seconds since the last keyboard or mouse input. It is used in phase 2.
- **macOS.**
  - Full screen: use `CGWindowListCopyWindowInfo(onScreenOnly)`. If a layer-0 window owned by another pid has bounds equal to its display's bounds, that counts as full screen.
  - Idle: `CGEventSourceSecondsSinceLastEventType(combinedSessionState, kCGAnyInputEventType)`.
  - Audio: parse `pmset -g assertions` for a coreaudiod "audio-out" or "PreventUserIdleSystemSleep" assertion. This needs no permission prompt. Run it only every 15 s.
  - Battery: `pmset -g batt`, or IOKit.
- **Windows.**
  - Full screen: `SHQueryUserNotificationState`, where `QUNS_PRESENTATION_MODE`, `QUNS_RUNNING_D3D_FULL_SCREEN` and `QUNS_BUSY` count as true.
  - Idle: `GetLastInputInfo`.
  - Battery: `GetSystemPowerStatus`.
  - Audio: `false`, unless the media-control API is cheap to add.
- **Linux.** Battery from `/sys/class/power_supply`, CPU from `/proc/stat`. Full screen, audio and idle are best effort.
- **CPU.** Use `sysinfo` with only the CPU refresh, or read the OS counters directly.

**Frontend, `src/agent/presence.ts`.** A pure function or class takes snapshots plus the current state and returns reactions:
- **Hide while presenting.** When `fullscreen` becomes true he exits with his exit animation. When it becomes false he enters again, unless the user hid him on purpose. This has a setting, `hideWhenPresenting`, which is on by default, and a menu toggle.
- **Low battery** (≤ 15 %, not charging): he says something sleepy once per drop below the threshold. While low, he plays a new `Tired` animation (droopy eyes, slump) during idle.
- **CPU sustained > 85 % for 30 s:** a new `Sweat` animation with a drop prop, plus a line, at most once every 10 min.
- **Audio playing:** a new `Dance` animation now and then while idle, at most once every 3 min. It needs the setting `reactToMusic` (on by default) and its toggle.
- **Night (00:00–05:00 local):** a new `Yawn` animation sometimes while idle, plus a gentle "it's late" line once per night.
- **Quiet mode** suppresses the lines but not the hide/show.

## Phase 2: wellbeing

- **Stretch breaks, `src/agent/stretch.ts`.**
  - It counts *active minutes*: a minute counts when `idleSecs` is under 60. A pause of 5 min or more (idle ≥ 300 s) resets the count.
  - After N active minutes he plays a new `Stretch` animation on the mat: two or three yoga poses using the existing mat, such as reach up, side bend and a forward fold squash. He offers the balloon actions "Stretch with me" and "Later". "Stretch with me" plays a longer guided sequence with lines like "reach up… and side…", about 30 s. "Later" snoozes for 15 min.
  - Settings: `stretch: { enabled: true, everyMin: 60 }` with the choices 30/45/60/90. Its menu submenu follows the water-reminder submenu.
  - It should not fire during focus mode, presenting or quiet mode. It defers while a water reminder is showing.
- **Focus timer, `src/agent/focus.ts`.**
  - The menu item "Focus timer" offers 15/25/45/60 min, plus "Stop" while running.
  - While running he holds a small timer prop with a live minutes-left label. Update it once a minute, not with rAF. He stays quiet: no jokes, tips, water or stretch reminders.
  - At the end he plays a new `Celebrate` animation, says a line and offers "Take a break" / "Another round".
  - The timer survives a sleep or wake of the machine by storing its end timestamp, and the tray shows the time left.
- **Meeting heads-up, macOS only, `src-tauri/src/calendar.rs`.**
  - It is opt-in through the menu toggle "Meeting heads-up", off by default. Turning it on requests EventKit full access, so add `NSCalendarsFullAccessUsageDescription` and `NSCalendarsUsageDescription` to an `Info.plist` merged by Tauri.
  - Every 60 s it polls events starting in the next 6 min, skipping all-day events. 5 min before a meeting he says "It looks like you have a meeting in 5 minutes: <title>". Each event fires once.
  - Use `objc2-event-kit`. If access is denied he says so once and the toggle turns off.
  - On other platforms the toggle is hidden.

## Phase 3: play

- **Throwing, `src/agent/throwPhysics.ts`.**
  - A pure step function takes position, velocity, the work-area rect, the window size and dt, and returns the new position and velocity plus any bounces. It uses gravity, wall bounces with restitution 0.55, floor friction, and stops when the speed is low and he is on the floor. The floor is the bottom of the work area.
  - On drag release, measure the release velocity from the last 80 ms of moves. Above a threshold, run the physics with rAF only while flying and move the window with `setPosition`. Each bounce squashes him.
  - On landing, if he took 2 or more bounces or was going fast, he plays Dizzy.
  - It must coexist with the dizzy detector and the native `startDragging`. Native dragging hides the move events from JS, so velocity comes from the window `onMoved` positions and their timestamps.
  - When he comes to rest, save his position.
- **Seasonal outfits, `src/art/outfits.ts`.**
  - `outfitFor(date)` returns one of these, matched by local date:
    - `santa-hat` from Dec 1 to 26
    - `party-hat` from Dec 31 to Jan 1
    - `heart` on Feb 14
    - `pumpkin` from Oct 25 to 31
    - `shamrock` on Mar 17
    - `none` otherwise
  - Each outfit is an SVG layer in both skins, attached to the group that moves with the top of the wire so it follows the poses.
  - The setting `outfits: 'auto' | 'off'` has a menu toggle. The sandbox gets `&outfit=<name>` for previews.
- **File drop.**
  - Use the Tauri window `onDragDropEvent`. Make the drop count only over the character's hit rects. While a drag is over him, he leans in with a new `Noticed`-like "ooh" pose.
  - On drop he says the name, size and kind, for example "Ooh, a 2.4 MB PDF. Want me to zip it?", with the actions "Zip it" / "No thanks".
  - "Zip it" calls the Rust command `zip_paths(paths) -> outPath`, using the `zip` crate. It writes `<name>.zip` next to the first item and never overwrites: the name becomes `name 2.zip` and so on. Folders are zipped recursively.
  - After zipping he says "Done!" and offers "Show in Finder", using `tauri-plugin-opener` with reveal.
  - Several files dropped at once are zipped into `Archive.zip`.
  - Note: the window ignores cursor events outside his hit rects, so check whether drag events reach it at all. If they don't, explain why in the report rather than silently doing nothing.

## Phase 4: Ask Paperclip

- **Before writing the API code, invoke the `claude-api` skill** and follow it for the request shape, model id and headers.
- **Model.** The default is `claude-haiku-5-5`, because it is fast and cheap for short quips. A setting allows `claude-sonnet-5-5`.
- **Key storage.** The key lives in the OS keychain via the `keyring` crate. It never goes in `settings.json` and never reaches the webview after it is entered.
  - The menu item "Set Claude API key…" shows a password input in the balloon.
  - A "Remove API key" item appears too.
- **The request happens in Rust,** in the command `ask(question, history) -> answer`, using `reqwest` with rustls. That way the key never touches JS and the CSP stays unchanged. Non-streaming is fine.
  - Use a 20 s timeout and friendly errors in his voice for no key, 401, 429 and offline.
- **System prompt.** He is Paperclip, a cheerful, slightly dorky desktop paperclip. He answers in 1–3 short sentences under about 220 characters, because the balloon is small. No markdown.
  - Keep the last 6 turns in memory only, cleared when he's hidden.
  - Set `max_tokens` to about 200.
- **UI.**
  - The menu item "Ask Paperclip…" opens a single-line input in the balloon, with Enter to send and Esc to cancel. While waiting he plays a `Thinking` animation, using an existing one if there is one. Answers use the normal speak, and a "Reply" action continues the thread.
  - The window has `focus: false` and ignores cursor events outside the hit rects. While the input is open, the window must take focus and the balloon rect must count as a hit area. Afterwards focus goes back to the previous app if possible; on macOS, hiding focus is acceptable.
- **Privacy.** Only the typed text and the in-memory history are sent: no screen, clipboard or file contents. Say this in the menu tooltip or in the first-run line.

## Phase 5: shipping

- **CI.** `.github/workflows/ci.yml` runs on pushes and PRs on macOS: `npm ci`, test, typecheck and clippy.
- **Releases.** `.github/workflows/release.yml` runs on `v*` tags using `tauri-apps/tauri-action`. The matrix covers macOS universal (`--target universal-apple-darwin`), Windows and Ubuntu 22.04, with its apt deps. It creates a draft GitHub release with the artifacts and `latest.json`.
  - Signing and notarization run only when the secrets exist: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` and `APPLE_TEAM_ID`. Without them, unsigned builds still succeed.
  - The updater signing uses `TAURI_SIGNING_PRIVATE_KEY` and its password.
- **Auto-update.** `tauri-plugin-updater` plus `tauri-plugin-process`.
  - Generate the keypair with `npx tauri signer generate -w ~/.tauri/paperclip.key`. It goes outside the repo, never committed, and with no password unless that's easy to document. Put the public key in `tauri.conf.json`, the endpoint `https://github.com/annuai/paperclip/releases/latest/download/latest.json` and `createUpdaterArtifacts: true`.
  - The menu item "Check for updates…" makes him say whether an update exists and offer "Update and restart".
  - Check silently once a day, then mention it once.
  - Note: the repo is private, so the endpoint isn't publicly reachable until it's public. Report this.
- **Homebrew.** `packaging/homebrew/paperclip.rb` is a cask template that points at the release dmg, with the version and sha256 as placeholders, plus a short `packaging/README.md` explaining how to publish a tap.
- **Leave alone:** don't create repos, push tags or set GitHub secrets. Those belong to the lead, who checks with the user first.
- Phase 2 note: hardened-runtime release needs entitlement com.apple.security.personal-information.calendars (src-tauri/Entitlements.plist, bundle.macOS.entitlements).
