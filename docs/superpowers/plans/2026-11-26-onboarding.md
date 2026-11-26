# Welcome Guide (Onboarding) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Chosen for this plan:** superpowers:executing-plans (Sonnet implements every task natively, in order, in one session).

**Goal:** A first-run welcome window. Paperclip moves into it from the desktop, teaches his gestures, menu and tray through hands-on lessons, rehearses getting an API key with a fake practice key, saves a real key to the keychain and answers a real question. Then he moves back out.

**Architecture:** A second Tauri webview (`welcome`), created on demand by Rust (`guide.rs`) and destroyed on close, with a least-privilege capability. All guide logic is pure TypeScript (`src/welcome/flow.ts` and friends) behind a thin DOM layer, and reuses the real `Renderer`, `Animator`, `attachInteraction`, `ContextMenu` and `LocalContentProvider`. The main window owns settings and the pet. It hides the pet while the guide is open ("guest away") and talks to the guide only through validated events.

**Tech Stack:** Tauri 2.12 (Rust), TypeScript 5, Vite 7 multi-page, Vitest 3 (node env; jsdom available), keyring 4, tauri-plugin-opener 2.7.

**Spec:** `docs/superpowers/specs/2026-11-26-onboarding-design.md` (read it before Task 1; section numbers below refer to it).

## Global Constraints

- Branch: `feature/onboarding` off `main`. Commit steps run **only if the user agreed at plan review**; otherwise skip every commit step and leave the changes in the working tree.
- Keys never readable from JS. Only Rust reads the keychain (`ask.rs`). Never log a key or put one in an error, a URL, an event or the clipboard.
- The practice keys (`sk-or-PRACTICE-not-a-real-key`, `gsk_PRACTICE-not-a-real-key`, `sk-ant-PRACTICE-not-a-real-key`) are display text, never sent or saved.
- URLs opened only from the Rust allowlist: `https://openrouter.ai/keys`, `https://console.groq.com/keys`, `https://platform.claude.com/settings/keys`.
- Main menu stays at 14 top-level rows (`src/ui/menuModel.test.ts`).
- Design tokens are only those in DESIGN.md: Ink `#18202E`, Paper `#F4F1EA`, Marigold `#F2B33D`, Ochre `#C98A1E`, divider `#2A3446`, Oswald 400/500/600. Classic: cream `#fff8c4`, `#3a3a3a`, `#f6f6f6`, `#8a8a8a`, system-ui.
- Copy is exactly the spec's copy (sections 5, 6.3, 6.6, 8). Paperclip is "he". No emojis.
- Budget: ~60 MB RSS, near-zero idle CPU. Loops pause on blur or hidden (spec 7.6).
- Gates for every task: `npm test`, `npm run typecheck`; and for Rust tasks also `cargo test --manifest-path src-tauri/Cargo.toml` and `npm run lint:rs`.
- Sandbox URL base: `npm run dev`, then `http://localhost:1420/welcome.html?sandbox` (plus the query keys in Task 10).

## Review Focus

1. A user pastes the practice key into the real field: it must be refused with the spec's message and never reach `ask_set_key` (Task 3 test `refuses practice keys`, Task 13 sandbox check).
2. The guide is closed with the red button mid-lesson, or the guide webview never loads: the pet must come back on the desktop and `hidden` must stay unsaved (Task 6 `returnPlan` tests, Task 15 timeout path).
3. A keyboard-only user on every lesson and rehearsal step: each one can be completed or skipped without a mouse (Task 5 `keyGesture` tests, Task 4 `skipLesson` tests, Task 16 manual run).
4. Pet hidden or auto-hidden (full screen) before the guide opens: on close a user hide stays hidden and an auto-hide is re-applied by presence (Task 6 tests).
5. Rapid repeat opens (menu twice, tray during roll-up): only one guide window and one roll-up (Task 9 `guide_open` exists-branch, Task 15 `guest !== 'none'` guard test via `routeCommand`).

---

### Task 1: Settings: `guideSeen`, fresh-store detection, Groq model restore

**Files:**
- Modify: `src/platform/settingsParse.ts:286-350` (Settings, DEFAULTS, parseSettings)
- Modify: `src/platform/settings.ts:141-152` (loadSettings key list; add loadSettingsWithMeta)
- Test: `src/platform/settings.test.ts`

**Interfaces:**
- Produces: `Settings.guideSeen: number`; `isFreshStore(raw: Record<string, unknown>): boolean` (settingsParse.ts); `loadSettingsWithMeta(): Promise<{ settings: Settings; fresh: boolean }>` (settings.ts); `loadSettings()` unchanged in signature.

- [ ] **Step 1: Create the branch** `git switch -c feature/onboarding` (skip if commits were declined; work on the current tree).
- [ ] **Step 2: Write failing tests** in `settings.test.ts`:

```ts
it('guideSeen defaults to 0 and keeps non-negative integers', () => {
  expect(parseSettings({}).guideSeen).toBe(0);
  expect(parseSettings({ guideSeen: 1 }).guideSeen).toBe(1);
  expect(parseSettings({ guideSeen: -1 }).guideSeen).toBe(0);
  expect(parseSettings({ guideSeen: 1.5 }).guideSeen).toBe(0);
  expect(parseSettings({ guideSeen: 'x' }).guideSeen).toBe(0);
});
it('isFreshStore is true only when every loaded value is undefined', () => {
  expect(isFreshStore({ quiet: undefined, style: undefined })).toBe(true);
  expect(isFreshStore({ quiet: undefined, style: 'flat' })).toBe(false);
  expect(isFreshStore({})).toBe(true);
});
```
- [ ] **Step 3: Run** `npx vitest run src/platform/settings.test.ts`. Expected: FAIL (`guideSeen` undefined, `isFreshStore` not exported).
- [ ] **Step 4: Implement.** Add `guideSeen` to `Settings` and `DEFAULTS` (0). Parse it with `Number.isInteger(v) && v >= 0 ? v : 0`. Export `isFreshStore`. In `settings.ts`, move the key list into `const KEYS = [...]` and add `'askGroqModel'` (the existing bug: it is parsed but never loaded) and `'guideSeen'`. Add `loadSettingsWithMeta()`, which reads the raw map once and returns `{ settings: parseSettings(raw), fresh: isFreshStore(raw) }`; if the store is unavailable it returns `{ settings: {...DEFAULTS}, fresh: false }` so a broken store never triggers first run. `loadSettings()` becomes `(await loadSettingsWithMeta()).settings`.
- [ ] **Step 5: Run** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 6: Commit** `git add src/platform && git commit -m "settings: guideSeen, fresh-store detection, restore askGroqModel"`

