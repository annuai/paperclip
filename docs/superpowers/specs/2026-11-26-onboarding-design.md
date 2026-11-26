# Onboarding: the Welcome guide (design)

Date: 2026-11-26 (revised same day). Status: design, not built. Builder: Sonnet, following this doc without access to the user.
Labels: **[User]** = the user decided or said it. **[Proposal]** = shown to the user, not objected to.
**[Architect]** = decided here, never discussed with the user (also listed in section 11).

## 1. Intent and why

**[User]** "Can we build an onboarding thing for this. First time users aren't understanding how to use paperclip
and it needs explanation (visual) to create api keys."
**[User]** "Use design skills to build the best cohesive user experience that doesn't differ from the actual
paperclip itself and its current interface. It has to be elegant and visually stunning."
**[User]** Success: by the time the window closes, the user has asked a question: learned the gestures, saved a key,
asked Paperclip, and seen him answer.
**[User]** "He moves in": the desktop pet rolls up his mat, leaves the desktop and appears inside the window as the
host, then rolls back out when it closes. Only one Paperclip on screen at any time.
**[User]** Layout: "a combination of A and C. I want motion explainers, but I want it to be cleaner interface like C".
Reference sketch: `.impeccable/mocks/welcome-sketch.html` (**approved** [User]: "Yes, that's it").
**[User]** "I also want users to actually click and learn in the process." Every basics screen and the key screen
are hands-on lessons (5.2-5.4); the mechanics are **[Architect]**.

What a new user gets today (verified in code):
- `src/main.ts` `boot()` ends with `agent.show()`, `play('Greeting')`, `speakKind('greeting')`. Nothing teaches
  click, right-click, the menu, the tray icon or the API key.
- The key prompt (`src/content/ask.json` `keyPrompt`) has no link and no steps. It appears only after a question
  that needs the AI is typed (`AskFlow.ask` -> `enterKey`, `src/agent/ask.ts`). The balloon is at most 134 px high.

## 2. Goals, non-goals, anti-goals

Goals
1. A first-time user learns the gestures, the menu and the tray icon in under a minute, by trying them on him.
2. A user who wants AI answers saves a working key, guided by motion explainers, without guessing.
3. Before closing, the user asks him something and sees an answer (with or without a key, see 5.5). **[User]**
4. The guide looks and moves like Paperclip himself: same character, balloon, palette, type. **[User]**

Non-goals (v1): account creation inside the app; localisation; explaining every menu item; Linux tray quirks
beyond one sentence; a multi-turn chat in the guide (one question plus one reply is enough).

Anti-goals: generic app-onboarding art (DESIGN.md rejects "pastel-blob ... faceless app-onboarding illustration");
real screenshots of provider sites **[Proposal]**; any path where JS can read a stored key; opening an arbitrary
URL supplied by JS; two Paperclips on screen at once **[User]**; nagging (the guide opens by itself at most once).

## 3. Constraints (verified unless marked)

- Main window: 320x380, transparent, always on top, `focus: false`, `skipTaskbar`, click-through (tauri.conf.json).
- macOS runs with `ActivationPolicy::Accessory` (lib.rs): no Dock icon, no Cmd+Tab entry.
- Keys: Rust only (`ask.rs`: `ask_set_key`, `ask_key_status`, `ask_remove_key`; keyring service
  `app.paperclip.desktop`, one account per provider). Keep "JS can never read a key back". The `ask` command reads
  the key itself in Rust; it takes `question, history, model, provider` and returns `AskFailure {kind, message}` on error.
- `tauri_plugin_opener` is registered; Rust already calls it directly (`files.rs` `reveal_item_in_dir`).
- `capabilities/default.json` covers only `"main"`. CSP: `default-src 'self'; img-src 'self' data:; ...`.
- App commands in `invoke_handler` are callable from every window (no app manifest in build.rs).
- Tauri's default macOS menu (Edit > Paste) is on: `enable_macos_default_menu: true` in tauri 2 app.rs.
- Budget ~60 MB RSS, near-zero idle CPU (PRODUCT.md). Main menu has 14 pinned top-level rows (`menuModel.test.ts`).
- Gestures (`src/ui/interaction.ts`): click = eye follow; double-click = joke; triple/middle-click = quote; double
  right- or middle-click (400 ms) = Ask; right-click = menu; mat tap = jump; drag = move, fast release = throw.
  Tray: left click summons/pokes, right click = menu (tray.rs; Linux may only show the menu).
- Tests: Vitest (`npm test`), `npm run typecheck`, `npm run lint:rs`.

## 4. Approaches

| | A. Guided tour in the balloon (main window enlarged) | B. Web guide in the browser | C. Separate welcome window **(chosen [User])** |
|---|---|---|---|
| Pictures | Almost none: balloon is 134 px | Plenty | Plenty |
| Paste field next to the steps | Yes, but cramped | No: user must come back and use the balloon | Yes, beside the explainer |
| Feels like Paperclip | Most | Least (a website) | Yes: he moves in and hosts it |
| Cost | Resizing a click-through transparent window is fragile (hit rects, position, throw physics) | Needs hosting, goes stale, leaves the app | A second window: capabilities, focus, lifecycle, tens of MB while open |