### Task 2: Content lines for the guide

**Files:**
- Create: `src/content/guide.json`
- Modify: `src/content/ask.json` (two `keyOffer` lines), `src/content/provider.ts:1-30` (imports, `ContentKind`, bags, `next()` cases)
- Test: `src/content/content.test.ts`

**Interfaces:**
- Produces: `ContentKind` gains `'askKeyOffer' | 'firstRun' | 'guideNews' | 'guideBack' | 'guideFailed'`; `AskLine` (src/agent/ask.ts) gains `'keyOffer'`.

- [ ] **Step 1: Write a failing test** `it('guide lines exist, are balloon-sized and say {provider} where needed')`. For each new kind, `await new LocalContentProvider(() => 0).next(kind)` returns non-empty text of at most 180 characters, and `askKeyOffer` text contains `{provider}`.
- [ ] **Step 2: Run** `npx vitest run src/content/content.test.ts`. Expected: FAIL (unknown kind).
- [ ] **Step 3: Implement.** `guide.json` is an array of `{kind, text}` with exactly these texts:
  - `firstRun`: "Hi! I'm Paperclip. Let me show you around."
  - `guideNews`: "New: a short guide. Right-click me, Presence, Welcome guide."
  - `guideBack`: "I'm back! Double right-click me whenever you want to ask something." and "Home sweet corner."
  - `guideFailed`: "Hmm, my guide wouldn't open. You can try again from the menu: Presence, Welcome guide."

  In `ask.json`, `keyOffer`: "I need a {provider} key for that. Want me to show you how to get one?" and "That one needs a {provider} key. I can walk you through it." Wire the bags in the `askBags` and a new `guideBags` record, following the existing `fileBags` pattern.
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `git add src/content src/agent/ask.ts && git commit -m "content: guide lines and key offer"`

### Task 3: Provider guide data, key check, copy

**Files:**
- Create: `src/welcome/providers.ts`, `src/welcome/copy.ts`
- Test: `src/welcome/providers.test.ts`, `src/welcome/copy.test.ts`

**Interfaces:**
- Consumes: `AskProvider`, `MAX_KEY_CHARS` (512) from `src/agent/ask.ts`.
- Produces:
```ts
export type Platform = 'macos' | 'windows' | 'linux';
export interface ProviderGuide { id: AskProvider; tab: string; host: string; signInTitle: string; createLabel: string;
  steps: [string, string, string]; note: string; prefix: string; keyRow: string; flyChip: string;
  practiceKey: string; placeholder: string; name: string }
export const PROVIDER_GUIDES: Record<AskProvider, ProviderGuide>;
export type KeyCheck = 'empty' | 'invalid' | 'practice' | 'unexpectedPrefix' | 'ok';
export function keyLooksRight(p: AskProvider, raw: string): KeyCheck;
export function keyCheckMessage(p: AskProvider, c: KeyCheck): string | null;
// copy.ts
export const COPY: { hello: {...}; try: {...}; menus: {...}; key: {...}; ask: {...}; footer: {...} };
export function trayLine(p: Platform): string;
```

- [ ] **Step 1: Write failing tests**:
```ts
it('has the spec data for each provider', () => {
  expect(PROVIDER_GUIDES.openrouter.host).toBe('openrouter.ai/keys');
  expect(PROVIDER_GUIDES.groq.host).toBe('console.groq.com/keys');
  expect(PROVIDER_GUIDES.anthropic.host).toBe('platform.claude.com/settings/keys');
  expect(PROVIDER_GUIDES.groq.createLabel).toBe('Create API key');
  expect(Object.keys(PROVIDER_GUIDES).sort()).toEqual(['anthropic', 'groq', 'openrouter']);
});
it('keyLooksRight mirrors Rust validate_key', () => {
  expect(keyLooksRight('openrouter', '   ')).toBe('empty');
  expect(keyLooksRight('openrouter', 'sk-or-a b')).toBe('invalid');
  expect(keyLooksRight('openrouter', 'sk-or-é')).toBe('invalid');
  expect(keyLooksRight('openrouter', 'sk-or-' + 'a'.repeat(507))).toBe('invalid'); // 513 chars
  expect(keyLooksRight('openrouter', '  sk-or-v1-abc  ')).toBe('ok');
});
it('refuses practice keys', () => {
  for (const p of ['openrouter', 'groq', 'anthropic'] as const) expect(keyLooksRight(p, PROVIDER_GUIDES[p].practiceKey)).toBe('practice');
  expect(keyCheckMessage('openrouter', 'practice')).toBe("That's the practice key. Paste the one you copied from OpenRouter.");
});
it('soft prefix warning', () => {
  expect(keyLooksRight('groq', 'sk-or-v1-abc')).toBe('unexpectedPrefix');
  expect(keyCheckMessage('openrouter', 'unexpectedPrefix')).toBe("That doesn't look like an OpenRouter key (they start with sk-or-). Save anyway?");
});
```
  `copy.test.ts`: `trayLine('macos')` contains "menu bar", `trayLine('windows')` contains "system tray, bottom right", `trayLine('linux')` contains "if your desktop shows one". Every COPY string is non-empty, and none contains "Clippy".
- [ ] **Step 2: Run** `npx vitest run src/welcome`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement.** Use the values from the spec 5.4 table and 7.4. The order is: trim; empty; practice (`includes('PRACTICE')`); invalid (length > `MAX_KEY_CHARS` or not all ASCII graphic, `/^[\x21-\x7e]+$/`); prefix; ok. `invalid` message is "That doesn't look like an API key." `name` comes from `providerName()` in ask.ts. Copy every spec string from sections 5.1-5.5 into `COPY`.
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `git add src/welcome && git commit -m "welcome: provider guide data, key check, copy"`

### Task 4: Guide flow state machine (screens, lessons, rehearsal)

**Files:**
- Create: `src/welcome/flow.ts`
- Test: `src/welcome/flow.test.ts`

**Interfaces:**
- Consumes: `Platform` (Task 3), `AskProvider`, `normalizeAskProvider`.
- Produces exactly the spec 6.5 block, with these concrete types:
```ts
export type Screen = 'hello' | 'try' | 'menus' | 'key' | 'ask';
export const SCREENS: readonly Screen[];
export type Lesson = 'click' | 'doubleClick' | 'drag' | 'contextMenu' | 'menuPick' | 'askBox' | 'tray';
export const LESSONS: { try: readonly Lesson[]; menus: readonly Lesson[] };
export type LessonState = 'todo' | 'done' | 'skipped';
export type RehearsalStep = 'signIn' | 'createKey' | 'copy' | 'paste';
export const REHEARSAL: readonly RehearsalStep[];
export interface GuideState { screen: Screen; provider: AskProvider; platform: Platform;
  lessons: Record<Lesson, LessonState>; keyPhase: 'rehearse' | 'real'; rehearsal: RehearsalStep | 'done';
  keySaved: Record<AskProvider, boolean>; asked: boolean; draftQuestion: string }
export function initial(q: URLSearchParams, keySaved: Record<AskProvider, boolean>): GuideState;
export function next(s: GuideState): GuideState; export function back(s: GuideState): GuideState;
export function goto(s: GuideState, screen: Screen): GuideState;
export function activeLesson(s: GuideState): Lesson | null;
export function perform(s: GuideState, l: Lesson): GuideState;
export function skipLesson(s: GuideState): GuideState;
export function screenDone(s: GuideState): boolean;
export function rehearse(s: GuideState, step: RehearsalStep): GuideState;
export function skipRehearsal(s: GuideState): GuideState;
export function setProvider(s: GuideState, p: AskProvider): GuideState;
export function markKeySaved(s: GuideState, p: AskProvider): GuideState;
export function markAsked(s: GuideState): GuideState;
export function setDraft(s: GuideState, text: string): GuideState;
export function forward(s: GuideState): { label: string; primary: boolean };
```
All functions are pure and return new objects.

- [ ] **Step 1: Write failing tests** (one `it` each):
  - `initial` reads `start=key`, `provider=groq`, `platform=windows`; bad values fall back to `hello` / `openrouter` / `macos`.
  - Lessons run in order: on `try`, `activeLesson` is `'click'`; `perform(s,'doubleClick')` leaves it `'click'` and unchanged; `perform(s,'click')` makes it `'doubleClick'`.
  - `skipLesson` marks `skipped` and advances; after four skips `screenDone` is true and `activeLesson` is null.
  - `forward` on `try`: `{label:'Skip ›', primary:false}` until done, then `{label:'Next ›', primary:true}`. On `hello`: `{label:"Let's go ›", primary:true}`. On `key` without a key: `{label:'Skip for now ›', primary:false}`; with a key: `Next ›` primary. On `ask`: `{label:'Finish ›', primary: s.asked}`.
  - `next` from `try` works whether or not the lessons are done (never a trap); `back` on `hello` is a no-op; `next` on `ask` is a no-op.
  - Rehearsal: `keyPhase` is `'rehearse'` and `rehearsal` is `'signIn'`; `rehearse(s,'copy')` is ignored; the `signIn, createKey, copy, paste` sequence ends with `rehearsal:'done'` and `keyPhase` still `'rehearse'` until `next`-like `skipRehearsal` moves it to `'real'`.
  - `initial` with `keySaved.openrouter = true` starts `keyPhase:'real'`; `setProvider(s,'groq')` keeps the phase and rehearsal step; `markKeySaved(s,'groq')` sets `keyPhase:'real'`.
  - `perform(s,'tray')` counts only while `screen==='menus'` and `tray` is active.
- [ ] **Step 2: Run** `npx vitest run src/welcome/flow.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** in `src/welcome/flow.ts`. `rehearsal:'done'` leaves the phase as is; the DOM calls `skipRehearsal` when the user presses "Now for real" or the skip link. `screenDone` is true for `hello`, `key` and `ask` (only `try`/`menus` have lessons).
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `git add src/welcome/flow* && git commit -m "welcome: flow state machine with lessons and rehearsal"`

### Task 5: Keyboard gestures and the ask-step view

**Files:**
- Create: `src/welcome/stageKeys.ts`, `src/welcome/askStep.ts`
- Test: `src/welcome/stageKeys.test.ts`, `src/welcome/askStep.test.ts`

**Interfaces:**
- Consumes: `Lesson` (Task 4), `AskResult`, `AskProvider`, `FailureKind` (src/agent/ask.ts).
- Produces:
```ts
export type StageKey = 'click' | 'doubleClick' | 'dragLeft' | 'dragRight' | 'flingLeft' | 'flingRight' | 'contextMenu';
export function keyGesture(e: { key: string; shiftKey: boolean }): StageKey | null;
export const DOUBLE_CONTEXT_MS = 400;
export function lessonKeyHint(l: Lesson): string | null;   // "Keyboard: press D"
// askStep.ts
export type AskAction = 'retry' | 'fixKey' | 'otherService' | 'freeModel' | 'backToInput' | 'finish';
export type AskView = { kind: 'input' } | { kind: 'thinking' } | { kind: 'answer'; text: string }
  | { kind: 'failure'; message: string; actions: AskAction[]; retryAfterMs: number };