Why C won **[User]**: room for pictures, and the paste field sits beside the instructions. Cost accepted: a second
window. (The layouts "A/B/C" in section 7 are a later, separate choice about the window's inside.)

## 5. Screens

Five screens, one paperclip link each in the footer chain. Window 640x520 (layout in section 7). Copy is final
unless the builder finds a factual error. Footer: "‹ Back" (hidden on screen 1), chain, forward action on the right.

### 5.1 Hello (pose: enter, then `Greeting`)
Balloon: "Hi, I'm Paperclip! I usually live in the corner of your screen. I've moved in here for a minute to show you around."
Forward: "Let's go ›". Below the balloon, small: "Skip the tour" (closes; he moves back out).

### 5.2 Try me: four guided lessons **[User]** (mechanics **[Architect]**)
```
 [stage]  ( Click me once. )                         <- balloon names the active lesson
          [*CLICK: My eyes follow you*] [ DOUBLE-CLICK: I tell a joke   ]   * = active, looping art
          [ DRAG: Move me, or fling me ] [ RIGHT-CLICK: Everything else ]   others dimmed, static
          Keyboard: press Enter on me.   Skip this one
 ‹ Back              [chain o O . . .]              Skip ›   (becomes Marigold "Next ›" when all done)
```
- One lesson active at a time, in order: click, double-click, drag, right-click. Only the active tile loops its
  explainer (7.3); the others are dimmed and static; finished tiles show a Marigold tick and their final frame.
- The user performs the gesture on the stage Paperclip. He reacts (eyes follow / a joke in the balloon / slides
  and lands / the demo menu opens), the tile ticks, and after 600 ms the next lesson activates.
- Balloon per lesson: "Click me once." / "Now double-click me." / "Drag me along my mat. Give me a fling!" /
  "Right-click me." When all are done: "You've got it. The real me works the same way on your desktop."
- Never a trap: "Skip this one" under the grid skips the active lesson (marked skipped, no tick). The footer forward
  is the ghost "Skip ›" (skips the screen) until every lesson is done or skipped, then the Marigold "Next ›".
- A gesture that is not the active lesson still gets his normal reaction but does not tick anything.
- Footnote: "Triple-click for a quote. Tap the mat and I jump." (no lessons for these).

### 5.3 Menus and the tray: three lessons **[User]** (pose: `LookUp` toward the top-left)
Balloon: "Everything else lives in two menus." Three rows, same lesson rules as 5.2 (one active, tick, skip, forward):
1. **Pick from my menu**: "Right-click me and choose Tell a joke." The demo menu opens; picking any item does it in
   the guide (Say hi: wave + greeting; Tell a joke: joke; Give a quote: quote; Style: switches the guide's skin and
   tells main) and completes the lesson. Esc/outside closes without completing.
2. **Ask box**: "Double right-click me." The ask box opens in the guide balloon (input + Send). Opening it completes
   the lesson; anything typed is answered by the real ask step on 5.5, so here Send says "Hold that thought: we'll
   ask for real in two steps." and keeps the text for 5.5.
3. **Tray**: macOS "Click the paperclip icon in your menu bar."; Windows "...in the system tray, bottom right.";
   Linux "...in your system tray, if your desktop shows one." Any tray action while the guide is open (main forwards
   `guide:tray`) completes it; he plays `Noticed` and says "There it is! Click it any time to bring me back."
Rows carry static Flat pictograms. Below: "Right-click the icon for the full menu."

### Keyboard and screen readers (5.2, 5.3) **[User]**
The stage Paperclip is a focusable button (`tabindex=0`, `aria-label="Paperclip, practice here"`). With it
focused: Enter/Space = click; D = double-click; Left/Right arrows = drag along the mat (Shift = fling);
Shift+F10 or the ContextMenu key = right-click (the demo menu is keyboard-driven, as `ContextMenu` already is);
pressing it twice within 400 ms = double right-click. Each active tile shows its key ("Keyboard: press D").
An `aria-live="polite"` region announces "Lesson 2 of 4: double-click Paperclip, or press D." and "Done." The tray
lesson cannot be keyboard-only on every OS, so its Skip is always visible.

### 5.4 Get your key (the motion explainer; pose: eyes follow the explainer cursor)
```
 [stage]  ( Let's practise first. Click Sign in. )      <- phase 1; phase 2 below
          OPENROUTER · FREE   GROQ · FREE   CLAUDE · PAID      <- underline tabs
          +--------------------------------------------+
          | openrouter.ai/keys                 ILLUSTRATION
          | API KEYS                    [CREATE KEY]  |   9 s loop (7.4)
          | sk-or-v1-••••••••             [COPY]      |
          +--------------------------------------------+
          1 · Sign in    2 · Create a key    3 · Copy and paste   <- progress bars synced to the loop
          [- - PRACTICE: click to paste - -]        I know how, skip practice
   phase 2: NOW FOR REAL   [OPEN THE KEYS PAGE ↗]
          Your key [ Paste your OpenRouter key ••••    ][show][SAVE]   Everything else works without a key.
 ‹ Back                 [chain o o o O .]                Skip for now ›
```
The screen has two phases **[User]** (mechanics **[Architect]**):

**Phase 1, Rehearse.** The illustration becomes clickable. Balloon: "Let's practise first. Click Sign in." Steps in
order: Sign in -> Create key -> Copy -> the practice field. Each target is a real `<button>` inside the frame; only the
current one is enabled (others `aria-disabled`, dimmed). Clicking it plays that beat of the 9 s loop (7.3) and lights
its step bar. Balloon per step: "Click Sign in." / "Now Create key." / "Copy it." / "Click the practice field to paste."
The practice field is **not** an input: a dashed-border box labelled "PRACTICE" inside the Ink frame; clicking it
fills it with the obviously fake key (`sk-or-PRACTICE-not-a-real-key`), then "Nice. That's all it takes."
The fake key is never saved, sent or put in the clipboard. If the user does nothing for 4 s, the ghost cursor
demonstrates the current step only (the approved motion explainer), then waits; it repeats every 8 s while idle.
"I know how, skip practice" link (visible from the start) jumps to phase 2.

**Phase 2, Now for real.** A clear state change: the frame shrinks to a static three-step summary (the loop's final
frame, 96 px high), the label "NOW FOR REAL" appears, and the real controls appear below: "Open the keys page ↗"
and the real paste field (solid Ink border, label "Your key", placeholder "Paste your OpenRouter key"). Balloon:
"Now for real. Open the keys page, do the same three things, and paste your key here."
Phase starts as 2 when this provider already has a key or after a key is saved; phase 1 otherwise.

- Tabs: OpenRouter preselected **[Proposal]** unless the current provider is another. A tab change swaps the
  explainer variant, steps, link, prefix hint, practice key and placeholder, keeps the phase and rehearsal step, and
  sends the provider choice to main (6.4).
- Practice and real never look alike: practice lives only inside the Ink "ILLUSTRATION" frame, dashed, labelled
  PRACTICE, with the word PRACTICE in its key; the real field lives only on Paper below the frame, solid, in phase 2.
  A pasted practice key in the real field is refused: "That's the practice key. Paste the one you copied from OpenRouter."
- Field: `type=password`, `autocomplete=off`, `spellcheck=false`, `autocapitalize=off`, max 512, eye toggle
  (aria-label "Show key"/"Hide key"). Enter = Save. While the field has focus or a value, the loop pauses (7.6).
- After Save: field clears, inline "Saved to your keychain." with a tick, he plays `Congratulate`, forward becomes
  "Next ›". Already has a key for this provider: field replaced by "You already have a Groq key saved." + [Replace key].
- Skippable **[Proposal]**: "Skip for now ›" goes to 5.5 in its no-key form.

Provider data (checked 2026-11-26 against public docs; see 9):

| | OpenRouter (default) | Groq | Claude (Anthropic) |
|---|---|---|---|
| Keys page (Rust allowlist) | `https://openrouter.ai/keys` | `https://console.groq.com/keys` | `https://platform.claude.com/settings/keys` |
| Step 1 | Sign in (or make a free account) | Sign in (or make a free account) | Sign in to the Claude Console |
| Step 2 | Create a key, any name | Create API Key, any name | Create key, name it |
| Step 3 | Copy it (starts with sk-or-) | Copy it, it's shown only once | Copy it (starts with sk-ant-), shown only once |
| Note under steps | "Free models need no credit card." | "Free tier, no credit card." | "Needs prepaid credits on your Claude account." |
| Explainer button label | "Create key" | "Create API key" | "Create key" |
| Soft prefix hint | `sk-or-` | `gsk_` (unverified) | `sk-ant-` |
| Practice key | `sk-or-PRACTICE-not-a-real-key` | `gsk_PRACTICE-not-a-real-key` | `sk-ant-PRACTICE-not-a-real-key` |

### 5.5 Ask me something (pose: `Explain`, then `Thinking` while waiting)
With a key **[User]**: balloon "Your turn. Ask me anything." Input (`maxLength 500`, placeholder "Type your question")
+ [Ask]. Three suggestion chips fill the input when clicked: "What's a good stretch for my back?", "Explain APIs
in one sentence", "Name a fun fact about paperclips". Answer appears in the balloon with [Ask another] and the forward
action "Finish ›". Text typed in the 5.3 ask box is prefilled here. Privacy line under the input (from `askIntro`): "Only what you type goes to {provider} and the
model you picked."
Without a key: balloon "No key yet, so I'll answer from what I know myself." Chips only, answered offline by
`LocalContentProvider`: "Tell me a joke" (`joke`), "Give me a quote" (`quote`), "Give me a tip" (`tip`). Plus a
link "Add a key after all" (back to 5.4). This counts as success for skippers **[User]**.
"Finish ›" is always available; reaching 5.5 and pressing it, or any close, ends the guide. Failure handling in 6.6.

## 6. Technical architecture

### 6.1 Files

Create
- `welcome.html`: page shell; loads `/src/welcome/main.ts` and `/src/welcome/welcome.css`.
- `src/welcome/flow.ts`: pure state machine (no DOM, no Tauri). `flow.test.ts`.
- `src/welcome/providers.ts`: per-provider data (table above) + `keyLooksRight()`. `providers.test.ts`.
- `src/welcome/askStep.ts`: pure mapping from `AskResult` to what screen 5.5 shows. `askStep.test.ts`.
- `src/welcome/copy.ts`: all strings, platform variants. `copy.test.ts` (every screen and platform has copy).
- `src/welcome/explainers.ts`: the SVG/HTML markup of the key explainer (three variants) and four gesture tiles.
- `src/welcome/stage.ts`: in-window Paperclip: `Renderer` + `Animator`, pointer (via `attachInteraction`) and
  keyboard gestures, demo menu, ask box.
- `src/welcome/stageKeys.ts`: pure key-to-gesture mapping (`keyGesture`). `stageKeys.test.ts`.
- `src/welcome/screens.ts`: one DOM render function per screen; `src/welcome/rehearsal.ts`: the 5.4 phase 1 view.
- `src/welcome/platform.ts`: `GuidePlatform` interface, Tauri implementation, sandbox fake.
- `src/welcome/main.ts`: DOM glue only. `src/welcome/welcome.css`. `src/fonts.css` (Oswald @font-face moved out of
  `styles.css`, imported by both pages).
- `src/agent/guest.ts`: pure `routeCommand(id)` and `returnPlan(ctx)` for move-out/in (6.3). `guest.test.ts`.
- `src-tauri/src/guide.rs` with unit tests. `src-tauri/capabilities/welcome.json`.

Change
- `vite.config.ts`: `build.rollupOptions.input = { main: 'index.html', welcome: 'welcome.html' }` (via `fileURLToPath`).
- `src-tauri/src/lib.rs`: `mod guide;`, register `guide::guide_open`, `guide::guide_open_key_page`; call
  `guide::on_window_event(window, event)` from `on_window_event`.
- `src-tauri/src/ask.rs`: after successful `ask_set_key`/`ask_remove_key`, `app.emit("ask-key-changed", provider_id)`
  (add `app: AppHandle`; JS call sites unchanged). Make `valid_model_id` and `valid_groq_model_id` `pub(crate)`.
- `src-tauri/src/tray.rs`: Presence submenu gets "Welcome guide…" (id `guide-open`) after "Check for updates…".
- `src/ui/menuModel.ts` + test: Presence children `['presence-hide','presence-music','update-check','guide-open']`;
  still 14 top-level rows.
- `src/platform/settingsParse.ts`/`settings.ts`: `guideSeen: number` (default 0, finite int >= 0), add to the load
  list (and add the missing `askGroqModel`, an existing bug: a saved Groq model is never restored); pure `isFreshStore(raw)` = every loaded value `undefined`; `loadSettingsWithMeta(): {settings, fresh}`.
- `src/platform/tauri.ts`: `guideOpen(opts)`, `onAskKeyChanged(cb)`, `onGuideEvent(cb)`, `emitToGuide(ev, p)`,
  `askSetKeyResult(key, provider): Promise<{ok:true}|{ok:false; message:string}>`.
- `src/agent/ask.ts` + test: optional `deps.openGuide?(start: 'key'): void`. In `enterKey` when `!confirm` and
  `openGuide` exists, first `choose(line('keyOffer'), [{id:'guide',label:'Show me how'},{id:'paste',label:'I have a key'},
  {id:'done',label:'Not now'}])`. Menu "Set … API key…" keeps going straight to the field.
- `src/content/ask.json` + `provider.ts`: kind `keyOffer` ("I need a {provider} key for that. Want me to show you how
  to get one?", "That one needs a {provider} key. I can walk you through it."). New `src/content/guide.json`
  (kinds `firstRun`, `guideNews`, `guideBack`, `guideFailed`, texts in 6.3; `guideBack` also: "I'm back! Double
  right-click me whenever you want to ask something.", "Home sweet corner."). `greetings.json` keeps its period shape.
- `src/main.ts`: first-run logic, move-out / move-in (6.3), guide event wiring, command gating.

### 6.2 Rust interface (`guide.rs`)

```rust
pub const LABEL: &str = "welcome";
#[tauri::command]
pub async fn guide_open(app: AppHandle, window: WebviewWindow, style: String, provider: String,
                        models: GuideModels, start: String, outfit: Option<String>) -> Result<(), String>;
#[tauri::command]
pub fn guide_open_key_page(window: WebviewWindow, provider: String) -> Result<(), String>;
pub fn on_window_event(window: &Window, event: &WindowEvent);
fn key_page_url(p: &str) -> Option<&'static str>;                  // fixed allowlist
fn guide_url(q: &GuideQuery) -> Result<String, String>;            // validates every field
fn place(work: Rect, size: (f64, f64)) -> (f64, f64);              // pure, tested
```
- `guide_open`: caller must be `main`. Validate: style `classic|flat`; provider `openrouter|groq|anthropic`;
  `models` carries all three stored ids, each validated by its own rule (`valid_model_id`, `valid_groq_model_id`
  which allows ids without a slash, the two Claude ids), invalid ones dropped to the default. The guide picks the id
  for its current tab; `guide:provider` and `guide:style` events never reuse another provider's id. Start `hello|key`; outfit in the outfit id
  list or dropped. Rust adds `platform=macos|windows|linux` from `cfg!`. If `welcome` exists: `unminimize`, `show`,
  `set_focus`, emit `guide:goto {start}` to it, return. Else build with `WebviewWindowBuilder::new(&app, LABEL,
  WebviewUrl::App(guide_url(..)))`: title "Welcome to Paperclip", inner 640x520, not resizable/maximizable,
  `decorations(true)`, `visible(false)`; macOS `title_bar_style(Overlay)` + `hidden_title(true)` (native traffic lights
  sit on the stage, 7.1). `on_navigation` allows only `tauri://localhost`, `http://tauri.localhost`, and in debug
  `http://localhost:1420`. Position with `place()` on the pet's monitor, then macOS
  `set_activation_policy(Regular)` (Dock icon + Cmd+Tab while the user is in the browser), `show()`, `set_focus()`.
- `guide_open_key_page`: caller must be `welcome`; `tauri_plugin_opener::open_url(url, None::<&str>)`.
- `on_window_event` for `welcome`, `Destroyed`: macOS policy back to `Accessory`; emit `guide-state {open:false}`
  to `main`. Do not call `release_focus` here: main's move-in grabs nothing, and the user's next app keeps focus.
- `place()`: centre of the work area of the monitor the pet was on, clamped inside it. No pet to avoid (he has left).

### 6.3 He moves in, he moves out (main window lifecycle) [User]

State in main.ts: `let guest: 'none' | 'leaving' | 'away' | 'returning' = 'none'` and `wasHidden: boolean`.

When it opens by itself: first launch only, `fresh && guideSeen === 0`. He enters and waves as today, says the new
greeting kind `firstRun` ("Hi! I'm Paperclip. Let me show you around.") instead of a normal greeting, then moves out
with `start: 'hello'`. Upgraders (`!fresh && guideSeen === 0`) **[User]**: no window; instead of the launch greeting he says once the new
greeting kind `guideNews` ("New: a short guide. Right-click me, Presence, Welcome guide."), then `guideSeen = 1`.
If he starts hidden, the line waits for the first time he is shown and `guideSeen` stays 0 until it is spoken. Users
with a key already: same rules; 5.4 shows the saved state. Menu/tray `guide-open` opens at `hello`; the balloon's
"Show me how" opens at `key` with the current provider (the pending question is dropped).

Move out (`openGuide(start)`):
1. If `guest !== 'none'`: just `guideOpen(...)` (focuses it) and return.
2. `wasHidden = agent.hidden && !presence.isAutoHidden()`. End follow, close balloon and menu, `ask.reset()`, `agent.interrupt(true)`.
3. If visible: play `ExitRollUp` (the mat-roll exit, about 1.2 s; reduced motion: instant hide) via a new
   `agent.hide({ exit: 'ExitRollUp' })` option. **Never** `saveSettings({hidden})`; no `presence.userChangedVisibility()`.
4. `guest = 'away'`; stop scheduler, sleep timers and hydration as `hideNow` does; `sync(false)`.
5. `await guideOpen(...)`. The guide's stage plays the mat unrolling and an enter (`EnterSlide`), then `Greeting`.
6. If `guideOpen` fails, or no `guide:ready` arrives within 5 s: move in again (below) and say
   "Hmm, my guide wouldn't open. You can try again from the menu: Presence, Welcome guide."

Move in (on `guide-state {open:false}`, from any close: Finish, Skip, red button, Cmd+W, webview crash that the
user then closes):
1. The guide plays its own exit before closing when it can: Finish/Skip call `flow.close()` -> stage plays
   `ExitRollUp`, then `getCurrentWindow().close()`. The red button closes at once (no exit there).
2. Main: `guest = 'returning'`. If `wasHidden`, stay hidden (`guest='none'`, `sync(false)`) and stop.
   If something is full screen and hide-when-presenting is on, stay hidden and call `presence.adoptHidden()` (7th
   bullet below) so the end of full screen shows him. Otherwise `agent.show()` (enter animation), restart scheduler/sleep/hydration,
   `sync(true)`, then say `guideBack` (or `keySaved` if a key was saved this session). `guest = 'none'`.

While `guest === 'away'`:
- Presence auto-hide/show: `hide`/`show` reactions are ignored while he is away. Today `Presence.onFullscreen` does
  not mark a hide while `ctx.hidden`, and clears `hiddenByMe` on any end of full screen, so add two methods to
  `Presence` (tested): `adoptHidden()` sets `hiddenByMe = true`. At move-out, `wasHidden` is true only for a **user**
  hide; an auto-hide (`presence.isAutoHidden()`) counts as visible, so move-in applies the full-screen rule afresh.
- Tray left-click (`tray-click`), tray "toggle", and any command that needs him on the desktop (`hi`, `joke`, `quote`,
  `tip`, `animate`, `nap`, `ask-open`, `ask-key`, `ask-remove`, `update-check`, `water-now`, `stretch-now`,
  `focus-*` start): call `guideOpen` (brings the guide forward) and forward `guide:tray` for a tray click (5.3).
  Setting-only commands (style, quiet, greet, presence-*, water/stretch toggles and intervals, ask provider/model,
  outfits, meeting) apply as now (`ask-model-other` / `ask-groq-other` open a desktop prompt, so they only bring the
  guide forward while away); style, provider and outfit changes are also forwarded to the guide. The tray's
  "toggle" reads "Show Paperclip" while away and focuses the guide.
- Scheduled water/stretch reminders, welcome-back and the daily update check already wait while `agent.hidden`;
  they fire after he moves back in. A running focus timer keeps counting; its end line is skipped while away (as
  when hidden today). Meeting heads-up is skipped while away (accepted: the guide takes a few minutes).
- Quit from the tray: unchanged; the process exits and the guide window goes with it. `hidden` was never saved,
  so next launch shows him normally.
- Crash or force-quit of the whole app mid-guide: same, nothing persisted. Webview crash inside the guide: the window
  stays (blank); tray actions still focus it; closing it fires `Destroyed` and he moves in.
- `guideSeen` is written at move-out time, so a quit mid-guide never reopens it automatically.

### 6.4 Data flow and events

```
main --(roll-up)--> invoke guide_open(style, provider, model, start, outfit) --> guide.rs creates "welcome"
welcome --emitTo('main','guide:ready')                      main: guest = 'away' confirmed
welcome --invoke ask_key_status / ask_set_key(key, p)--> ask.rs --emit 'ask-key-changed' p--> main and welcome re-query
welcome --emitTo('main','guide:provider',{provider})--> main: runCommand('ask-provider-<p>') (same path as the menu)
welcome --invoke ask(question, [], model, provider)--> ask.rs (reads key in Rust) --> answer | AskFailure
welcome --invoke guide_open_key_page(p)--> guide.rs --opener--> default browser (fixed URL)
main --emitTo('welcome','guide:tray' | 'guide:style' | 'guide:provider' | 'guide:outfit' | 'guide:goto')
welcome --emitTo('main','guide:finished',{keySaved, asked})   (before closing; main uses it for the return line)
guide.rs on Destroyed --emit 'guide-state' {open:false}--> main: move in
```
Every receiver validates payloads (`normalizeAskProvider`, `normalizeStyle`, fixed kind sets) and ignores the rest.
The welcome window never writes `settings.json`. Gestures (5.2) happen inside the guide: no gesture events from main.

### 6.5 Pure logic (`flow.ts`, `providers.ts`, `askStep.ts`)

```ts
export type Screen = 'hello' | 'try' | 'menus' | 'key' | 'ask';
export type Lesson = 'click' | 'doubleClick' | 'drag' | 'contextMenu' | 'menuPick' | 'askBox' | 'tray';
export const LESSONS: { try: readonly Lesson[]; menus: readonly Lesson[] }; // try: first four, menus: last three
export type LessonState = 'todo' | 'done' | 'skipped';
export type RehearsalStep = 'signIn' | 'createKey' | 'copy' | 'paste';
export interface GuideState { screen: Screen; provider: AskProvider; platform: Platform;
  lessons: Record<Lesson, LessonState>; keyPhase: 'rehearse' | 'real'; rehearsal: RehearsalStep | 'done';
  keySaved: Record<AskProvider, boolean>; asked: boolean }
export function initial(q: URLSearchParams, keySaved: Record<AskProvider, boolean>): GuideState;
export function next(s): GuideState; back(s); goto(s, screen);
export function activeLesson(s): Lesson | null;        // first 'todo' lesson of the current screen
export function perform(s, l: Lesson): GuideState;    // ticks only when l === activeLesson(s)
export function skipLesson(s): GuideState; screenDone(s): boolean;
export function rehearse(s, step: RehearsalStep): GuideState; // advances only when step is the current one
export function skipRehearsal(s): GuideState; setProvider(s, p): GuideState; markKeySaved(s, p): GuideState;
export function forward(s): { label: string; primary: boolean };
export function keyLooksRight(p, raw): 'empty' | 'invalid' | 'practice' | 'unexpectedPrefix' | 'ok'; // mirrors Rust validate_key + soft prefix
export type AskView = { kind: 'input' } | { kind: 'thinking' } | { kind: 'answer'; text: string }
  | { kind: 'failure'; message: string; actions: AskAction[] };
export type AskAction = 'retry' | 'fixKey' | 'otherService' | 'freeModel' | 'finish';
export function viewFor(r: AskResult, provider: AskProvider): AskView;
```
On `unexpectedPrefix`: "That doesn't look like an OpenRouter key (they start with sk-or-). Save anyway?" with
[Save anyway] [Fix it]. Rust stays the authority.

Stage practice (`stage.ts`), since a drag inside the guide cannot move the real window **[Architect]**:
- Click: eyes follow the pointer inside the window for 4 s (DOM `mousemove`, same pupil math as `eyeFollow.ts`).
- Double-click (250 ms window, same as `CLICK_DELAY`): a joke from `LocalContentProvider` in the guide balloon.
- Drag: he slides along his mat with the pointer (x only, clamped to the stage); a fast release plays `Fling` then
  `Thud`, a rough one `Dizzy`. Tile copy explains: "On your desktop, drag moves me anywhere."
- Right-click: the real `ContextMenu` component opens on the stage with a demo menu (Say hi, Tell a joke, Give a
  quote, Style > Classic/Flat), which acts inside the guide only; a disabled last row reads "The full menu is on the desktop."
- Double right-click (`openAsk` from `attachInteraction`): the ask box (5.3 lesson 2).
- Mat tap = `Jump`; triple-click = quote. No lessons for these.
- Pointer gestures come from the existing `attachInteraction(target, handlers, startDragging)`; its `startDragging`
  callback starts the in-window mat slide instead of a native window drag. Keyboard gestures come from `keyGesture()`.

### 6.6 Ask step (screen 5.5) [User]

Reuse the `ask` command and `askQuestion()` from `platform/tauri.ts` with `history = []` for the first question and
the single previous exchange for "Ask another" (`AskHistory` from `agent/ask.ts`, in memory only, dropped on close).
Local intents (`matchIntent`) are **not** run in the guide (their actions need the desktop pet); questions go to the AI.
`viewFor()` maps every `FailureKind`:

| Kind | Shown | Actions |
|---|---|---|
| `noKey` | Rust message | fixKey (to 5.4) |
| `unauthorized` | "That key didn't work. Want to try a different one?" | fixKey (5.4, Replace state) |
| `outOfCredits` | Rust message | otherService (5.4, tabs), and freeModel when provider is OpenRouter |
| `badModel` | Rust message | freeModel (retry with model null = provider default) |
| `rateLimited`, `overloaded`, `offline`, `timeout`, `refused`, `empty`, `other` | Rust message | retry (disabled 10 s after `rateLimited`/`overloaded`) |
| `tooLong` | Rust message | back to input with the text kept |
All failure views also offer finish. `asked` becomes true on the first successful answer (or local chip answer).

### 6.7 Capability `welcome.json` (least privilege)

`"windows": ["welcome"]`: `core:event:allow-listen`, `core:event:allow-unlisten`, `core:event:allow-emit-to`,
`core:window:allow-close`, `core:window:allow-start-dragging` (title-bar drag region). Not: store, updater, process,
opener, `core:webview:*`, window position or size. New commands check `window.label()`.

### 6.8 Focus and paste

- Verified: `ask_focus` uses `window.set_focus()` and the balloon input takes typing, so `set_focus` activates this
  Accessory app. Verified: the default macOS menu with Edit > Paste is installed.
- Must test: Cmd+V/C/A/Z in the key field and ask input under Regular policy; Cmd+Tab back from the browser; the
  return to Accessory on close neither flickers nor steals focus; Windows/Linux Ctrl+V once each.
- Fallback if Cmd+V fails: Rust `guide_paste_key(provider)` reads the clipboard (adds `arboard`) and saves straight
  to the keychain; the key never enters the webview. Build only if needed.

## 7. Visual design (approved)

Source: `.impeccable/mocks/welcome-sketch.html`, the A + C combination **[User]**, sketch approved.
Tokens from DESIGN.md only: Ink `#18202E`, Paper `#F4F1EA`, Marigold `#F2B33D`, Ochre `#C98A1E`, menu divider
`#2A3446`, Oswald 400/500/600. No gradients, blur, or outline strokes on the character.

### 7.1 Layout (640x520)
- **Stage**, left, 210 px wide, full height: Marigold fill with a 6 px Ochre right edge (the mat's front face, as a
  wall). The real character SVG (`Renderer`, 200x242, viewBox `-50 -40 240 290`) stands at left 2 px, bottom 32 px.
  His mat top is recoloured Paper on this stage only (`.guide-stage #matSheet path:nth-child(2) { fill: Paper }`),
  so it reads against Marigold. macOS traffic lights sit at the stage's top-left (overlay title bar); a 28 px drag
  region spans the window top.
- **Pane**, right: left 236 px, top 20 px, 376x472. Content per screen; screens slide in (7.3).
- **Balloon**: Ink panel, Paper text, 14 px radius, 12x18 padding, Oswald 19 px/1.4 (larger than the desktop's
  15 px, because this is a reading surface), tail on the left edge pointing at him (13x18 triangle, top 20 px).
- **Tabs** (5.4): uppercase 12 px/500, 0.06em, 20 px gap; inactive 55 % opacity; active has a 3 px Marigold underline.
  Real `role=tablist`, arrow keys move between tabs.
- **Explainer frame** (5.4): Ink, 10 px radius, 172 px high, a 24 px `#2A3446` address bar with the provider URL as
  text, and a small "ILLUSTRATION" tag (10 px, 55 % Paper) top-right **[Architect]**: it is our drawing, not their site.
- **Steps**: three columns under the frame, 13 px, each with a 3 px track (Ink 12 %) that fills Marigold in step.
- **Paste field**: 40 px, 1.5 px Ink border, 8 px radius; Save is an Ink chip (Marigold when active).
  "Open the keys page ↗" is an Ink button; the note "Everything else works without a key." sits beside it at 70 %.
- **Gesture grid** (5.2): 2x2, 10 px gap, Ink tiles, 10 px radius, 132 px art area, title uppercase 13 px Marigold,
  caption 12 px Paper. Tiles use a mini clip (wire + eyes only) and a Paper cursor.
- **Footer**: left 236 px, bottom 14 px. "‹ Back" and the forward action are uppercase 12 px ghost buttons (70 %).
  Centre: the **paperclip chain**, five clip silhouettes rotated 90° (38x20 each, 2 px gap): done and current
  Marigold, upcoming Ink 18 %, current scaled 1.18. `aria-hidden`; a visually hidden "Step 2 of 5" carries the meaning.
- Primary actions inside the pane (Ask, Let's go) use the Marigold button: 8 px radius, uppercase 13 px/500.

### 7.2 The character as host
Per screen: Hello `Greeting`; Try idle `Blink` + reacts to practice; Menus `LookUp`; Key eyes follow the explainer
cursor (pupil offsets keyed to the loop, as `.eyes-k` in the sketch); Ask `Explain`, `Thinking` while waiting,
`Congratulate` on an answer. Idle breathing: 3 s scale 1.015/0.985 around 50 % 90 % (sketch `breathe`), CSS only.

### 7.3 Motion timings
- Screen change: pane out/in 350 ms (opacity + 24 px x-slide); he **hops** (from A's walking-mat idea): `Jump` via
  the Animator, about 700 ms, curve `cubic-bezier(.3,.7,.4,1)` (squash 1.08/0.9, rise 34 px, land 1.07/0.92).
- Move-in on open: mat unrolls (`EnterSlide` / mat-roll enter) about 1.2 s, then `Greeting`. Move-out on close:
  `ExitRollUp` about 1.2 s.
- Key explainer, 9 s loop (percentages of 9 s): 0-27 % sign-in card shown, cursor travels to "Sign in" by 16 %, tap
  ring at 20 %; 33 % sign-in fades; cursor to "Create key" by 44 %, tap at 48 %; new key row rises 49-56 %; cursor
  to "Copy" by 72 %, tap at 76 %, Copy fills Marigold at 78 %; key chip flies to the paste field 79-87 %
  (`cubic-bezier(.5,0,.4,1)`); field shows dots 89-96 %; Save pulses 91-96 %; reset 96-100 %.
  Step bars: 1 fills 0-33 %, 2 fills 33-66 %, 3 fills 66-94 %, all clear at 100 %.
- Gesture tiles, 3 s loops: Click = cursor approaches, tap ring at 36 %, pupils follow the cursor; Double-click = two
  rings 0.28 s apart, "Ha!" pops 48-56 %; Drag = clip and cursor slide 84 px with a 5° tilt, return; Right-click =
  ring then a mini menu pops (one Marigold row).
- Tap rings: 30 px, 3 px Marigold, scale 0.3 to 1.5-1.8, fade out.

### 7.4 Per-provider explainer variants
Same three beats; only text changes, from the 5.4 table: address bar, sign-in card title ("OpenRouter account",
"GroqCloud", "Claude Console"), button label, key row and fly chip (`sk-or-v1-••••`, `gsk_••••`, `sk-ant-••••`).
Claude adds the credits note under the steps. No provider logos or brand colours.

### 7.5 Classic style
Same layout and timings. Stage cream `#fff8c4` with a 1.5 px `#3a3a3a` right edge; Classic character and mat
unchanged (no Paper recolour). Balloon and frames use Classic's balloon look (cream, 1.5 px dark border, 10 px
radius) with system-ui; tiles and explainer frame `#f6f6f6` with `#8a8a8a` border like the Classic menu; accent for
ticks, rings, step fill and the chain is `#3a3a3a`. Follows the skin at open and on `guide:style`.

### 7.6 Reduced motion and idle CPU
- `prefers-reduced-motion: reduce`: no slides or hops (instant swap), no breathing, no move-in/out animation, loops
  stop on their final frame (as the sketch: paused at 8.4 s, so all three steps are filled and the key is in the
  field), gesture tiles show their key frame. All step text stays readable without motion. Character shows pose end frames.
  Lessons still work: a performed gesture swaps straight to the result frame; rehearsal clicks jump to each beat's
  end frame; the idle ghost-cursor demo is replaced by a static Marigold ring around the current target.
- Pausing: a root class `.paused` sets `animation-play-state: paused` on every loop, and the Animator idles, when
  the window blurs, `document.visibilityState === 'hidden'`, the key field has focus or a value, or after 3 full
  loops of the key explainer with no input (a "Play again" text button resumes). Resume on focus. Target: near-zero
  CPU when the guide sits in the background while the user is in the browser.

### 7.7 Lessons and rehearsal look (keeps the approved sketch)
- Active tile: full opacity, looping art, a 2 px Marigold inset ring (Classic: `#3a3a3a`). Waiting tiles: 45 %
  opacity, static first frame. Done: full opacity, static final frame, 18 px Marigold tick disc top-right with an Ink
  check. Skipped: 45 %, small "skipped" caption.
- Rehearsal targets inside the frame: the current one gets a pulsing tap ring (the sketch's ring, 1.2 s) and a
  Paper focus ring when focused; the others sit at 40 %. Step bars fill on each real click (300 ms ease-out), not on a timer.
- Practice field: inside the Ink frame, 1.5 px dashed Paper border at 60 %, "PRACTICE" tag (10 px, Marigold),
  practice key in Paper monospace. Real field: on Paper, solid 1.5 px Ink border, label "YOUR KEY" above it.
- Phase change: frame height 172 -> 96 px over 300 ms, then real controls fade in 200 ms; "NOW FOR REAL" label
  uppercase 12 px/600, Marigold underline. Reduced motion: instant.
- Paused loops (7.6) also pause the idle ghost cursor.

## 8. Edge cases and errors

| Case | Behaviour |
|---|---|
| Keychain refuses | Inline: "Your keychain wouldn't take the key. Try again." Linux adds "Paperclip needs a keyring such as GNOME Keyring or KWallet." Value kept for retry; `askSetKeyResult` returns Rust's fixed message, never the key. |
| Empty / spaces | Save disabled. |
| Spaces inside, non-ASCII, > 512 | "That doesn't look like an API key." (Rust's text) |
| Wrong prefix | Soft warning with Save anyway. |
| Opener fails | "I couldn't open your browser. Go to openrouter.ai/keys" as selectable text. |
| Offline | Step 1 note "You'll need to be online."; ask step shows the `offline` failure. |
| Opened while hidden | Moves in without a roll-up; stays hidden on close (`wasHidden`). |
| Asleep at open | Woken silently (`sleep.reset()`), then rolls up. |
| Provider or key changed from the tray while open | Forwarded / `ask-key-changed`; the tab and saved state follow. |

## 9. Provider facts (public docs, fetched 2026-11-26)

- OpenRouter: `openrouter.ai/keys`, keys `sk-or-v1-`; free allowance; free models 50 requests/day without credits
  (1,000 with 10+) per FAQ. Button label and whether sign-up asks for a card: **unverified**.
- Groq: `/keys` on console.groq.com; free tier, no card (Groq forum). "Create API Key", "shown once", `gsk_`: **unverified**.
- Anthropic (official docs): `platform.claude.com/settings/keys`, **Create key**, expiry + linked account, `sk-ant-`,
  shown once; prepaid credits needed (help centre).
- Risk outside this feature: unscoped keys must send `anthropic-workspace-id` per the API overview; `ask.rs` sends only
  `x-api-key`. Not changed here: the ask step surfaces the failure, and the Claude path is listed as unverified in the
  PR until someone tries it with a real key. The Claude tab ships.

## 10. Testing and verification

- **Vitest**: `flow` (order, bounds, labels, `initial()`, lessons in order, out-of-order gestures ignored, skip
  never blocks, forward turns primary only when a screen is done, rehearsal order and skip, phase starts `real` with a
  saved key, skip-key reaches `ask`); `stageKeys` (every lesson has a key); `providers` (`keyLooksRight` mirrors Rust,
  refuses practice keys, ids equal `AskProvider`); `askStep` (every `FailureKind` has a view with finish; freeModel offers);
  `copy`; `settings` (`guideSeen`, `isFreshStore`); `menuModel` (Presence children, 14 rows); `ask` (keyOffer);
  `content` (new kinds); `guest` (pure helpers in `src/agent/guest.ts`: hidden-before stays hidden, presenting
  stays auto-hidden, commands routed to the guide while away, `hidden` never persisted).
- **Rust**: `key_page_url` exact allowlist; `guide_url` rejects bad enums, drops bad model/outfit; `place()` clamps.
- **Browser, no Tauri**: `npm run dev`, `http://localhost:1420/welcome.html?sandbox&style=flat&screen=key&provider=groq`.
  Fake platform when `!('__TAURI_INTERNALS__' in window)`: Save resolves in 400 ms; `&fail=keychain|link`, `&hasKey=1`,
  `&ask=ok|unauthorized|outOfCredits|badModel|rateLimited|offline`, `&reduced=1`. Check both styles, all screens,
  Tab/Enter/Esc, tab arrows, pause on blur.
- **macOS manual** (`npm run tauri dev`, results in the PR): fresh-store first launch (roll-up, move-in, one Paperclip);
  Cmd+V; Cmd+Tab back; Dock icon comes and goes; close by Finish, Skip, red button, Cmd+W (he returns each time);
  tray click/toggle/joke while away; quit while away then relaunch; RSS before/during/10 s after (count WebContent
  processes); CPU about 0 % with the guide in the background. Windows and Linux smoke test.
- **Accessibility**: complete every lesson and the rehearsal with the keyboard only, and with VoiceOver on; heading
  focus per screen, `aria-live` lesson and step text, buttons for all actions, Esc = "Skip the tour" (Esc closes an
  open demo menu or ask box first), AA contrast. Reduced motion: every lesson and rehearsal step still completes.

## 11. Architect's calls

1. Window created on demand by Rust, destroyed on close: no memory cost when closed, no window permissions for JS.
2. Initial state rides in the URL query, validated in Rust; only main writes settings (one store owner).
3. Rust emits `ask-key-changed` and holds a fixed URL allowlist plus an `on_navigation` lock: no trust in JS for either.
4. New commands check the caller's window label; no app manifest yet (it would mean listing every main command).
5. macOS switches to Regular policy while the guide is open, so Cmd+Tab back from the browser works.
6. `guideSeen: 1`, written at move-out; fresh install = store had no values; upgraders hear one line, once [User].
7. Entry: Presence > "Welcome guide…" (menu and tray, row count unchanged) plus "Show me how" in the key ask.
8. Move-out is never a user hide: nothing persisted, presence untouched, prior hidden state restored on close.
9. Practice on the in-window Paperclip; drag slides him along his mat, and the tile says what drag does on the desktop.
10. The tray is the one gesture taught through the real system (main forwards the tray click).
11. The ask step skips local intents and uses the AI with one-exchange memory; no-key users get offline chips.
12. Soft prefix warning, never a hard block; "ILLUSTRATION" tag, no provider logos or colours.
13. Loops pause on blur, hidden, field focus, or after three idle loops (idle CPU budget).
14. Move-out/in rules live in pure helpers (`src/agent/guest.ts`) so they are unit-tested.
15. Lessons run one at a time in a fixed order; only the active one counts, every one can be skipped.
16. The stage reuses `attachInteraction`, so practice gestures have the desktop's exact timing (250/400 ms).
17. Keyboard equivalents on the focusable stage (Enter, D, arrows, Shift+F10) for every lesson.
18. The rehearsal is clickable inside the illustration with a fake PRACTICE key that is not an input, never stored,
    and refused by the real field; idle 4 s brings back the ghost-cursor demo for the current step only.
19. The ask box lesson keeps what was typed for the real ask on 5.5.

## 12. Open questions for the user

None. Decided **[User]**: skippers get offline joke/quote/tip buttons on the ask step; upgraders hear one balloon line.
Dock icon while the guide is open is accepted as an architect's call.