export function viewFor(r: AskResult, provider: AskProvider): AskView;
```
- [ ] **Step 1: Write failing tests:**
  - `keyGesture({key:'Enter',shiftKey:false})` and `' '` give `'click'`; `'d'`/`'D'` give `'doubleClick'`; `'ArrowLeft'` gives `'dragLeft'`; Shift+`'ArrowRight'` gives `'flingRight'`; `'ContextMenu'` and Shift+`'F10'` give `'contextMenu'`; `'x'` gives null.
  - `lessonKeyHint('doubleClick') === 'Keyboard: press D'`, and every `try`/`menus` lesson except `tray` has a hint.
  - The spec 6.6 table, one assertion per row: `unauthorized` shows "That key didn't work. Want to try a different one?" with `['fixKey','finish']`; `outOfCredits` on openrouter gives `['otherService','freeModel','finish']` and on groq has no `freeModel`; `badModel` gives `['freeModel','finish']`; `rateLimited` gives `retryAfterMs` 10000 and `offline` gives 0; `tooLong` gives `['backToInput','finish']`; `noKey` gives `['fixKey','finish']`; every `FailureKind` includes `finish`; ok gives `{kind:'answer'}`.
- [ ] **Step 2: Run** `npx vitest run src/welcome`. Expected: FAIL.
- [ ] **Step 3: Implement** both modules (a `switch` over `FailureKind` that covers every case, so TypeScript checks it is exhaustive).
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `git add src/welcome && git commit -m "welcome: keyboard gestures and ask-step view"`

### Task 6: Guest rules, Presence hooks, `Agent.hide(exit)`

**Files:**
- Create: `src/agent/guest.ts`; Test: `src/agent/guest.test.ts`
- Modify: `src/agent/presence.ts:54-150` (add two methods); Test: `src/agent/presence.test.ts`
- Modify: `src/agent/agent.ts:15-25,105,215-218` (hide option); Test: `src/agent/agent.test.ts`

**Interfaces:**
- Produces:
```ts
export type Guest = 'none' | 'leaving' | 'away' | 'returning';
export const GUIDE_FOCUS_COMMANDS: ReadonlySet<string>; // spec 6.3 list + 'tray-click','toggle','ask-model-other','ask-groq-other'
export function routeCommand(guest: Guest, id: string): 'focusGuide' | 'run';
export function returnPlan(c: { wasHidden: boolean; fullscreen: boolean; hideWhenPresenting: boolean }): 'stayHidden' | 'adoptAutoHide' | 'show';
// Presence
isAutoHidden(): boolean;   // returns hiddenByMe
adoptHidden(): void;       // hiddenByMe = true
// Agent
hide(exit?: AnimName): Promise<void>;
```
- [ ] **Step 1: Write failing tests:**
  - `routeCommand('none','joke') === 'run'`. `routeCommand('away','joke') === 'focusGuide'`, and the same for `tray-click`, `focus-25`, `water-now`, `ask-model-other`. `routeCommand('away','style-flat') === 'run'`, and the same for `quiet`, `ask-provider-groq`, `quit`. `routeCommand('leaving','hi') === 'focusGuide'`.
  - `returnPlan({wasHidden:true, ...})` gives `'stayHidden'`; `{wasHidden:false, fullscreen:true, hideWhenPresenting:true}` gives `'adoptAutoHide'`; full screen with hideWhenPresenting off gives `'show'`.
  - Presence: after `adoptHidden()`, `isAutoHidden()` is true and the end of full screen (`update` with `fullscreen:false`) returns a `show` reaction.
  - Agent: `hide('ExitRollUp')` plays `ANIMATIONS.ExitRollUp`. Check it with the existing test animator stub in agent.test.ts, which records the played animation.
- [ ] **Step 2: Run** `npx vitest run src/agent`. Expected: FAIL.
- [ ] **Step 3: Implement.** In agent.ts the action becomes `{ type: 'hide'; exit?: AnimName }`, and `hide(exit)` plays `exit ?? this.pickOf(this.exits)`.
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `git add src/agent && git commit -m "agent: guest routing rules, presence adoptHidden, hide with a chosen exit"`

### Task 7: Menu entry and the "Show me how" key offer

**Files:**
- Modify: `src/ui/menuModel.ts:74-80` (Presence children); Test: `src/ui/menuModel.test.ts:80`
- Modify: `src/agent/ask.ts:96-120` (`AskDeps.openGuide?`), `ask.ts:259-277` (`enterKey`); Test: `src/agent/ask.test.ts`

**Interfaces:**
- Produces: menu id `guide-open`, label `Welcome guide…`; `AskDeps.openGuide?(start: 'key'): void`.

- [ ] **Step 1: Write failing tests:**
  - menuModel: Presence children equal `['presence-hide','presence-music','update-check','guide-open']`, `guide-open` has the label `'Welcome guide…'`, and there are still 14 top-level rows.
  - ask: with `openGuide` present and no key, asking a question that needs the AI calls `choose` with the actions `guide` / `paste` / `done`. `guide` calls `openGuide('key')` and never prompts. `paste` prompts for the key as today. `done` ends the flow. Without `openGuide` the behaviour is unchanged. `setKey()` (menu) never shows the offer.
- [ ] **Step 2: Run** `npx vitest run src/ui/menuModel.test.ts src/agent/ask.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** In `enterKey(stale, confirm)`: when `!confirm && this.deps.openGuide`, `await this.deps.choose(await this.deps.line('keyOffer'), [{id:'guide',label:'Show me how'},{id:'paste',label:'I have a key'},{id:'done',label:'Not now'}])` before the prompt. Add `'keyOffer'` to `AskLine`.
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `git commit -am "menu: Welcome guide entry; ask: offer the guide when a key is missing"`

### Task 8: Rust pure helpers in `guide.rs`

**Files:**
- Create: `src-tauri/src/guide.rs` (helpers and `#[cfg(test)] mod tests` only in this task)
- Modify: `src-tauri/src/lib.rs:1` (`mod guide;`), `src-tauri/src/ask.rs:32-33` (`HAIKU`, `SONNET` become `pub(crate) const`)

**Interfaces:**
- Consumes: `ask::valid_model_id`, `ask::valid_groq_model_id` (already `pub`, ask.rs:143,155).
- Produces:
```rust
pub const LABEL: &str = "welcome";
#[derive(serde::Deserialize, Default)] pub struct GuideModels { pub openrouter: Option<String>, pub groq: Option<String>, pub claude: Option<String> }
pub(crate) struct GuideQuery<'a> { pub style: &'a str, pub provider: &'a str, pub start: &'a str, pub outfit: Option<&'a str>, pub models: &'a GuideModels, pub platform: &'static str }
pub(crate) fn key_page_url(provider: &str) -> Option<&'static str>;
pub(crate) fn guide_url(q: &GuideQuery) -> Result<String, String>;
pub(crate) fn place(work: (f64, f64, f64, f64), size: (f64, f64)) -> (f64, f64); // (x,y,w,h) physical px
pub(crate) fn nav_allowed(url: &str, debug: bool) -> bool;
pub(crate) fn platform() -> &'static str;
```
- [ ] **Step 1: Write failing tests** in `guide.rs`:
  - `key_page_url("openrouter")` is `Some("https://openrouter.ai/keys")`, and likewise for groq and anthropic; `""`, `"OPENROUTER"` and `"https://evil"` give `None`.
  - `guide_url` with style `flat`, provider `groq`, start `key`, platform `macos` gives `"welcome.html?style=flat&provider=groq&start=key&platform=macos"` (models omitted when `None`). A bad style, provider or start gives `Err`. An invalid OpenRouter model (`"bad id"`) is dropped. A valid `"openai/gpt-oss-120b"` appears as `&orModel=openai/gpt-oss-120b`. Groq `"qwen/qwen3.8-27b"` appears as `&groqModel=`. Claude accepts only `claude-haiku-5-5` and `claude-sonnet-5-5` (`&claudeModel=`). An outfit outside `none|santa-hat|party-hat|heart|pumpkin|shamrock` is dropped.
  - `place((0.,0.,2880.,1800.),(1280.,1040.)) == (800.,380.)`; a work area smaller than the window clamps to the work area origin.
  - `nav_allowed("tauri://localhost/welcome.html", false)` and `"http://tauri.localhost/x"` are true; `"http://localhost:1420/welcome.html"` is true only when `debug`; `"https://openrouter.ai/keys"` is false.
- [ ] **Step 2: Run** `cargo test --manifest-path src-tauri/Cargo.toml guide`. Expected: FAIL (compile errors on missing fns).
- [ ] **Step 3: Implement.** Model ids use only URL-safe characters (validated), so no percent-encoding is needed; still reject any value containing `&`, `=` or `#` before building.
- [ ] **Step 4: Run** `cargo test --manifest-path src-tauri/Cargo.toml && npm run lint:rs`. Expected: PASS, no warnings (mark helpers `#[allow(dead_code)]` only until Task 9 uses them, then remove).
- [ ] **Step 5: Commit** `git add src-tauri && git commit -m "guide.rs: allowlist, URL builder, placement, navigation check"`

### Task 9: Rust commands, window, capability, key event, tray item

**Files:**
- Modify: `src-tauri/src/guide.rs` (commands), `src-tauri/src/lib.rs:28-58` (on_window_event, invoke_handler), `src-tauri/src/ask.rs:662-682` (`ask_set_key`, `ask_remove_key` gain `app: tauri::AppHandle` and emit), `src-tauri/src/tray.rs:148-153` (item `guide-open` "Welcome guide…" appended to the Presence submenu)
- Create: `src-tauri/capabilities/welcome.json`

**Interfaces:**
- Produces commands (JS names, camelCase args):
  - `guide_open({ style, provider, models: {openrouter?, groq?, claude?}, start, outfit? }) -> ()`. Errors if the caller is not `main`.
  - `guide_open_key_page({ provider }) -> ()`. Errors if the caller is not `welcome`.
- Events: `ask-key-changed` (payload: provider id string, app-wide); `guide-state` `{ open: false }` to `main` on `Destroyed`; `guide:goto` `{ start }` to `welcome` when it already exists.

- [ ] **Step 1: Implement `guide_open`** as `pub async fn guide_open(app: AppHandle, window: WebviewWindow, style: String, provider: String, models: GuideModels, start: String, outfit: Option<String>) -> Result<(), String>`, following spec 6.2:
  - If the `welcome` window exists, run its `unminimize`, `show` and `set_focus`, emit `guide:goto`, and return.
  - Otherwise use `WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::App(guide_url(..)?.into()))` with `.title("Welcome to Paperclip")`, `.inner_size(640.0, 520.0)`, `.resizable(false)`, `.maximizable(false)`, `.visible(false)` and `.on_navigation(|u| nav_allowed(u.as_str(), cfg!(debug_assertions)))`. On macOS also add `.title_bar_style(tauri::TitleBarStyle::Overlay)` and `.hidden_title(true)`.
  - Position from `window.current_monitor()` and `work_area()` via `place`, using `PhysicalPosition`.
  - Then call `app.set_activation_policy(tauri::ActivationPolicy::Regular)` on macOS, `show` and `set_focus`.
- [ ] **Step 2: Implement `guide_open_key_page`** with `tauri_plugin_opener::open_url(url, None::<&str>)`. Map errors to the string "I couldn't open your browser."
- [ ] **Step 3: Implement `pub fn on_window_event(window: &tauri::Window, event: &tauri::WindowEvent)`.** It only acts when `window.label() == LABEL` and the event is `Destroyed`. Then it calls `set_activation_policy(Accessory)` on macOS and `app.emit_to("main", "guide-state", json!({"open": false}))`. Call it from the existing `.on_window_event` in lib.rs, next to the DragDrop branch. Register both commands.
- [ ] **Step 4: Emit the key event.** In ask.rs, after `Ok` in `ask_set_key` and `ask_remove_key`, call `let _ = app.emit("ask-key-changed", p_str)` (the provider id string), with `use tauri::Emitter`. The JS call sites need no change (Tauri injects `AppHandle`).
- [ ] **Step 5: Add the capability.** Create `welcome.json`: identifier `welcome`, `windows: ["welcome"]`, permissions `core:event:allow-listen`, `core:event:allow-unlisten`, `core:event:allow-emit-to`, `core:window:allow-close`, `core:window:allow-start-dragging`.
- [ ] **Step 6: Add the tray item.** In tray.rs, add `MenuItem::with_id(app, "guide-open", "Welcome guide…", true, None::<&str>)` after `update_check` in the Presence submenu. It is handled by the generic `_ =>` emit branch.
- [ ] **Step 7: Run** `cargo test --manifest-path src-tauri/Cargo.toml && npm run lint:rs`. Expected: PASS. Remove the Task 8 `dead_code` allows.
- [ ] **Step 8: Commit** `git add src-tauri && git commit -m "guide: window commands, capability, key-changed event, tray entry"`

### Task 10: Welcome window shell and browser sandbox

**Files:**
- Create: `welcome.html`, `src/welcome/main.ts`, `src/welcome/platform.ts`, `src/welcome/screens.ts`, `src/welcome/welcome.css`, `src/fonts.css`
- Modify: `vite.config.ts` (rollup input), `src/styles.css:1-17` (move the @font-face blocks to `src/fonts.css` and `@import` it), `index.html` (unchanged unless the import needs a link)

**Interfaces:**
- Consumes: Tasks 3-5.
- Produces:
```ts
export interface GuidePlatform {
  keyStatus(p: AskProvider): Promise<boolean>;
  saveKey(key: string, p: AskProvider): Promise<{ ok: true } | { ok: false; message: string }>;
  openKeyPage(p: AskProvider): Promise<boolean>;
  ask(q: string, history: Turn[], model: string | null, p: AskProvider): Promise<AskResult>;
  toMain(ev: 'guide:ready' | 'guide:provider' | 'guide:style' | 'guide:finished', payload?: unknown): Promise<void>;
  onFromMain(cb: (ev: string, payload: unknown) => void): Promise<void>;
  onKeyChanged(cb: (p: AskProvider) => void): Promise<void>;
  close(): Promise<void>;
}
export function createPlatform(q: URLSearchParams): GuidePlatform; // fake when !('__TAURI_INTERNALS__' in window)
export function render(root: HTMLElement, s: GuideState, ui: UiHandlers): void; // screens.ts
```
- [ ] **Step 1: Vite.** Set `build.rollupOptions.input = { main: fileURLToPath(new URL('./index.html', import.meta.url)), welcome: fileURLToPath(new URL('./welcome.html', import.meta.url)) }`. Keep the existing `test` block.
- [ ] **Step 2: Shell.** Write `welcome.html`: `<html data-style>`, `<div id="guide"><aside class="stage"><div id="character"></div></aside><main class="pane" aria-live="polite"></main><footer class="foot"></footer></div>`, a visually hidden `#announce` live region, and a 28 px `data-tauri-drag-region` strip.
- [ ] **Step 3: Platform.** The Tauri implementation uses `invoke`, `emitTo`, `listen` and `getCurrentWindow().close()`, and reuses `askQuestion` from `src/platform/tauri.ts`. The fake reads query flags: `fail=keychain|link`, `hasKey=1`, `ask=ok|unauthorized|outOfCredits|badModel|rateLimited|offline`, `reduced=1`. Fake save resolves after 400 ms, and fake ask after 900 ms with "Paperclips were patented in 1867. I'm a classic." for `ok`.
- [ ] **Step 4: Screens.** `screens.ts` renders the text-only skeleton of all five screens from `COPY` and the footer (Back, a placeholder chain with five spans, forward from `forward(s)`). `main.ts` reads `?screen=` in the sandbox via `goto`, sets `data-style` from `?style=`, sets focus to the screen heading on change, and binds Esc to close.
- [ ] **Step 5: Verify** `npm run typecheck && npm test`, then `npm run dev`. Open `http://localhost:1420/welcome.html?sandbox&screen=hello` and step through all five screens with Next/Back. Expected: copy matches spec 5.x, focus lands on each heading, and there are no console errors. `npm run build` emits `dist/welcome.html`.
- [ ] **Step 6: Commit** `git add -A welcome.html src/welcome src/fonts.css src/styles.css vite.config.ts && git commit -m "welcome: window shell, platform adapter, sandbox"`

### Task 11: The stage Paperclip (host, gestures, demo menu, ask box)

**Files:**
- Create: `src/welcome/stage.ts`; Modify: `src/welcome/welcome.css`, `src/welcome/main.ts`

**Interfaces:**
- Consumes: `Renderer(container, style, scope)`, `Renderer.setStyle/setOutfit/render/eyeCentres`; `Animator({ render, reducedMotion })` with `play(ANIMATIONS[name])`; `attachInteraction(target, handlers, startDragging)` and `characterHitTarget`; `ContextMenu(el, onPick, onVisibility)` with `open(x, y, items)`; `LocalContentProvider().next(kind)`; `computeTarget` and `pupilOffset` from `src/agent/eyeFollow.ts`; `keyGesture` (Task 5).
- Produces:
```ts
export interface Stage {
  play(name: AnimName): Promise<void>;
  say(text: string): void;                      // writes into the pane balloon
  setStyle(s: Style): void; setOutfit(o: OutfitName): void;
  onGesture(cb: (l: Lesson) => void): void;     // click, doubleClick, drag, contextMenu, menuPick, askBox
  openAskBox(onSend: (text: string) => void): void;
  pause(on: boolean): void;
  destroy(): void;
}
export function createStage(host: HTMLElement, opts: { style: Style; outfit: OutfitName; reducedMotion: boolean; demoMenuEl: HTMLElement }): Stage;
```
- [ ] **Step 1: Implement** spec 6.5 "Stage practice" and the keyboard section of 5.3:
  - Host `tabindex=0`, `role=button`, `aria-label="Paperclip, practice here"`.
  - Click starts 4 s of in-window eye follow on `mousemove`.
  - Double-click shows a joke.
  - The drag `startDragging` callback tracks `mousemove`/`mouseup` on `document`, translates the character along x within the stage, and on release plays `Fling` then `Thud` when speed is above 1.2 px/ms.
  - Right-click opens the demo menu: `hi`, `joke`, `quote`, `style` > `style-classic`/`style-flat`, and the disabled row "The full menu is on the desktop.".
  - `openAsk` triggers `askBox`. Picking a menu item fires `menuPick`.
  - The `keydown` handler maps `keyGesture` onto the same handlers. Two `contextMenu` presses within `DOUBLE_CONTEXT_MS` (400 ms) open the ask box.
  - The mat is recoloured Paper in Flat (spec 7.1). Breathing uses CSS. Screen change hops via `Jump`, and the window opens with `EnterSlide` then `Greeting`.
- [ ] **Step 2: Verify** with `npm run dev` at `http://localhost:1420/welcome.html?sandbox&screen=try&style=flat`. Expected: his eyes follow after a click, a double-click shows a joke, drag slides and lands, right-click opens the menu, a double right-click opens the ask box. With keyboard only (Tab to him, then Enter, D, the arrows and Shift+F10), the same results happen. Repeat with `&style=classic`. Then load `&reduced=1`: no breathing, and every gesture still shows its result.
- [ ] **Step 3: Commit** `git add src/welcome && git commit -m "welcome: stage Paperclip with pointer and keyboard gestures"`

### Task 12: Lessons on screens 5.1-5.3 (tiles, ticks, chain)

**Files:**
- Create: `src/welcome/explainers.ts` (gesture tile markup and CSS keyframes for the four 3 s loops, and the mini clip)
- Modify: `src/welcome/screens.ts`, `src/welcome/welcome.css`, `src/welcome/main.ts`

**Interfaces:**
- Consumes: `Stage.onGesture` -> `perform(s, l)`; `activeLesson`, `skipLesson`, `lessonKeyHint`; `trayLine(platform)`; platform `onFromMain('guide:tray')` -> `perform(s,'tray')`.
- Produces: `gestureTile(l: Lesson, state: LessonState, active: boolean): string` (explainers.ts).

- [ ] **Step 1: Implement** the spec 5.2/5.3 and 7.7 visuals:
  - The 2x2 grid uses the sketch's sizes. The active tile loops and has a Marigold inset ring. Waiting tiles sit at 45 % and are static. Done tiles show the tick disc.
  - The balloon line follows each lesson. Next activates 600 ms after a tick.
  - "Skip this one" link; footer forward from `forward(s)` (ghost until done, then the Marigold "Next ›").
  - The `#announce` text reads "Lesson 2 of 4: double-click Paperclip, or press D."
  - The menus screen has three rows, and the tray row uses `trayLine`.
  - The paperclip chain uses the sketch's clip SVG path, rotated 90°: done and current Marigold, current scaled 1.18.
- [ ] **Step 2: Verify** in the sandbox at `?sandbox&screen=try`:
  - All four lessons by mouse tick in order, and an out-of-order gesture does not tick.
  - All four by keyboard tick the same way.
  - "Skip this one" four times makes the forward the Marigold "Next ›".
  - At `?sandbox&screen=menus`, picking Tell a joke completes lesson 1 and a double right-click completes lesson 2.
  - In the sandbox the tray lesson only skips. Add a dev-only button "Simulate tray click", rendered only when `sandbox` is set, that calls `perform(s,'tray')`.
  - Check `&style=classic` and `&reduced=1`.
- [ ] **Step 3: Commit** `git add src/welcome && git commit -m "welcome: hands-on lessons for gestures, menu and tray"`

### Task 13: Key screen: rehearsal, now for real, tabs, loop, pausing

**Files:**
- Create: `src/welcome/rehearsal.ts`
- Modify: `src/welcome/explainers.ts` (key explainer frame, three provider variants, 9 s keyframes from spec 7.3), `src/welcome/screens.ts`, `src/welcome/welcome.css`, `src/welcome/main.ts`

**Interfaces:**
- Consumes: `rehearse`, `skipRehearsal`, `setProvider`, `markKeySaved`; `PROVIDER_GUIDES`, `keyLooksRight`, `keyCheckMessage`; platform `saveKey`, `openKeyPage`, `keyStatus`, `toMain('guide:provider')`, `onKeyChanged`.
- Produces: `renderRehearsal(el: HTMLElement, s: GuideState, onStep: (st: RehearsalStep) => void, opts: { reducedMotion: boolean }): { destroy(): void }`; `explainerFrame(p: AskProvider, mode: 'rehearse' | 'summary'): string`.

- [ ] **Step 1: Implement phase 1** (spec 5.4):
  - The frame holds real `<button>`s for Sign in, Create key and Copy, and the dashed practice box (a `<button>` labelled "PRACTICE: click to paste", never an `<input>`).
  - Only the current target is enabled. A click plays that beat and fills its step bar.
  - After 4 s idle the ghost cursor demonstrates the current beat only, repeating every 8 s. Under reduced motion a static ring shows instead.
  - "I know how, skip practice" calls `skipRehearsal`, and so does "Now for real ›" after `paste`.
- [ ] **Step 2: Implement phase 2**:
  - Frame shrinks to the 96 px summary and the "NOW FOR REAL" label appears.
  - "Open the keys page ↗" calls `openKeyPage`; on failure show "I couldn't open your browser. Go to {host}" as selectable text.
  - Real field per spec (password, eye toggle, max 512, Enter = Save). Save runs `keyLooksRight` first. `practice` and `invalid` show the message. `unexpectedPrefix` shows [Save anyway] [Fix it].
  - On success, clear the field, show "Saved to your keychain.", play `Congratulate`, and call `markKeySaved`.
  - On a keychain error show "Your keychain wouldn't take the key. Try again." (Linux adds the keyring sentence) and keep the value.
  - The "already saved" state shows [Replace key].
- [ ] **Step 3: Tabs** use `role=tablist` with arrow keys and call `setProvider` plus `toMain('guide:provider')`. Pausing (spec 7.6) adds `.paused` on `window` blur, `visibilitychange` to hidden, field focus or value, and after 3 idle loops ("Play again").
- [ ] **Step 4: Verify** in the sandbox at `?sandbox&screen=key`:
  - Mouse rehearsal through all four steps.
  - Keyboard rehearsal (Tab reaches only the current target).
  - Idle 4 s shows the ghost demo.
  - The skip link goes straight to phase 2.
  - Pasting `sk-or-PRACTICE-not-a-real-key` into the real field is refused.
  - `&fail=keychain` shows the keychain message, `&fail=link` shows the address text, `&hasKey=1` starts in phase 2 with "already saved".
  - The Groq and Claude tabs swap host, label and chip, and Claude shows the credits note.
  - Blurring the window pauses the loops (DevTools Performance shows no animation frames).
  - `&style=classic` and `&reduced=1` both work.
- [ ] **Step 5: Commit** `git add src/welcome && git commit -m "welcome: key rehearsal with practice key, real key step, provider tabs"`

### Task 14: Ask screen, finish, Classic and reduced-motion pass

**Files:**
- Modify: `src/welcome/screens.ts`, `src/welcome/main.ts`, `src/welcome/welcome.css`

**Interfaces:**
- Consumes: `viewFor`, `AskHistory` (src/agent/ask.ts, one exchange), platform `ask`, `LocalContentProvider.next('joke'|'quote'|'tip')`, `markAsked`, `GuideState.draftQuestion` (set by the 5.3 ask box via `setDraft`), `toMain('guide:finished', {keySaved, asked})`, `Stage.play('ExitRollUp')`, `platform.close()`.

- [ ] **Step 1: Implement** spec 5.5 and 6.6:
  - With a key: an input prefilled from `draftQuestion` and the three chips; `Thinking` plays while waiting.
  - On an answer, show [Ask another] and `markAsked`. Each failure view's actions map to `goto('key')`, retry (disabled for `retryAfterMs`), `freeModel` (retry with model null) and finish.
  - Without a key: offline chips and "Add a key after all".
  - Finish and Skip-the-tour emit `guide:finished`, play `ExitRollUp` (skipped under reduced motion), then close.
- [ ] **Step 2: Verify** in the sandbox at `?sandbox&screen=ask&hasKey=1&ask=ok`: an answer appears. Then each of `ask=unauthorized|outOfCredits|badModel|rateLimited|offline` shows the 6.6 action set. Without `hasKey`, the chips answer offline. Run the whole guide end to end in both styles and with `&reduced=1`, keyboard only. Run `npm test && npm run typecheck`.
- [ ] **Step 3: Commit** `git add src/welcome && git commit -m "welcome: real ask step, finish and exit"`

### Task 15: Main-window integration (move out, move in, first run, routing)

**Files:**
- Modify: `src/platform/tauri.ts` (wrappers), `src/main.ts:52-75` (settings via `loadSettingsWithMeta`), `main.ts:480-510` (hide/show helpers), `main.ts:577-620` (AskFlow deps `openGuide`), `main.ts:664-840` (`runCommand` routing and `guide-open` case), `main.ts:1085-1107` (boot end: first run / upgrader line)

**Interfaces:**
- Produces (tauri.ts):
```ts
export interface GuideOpenOpts { style: Style; provider: AskProvider; models: { openrouter: string; groq: string; claude: string }; start: 'hello' | 'key'; outfit: OutfitName }
export async function guideOpen(o: GuideOpenOpts): Promise<boolean>;
export async function onAskKeyChanged(cb: (provider: AskProvider) => void): Promise<() => void>;
export async function onGuideState(cb: (s: { open: boolean }) => void): Promise<() => void>;
export async function onGuideMessage(cb: (m: { ev: 'guide:ready' } | { ev: 'guide:provider'; provider: AskProvider } | { ev: 'guide:style'; style: Style } | { ev: 'guide:finished'; keySaved: boolean; asked: boolean }) => void): Promise<() => void>;
export async function emitToGuide(ev: 'guide:tray' | 'guide:style' | 'guide:provider' | 'guide:outfit', payload: unknown): Promise<void>;
```
  Each listener validates its payload with `normalizeAskProvider` or `normalizeStyle` and drops anything malformed.

- [ ] **Step 1: Implement `openGuide(start)`** in main.ts following spec 6.3 "Move out":
  - Keep `let guest: Guest = 'none'` and `let wasHidden = false`.
  - Set `wasHidden = agent.hidden && !presence.isAutoHidden()`.
  - Stop follow, balloon, menu and ask, then call `agent.hide(prefersReducedMotion ? undefined : 'ExitRollUp')` without `saveSettings` or `userChangedVisibility`.
  - Stop scheduler, sleep and hydration, then call `sync(false)` and `saveSettings({ guideSeen: 1 })`.
  - Call `guideOpen(...)`. If it returns false or no `guide:ready` arrives within 5 s, move back in and say `guideFailed`.
- [ ] **Step 2: Implement move-in** on `guide-state {open:false}` with `returnPlan(...)`:
  - `show` runs the existing `showNow(true)` path (not persisted) and then says `guideBack`, or `askKeySaved` if `guide:finished.keySaved`.
  - `adoptAutoHide` calls `presence.adoptHidden()`.
  - `stayHidden` calls `sync(false)`.
- [ ] **Step 3: Routing.** In the existing `onTrayAction` listener, when `guest === 'away'` emit `guide:tray` before calling `runCommand`. While he is away the right-click menu cannot open, so every command then comes from the tray. At the top of `runCommand`: `if (routeCommand(guest, id) === 'focusGuide') { void openGuide('hello'); return; }`. Add `case 'guide-open': await openGuide('hello'); return;`. After the style, provider and outfit cases, call `emitToGuide(...)` when `guest === 'away'`.
- [ ] **Step 4: AskFlow and key events.** Set `openGuide: () => void openGuide('key')` in AskFlow deps. In `onAskKeyChanged`, set `askKeySet = await askKeyStatus(askProvider); sync()`. On `guide:provider`, call `runCommand('ask-provider-' + p)`.
- [ ] **Step 5: Boot.** Use `loadSettingsWithMeta`.
  - If `fresh && guideSeen === 0` (and not hidden): show, `Greeting`, the `firstRun` line, then `openGuide('hello')` instead of `speakKind('greeting')`.
  - Else if `guideSeen === 0`: say `guideNews` instead of the greeting and save `guideSeen: 1`. If he starts hidden, defer this to the first `showNow`.
- [ ] **Step 6: Verify** `npm test && npm run typecheck && npm run lint:rs`. Then `npm run tauri dev` with an empty store: delete `~/Library/Application Support/app.paperclip.desktop/settings.json` after backing it up, and restore it afterwards.
  - Expected: he greets, rolls up, the guide opens with him inside, and only one Paperclip is visible.
  - Closing with the red button brings him back with "I'm back!...".
  - Presence > Welcome guide reopens it, and a tray left-click while it is open focuses it and ticks the tray lesson.
- [ ] **Step 7: Commit** `git commit -am "main: move into the welcome guide and back, first run, upgrader line, routing"`

### Task 16: Full verification and PR notes

**Files:** none new (fix-ups only).

- [ ] **Step 1: Run** `npm test && npm run typecheck && npm run lint:rs && npm run build`. Expected: all pass, and `dist/` has `index.html` and `welcome.html`.
- [ ] **Step 2: Run the spec 10 macOS manual list** and record each result for the PR description:
  - Cmd+V into the real field (if it fails, stop and report: the spec 6.8 fallback needs a user decision because it adds a crate).
  - Cmd+Tab back from the browser; the Dock icon comes and goes.
  - Close by Finish, Skip, red button and Cmd+W; tray click, toggle and joke while away; quit while away, then relaunch.
  - RSS before, during, and 10 s after (Activity Monitor, counting WebContent processes); CPU about 0 % with the guide in the background.
  - VoiceOver and keyboard-only completion of every lesson and the rehearsal.
- [ ] **Step 3: Smoke test** on Windows and Linux if available; otherwise list them as not verified in the PR.
- [ ] **Step 4: Note the unverified items** from spec 9 in the PR: the OpenRouter/Groq button labels, `gsk_`, and the Anthropic workspace header.
- [ ] **Step 5: Commit** any fix-ups: `git commit -am "welcome: verification fixes"`

---

## Self-review notes

- Spec coverage: 5.1-5.5 map to Tasks 10-14; 6.2/6.7 to Tasks 8-9; 6.3 to Tasks 6 and 15; 6.4 to Tasks 9, 10 and 15; 6.6 to Tasks 5 and 14; 6.8 to Task 16; 7.x to Tasks 11-14; 8 is split across Tasks 3, 13 and 15; 10 is Task 16.
- Type names are used consistently across tasks: `Lesson`, `RehearsalStep`, `GuideState`, `GuidePlatform`, `Stage`, `Guest`, `routeCommand`, `returnPlan`, `keyLooksRight`, `viewFor`, `GuideModels`, `guide_open`.
- Verified in code: the `attachInteraction(target, handlers, startDragging)` signature; the `ContextMenu(el, onPick, onVisibility)` constructor; `Renderer(container, style, scope)`; `Animator` deps `{render, reducedMotion}`; `valid_model_id` and `valid_groq_model_id` are already `pub`; `AppHandle::set_activation_policy`, `WebviewWindowBuilder::on_navigation`, `title_bar_style` and `hidden_title` exist in tauri 2.12.7; `tauri_plugin_opener::open_url(url, Option)` exists in 2.7.3.
