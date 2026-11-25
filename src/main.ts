import { ANIMATIONS, IDLE_ANIMS, SHOWY_ANIMS, isLooping } from './anim/animations';
import { Animator } from './anim/animator';
import { HIDDEN } from './anim/pose';
import { Agent } from './agent/agent';
import type { BalloonAction } from './agent/agent';
import { DizzyDetector, DIZZY_IDLE_MS } from './agent/dizzy';
import type { Style } from './art/style';
import { HydrationScheduler } from './agent/hydration';
import type { IntervalMin } from './agent/hydration';
import { DEFAULT_SLEEP, SleepController } from './agent/sleep';
import { Presence } from './agent/presence';
import { AskFlow, AskHistory, FREE_MODEL, GROQ_FAST_MODEL, GROQ_SMART_MODEL, PAID_HAIKU_MODEL, providerName } from './agent/ask';
import { UpdateFlow } from './agent/updates';
import { matchIntent } from './agent/intents';
import { runIntent } from './agent/intentRunner';
import type { IntentDeps } from './agent/intentRunner';
import type { AskLine, AskModel, AskProvider, ClaudeModel, GroqModel } from './agent/ask';
import { FocusTimer, focusLabel } from './agent/focus';
import { MeetingAlerts, meetingLine } from './agent/meeting';
import type { CalEvent } from './agent/meeting';
import { SAMPLE_EVERY_MS, StretchBreaks, runGuided } from './agent/stretch';
import type { StretchMin } from './agent/stretch';
import type { PresenceCtx, Reaction } from './agent/presence';
import { DEFAULT_SCHEDULER, IdleScheduler } from './agent/scheduler';
import { Renderer } from './art/renderer';
import { currentOutfit } from './art/outfits';
import { Thrower } from './agent/thrower';
import { RELEASE_SILENCE_MS, ROUGH_BOUNCE_SPEED, boundsFor } from './agent/throwPhysics';
import { dropLine } from './agent/fileDrop';
import type { FilesDropped } from './platform/tauri';
import { LocalContentProvider } from './content/provider';
import type { ContentKind, ContentProvider } from './content/provider';
import { loadSettings, locateWindow, restorePosition, saveSettings, savePosition, trackPosition, windowSize } from './platform/settings';
import { askQuestion, askFocus, askKeyStatus, askRemoveKey, askSetKey, checkForUpdate, clearDropped, installUpdateAndRestart, onFileDrag, onFilesDropped, revealZip, zipDropped, calendarRequestAccess, calendarSetEnabled, calendarStatus, calendarSupported, getDebugHit, getSystem, onCursor, onMenuPointer, onOutsidePress, setMenuTracking, onMeetingEvents, onSessionUnlocked, onSystem, onTrayAction, pushHitRects, quitApp, setEyeFollow, syncTray, win } from './platform/tauri';
import type { SystemInfo } from './platform/tauri';
import { WelcomeBack, WelcomeLines } from './agent/welcomeBack';
import { EyeFollow, EyeTracker, characterClick, computeTarget } from './agent/eyeFollow';
import type { Pose } from './anim/pose';
import { Balloon } from './ui/balloon';
import { ContextMenu } from './ui/contextMenu';
import { buildMenu } from './ui/menuModel';
import type { MenuItem } from './ui/contextMenu';
import { HitRects } from './ui/hitRects';
import { FocusLease } from './ui/focusLease';
import { attachInteraction } from './ui/interaction';
import { characterHitTarget } from './ui/interactionTarget';
import { JumpCombo } from './agent/jumpCombo';
import { pick } from './util/rng';
import type { AnimName } from './anim/types';


async function boot(): Promise<void> {
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('sandbox')) {
    const { runSandbox } = await import('./sandbox');
    runSandbox();
    return;
  }

  document.addEventListener('contextmenu', (e) => e.preventDefault());

  const settings = await loadSettings();
  let quiet = settings.quiet;
  let greetOnUnlock = settings.greetOnUnlock;
  let hideWhenPresenting = settings.hideWhenPresenting;
  let reactToMusic = settings.reactToMusic;
  let meetingHeadsUp = settings.meetingHeadsUp;
  let outfitSetting = settings.outfits;
  let askModel: AskModel = settings.askModel; // the OpenRouter model id
  let askClaudeModel: ClaudeModel = settings.askClaudeModel;
  let askGroqModel: GroqModel = settings.askGroqModel;
  let askProvider: AskProvider = settings.askProvider;
  let askIntroSeen = settings.askIntroSeen;
  let askKeySet = false; // whether the keychain holds a key (JS can ask, never read it); filled in below at boot
  let calendarOk = false; // macOS only: set once the platform answers, hides the Meeting heads-up toggle elsewhere

  const charEl = document.getElementById('character') as HTMLElement;
  let style: Style = settings.style;
  const renderer = new Renderer(charEl, style);
  // Seasonal outfit: by local date; re-checked on the presence heartbeat so it changes at midnight without a restart.
  const applyOutfit = () => renderer.setOutfit(currentOutfit(outfitSetting, new Date()));
  applyOutfit();
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const animator = new Animator({ render: (p) => renderer.render(p), reducedMotion: motionQuery.matches });
  motionQuery.addEventListener('change', (e) => { animator.reducedMotion = e.matches; });
  animator.setPose(HIDDEN);

  // Debug: PAPERCLIP_DEBUG_HIT=1 outlines the hit rects that are interactive (everything else is click-through).
  const debugHit = await getDebugHit();
  const drawDebug = (rects: { x: number; y: number; w: number; h: number }[]) => {
    document.querySelectorAll('.hitdbg').forEach((n) => n.remove());
    for (const r of rects) {
      const d = document.createElement('div');
      d.className = 'hitdbg';
      d.style.cssText = `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`;
      document.getElementById('stage')?.append(d);
    }
  };
  const hit = new HitRects(async (rects) => {
    if (debugHit) drawDebug(rects);
    await pushHitRects(rects);
  });
  const updateHit = () => {
    const c = renderer.characterRect();
    hit.set('character', { x: c.x, y: c.y, w: c.width, h: c.height });
    const m = renderer.matRect();
    hit.set('mat', { x: m.x, y: m.y, w: m.width, h: m.height });
  };
  updateHit();
  window.addEventListener('resize', updateHit);

  const rectOf = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  };
  const balloonEl = document.getElementById('balloon') as HTMLElement;
  // The menu and Ask's input need the window to be the active one (hover, click-outside, typing): see FocusLease.
  const keyFocus = new FocusLease(askFocus);
  const menuEl = document.getElementById('menu') as HTMLElement;
  // Ask Paperclip's input needs the keyboard: the window is focus:false, so grab focus while the input is open (the balloon is
  // a hit rect meanwhile, via onVisibility) and hand it back afterwards. Click-through returns when the balloon rect goes away.
  const balloon = new Balloon(balloonEl, (v) => hit.set('balloon', v ? rectOf(balloonEl) : null), {
    onPrompt: (active) => {
      if (active) void keyFocus.acquire('prompt').then(() => balloon.focusInput());
      else keyFocus.release('prompt');
    },
  });
  // If the user wanders off (to copy an API key, say) the input waits; a forgotten one is abandoned after 5 minutes.
  let promptAbandon: ReturnType<typeof setTimeout> | null = null;
  window.addEventListener('blur', () => {
    if (promptAbandon !== null) clearTimeout(promptAbandon);
    promptAbandon = setTimeout(() => { promptAbandon = null; if (!document.hasFocus()) balloon.cancelPrompt(); }, 300_000);
  });
  window.addEventListener('focus', () => { if (promptAbandon !== null) { clearTimeout(promptAbandon); promptAbandon = null; } });
  const menu = new ContextMenu(menuEl, (id) => void runCommand(id), (v) => {
    hit.set('menu', v ? menu.rect() : null);
    // Hover and click-outside come from the Rust cursor poller: macOS often won't let the window become the active
    // one, and then the web view gets neither mouse-move events nor a blur.
    void setMenuTracking(v);
  });
  void onMenuPointer((p) => menu.pointAt(p.x, p.y));
  void onOutsidePress(() => menu.close());

  const agent = new Agent({ animator, balloon, win });
  agent.onIdle(updateHit);
  const content: ContentProvider = new LocalContentProvider();
  // System awareness (full screen, battery, CPU, audio, night): pure rules, executed by runReactions below.
  const presence = new Presence({ hideWhenPresenting, reactToMusic });

  const speakKind = async (kind: ContentKind): Promise<void> => {
    const item = await content.next(kind);
    await agent.speak(item.text, item.attribution);
  };
  const speakRandom = (): Promise<void> => {
    const r = Math.random();
    return speakKind(r < 0.4 ? 'quote' : r < 0.8 ? 'joke' : 'tip');
  };

  const sleep = new SleepController(DEFAULT_SLEEP, {
    fallAsleep: async () => {
      agent.interrupt();
      await agent.play('FallAsleep');
      renderer.setSleeping(true);
      void agent.play('Sleeping', Infinity);
      updateHit();
    },
    wake: async (reason) => {
      renderer.setSleeping(false);
      agent.interrupt(true);
      await agent.play('WakeUp');
      updateHit();
      if (reason === 'reminder') return; // the water reminder speaks next
      const item = await content.next('sleep');
      await agent.speak(item.text);
    },
    isBusy: () => agent.busy || balloon.visible || menu.visible || follow.active || thrower.flying,
  });

  const scheduler = new IdleScheduler(
    { ...DEFAULT_SCHEDULER, ...settings.scheduler, quiet },
    {
      blink: () => void agent.play('Blink'),
      idleAnim: () => {
        if (!sleep.maybeIdleSleep()) void agent.play(presence.idleAnim(presenceCtx()) ?? pick(Math.random, IDLE_ANIMS));
      },
      talk: () => void speakRandom(),
      // Eye-follow and focus mode pause idle animations and chatter; blinks continue.
      isBusy: (kind) => agent.busy || balloon.visible || menu.visible || sleep.sleeping || thrower.flying || ((follow.active || focus.active) && kind !== 'blink'),
    },
  );

  // Water reminders: independent of quiet mode; persisted cadence + daily glass count.
  let reminderOpen = false;
  let stretchOpen = false; // a stretch offer or guided stretch is on screen
  let reminderWait: Promise<void> = Promise.resolve(); // resolves when no reminder is open (welcome-back queues behind it)
  let reminderRelease: () => void = () => undefined;
  const persistWater = () => void saveSettings({ water: { ...hydration.config, ...hydration.snapshot } });
  const hydration: HydrationScheduler = new HydrationScheduler(
    { enabled: settings.water.enabled, intervalMin: settings.water.intervalMin },
    { lastReminderAt: settings.water.lastReminderAt, glasses: settings.water.glasses, glassesDate: settings.water.glassesDate },
    {
      remind: async () => {
        reminderOpen = true;
        reminderWait = new Promise<void>((r) => (reminderRelease = r));
        try {
          follow.end('interrupt');
          if (agent.hidden) await showNow(); // "Remind me now" while hidden brings him back first
          if (sleep.sleeping) await sleep.wake('reminder');
          agent.interrupt();
          await agent.play('Drink');
          const item = await content.next('hydration');
          const choice = await agent.ask(item.text, [
            { id: 'drank', label: 'Drank some' },
            { id: 'later', label: 'Later' },
          ]);
          if (choice !== 'drank') return 'later'; // Later, closed, or the 2 minute auto-dismiss
          void agent.play('Congratulate');
          const thanks = await content.next('thanks');
          void agent.speak(thanks.text);
          return 'drank';
        } finally {
          reminderOpen = false;
          reminderRelease();
        }
      },
      // Scheduled reminders wait while he is hidden or a focus session runs (they retry every minute);
      // "Remind me now" ignores isHidden, so an explicit request still works during focus.
      isHidden: () => agent.hidden || focus.active,
      isBlocked: () => reminderOpen || stretchOpen || balloon.visible || menu.visible,
      save: () => persistWater(),
    },
  );
  hydration.onChange(() => sync());

  // ---- Wellbeing: stretch breaks, focus timer, meeting heads-up ----
  let lastSnap: SystemInfo | undefined; // latest Rust snapshot (idle time, full screen)
  const meetings = new MeetingAlerts();
  const stretch = new StretchBreaks(settings.stretch);
  const persistStretch = () => void saveSettings({ stretch: stretch.config });
  let lastFocusMin = settings.focus?.minutes ?? 25;
  const focus: FocusTimer = new FocusTimer({
    onTick: (m) => {
      renderer.setFocus(focusLabel(m));
      sync();
    },
    onDone: () => void finishFocus(),
    save: (s) => void saveSettings({ focus: s }),
  });
  const focusLeft = (): number | null => (focus.active ? focus.minutesLeft() : null);

  const offerStretch = async (): Promise<void> => {
    stretchOpen = true;
    try {
      follow.end('interrupt');
      agent.interrupt();
      await agent.play('Stretch');
      const item = await content.next('stretch');
      const choice = await agent.ask(item.text, [
        { id: 'stretch', label: 'Stretch with me' },
        { id: 'later', label: 'Later' },
      ]);
      if (choice !== 'stretch') { // Later, closed, or the 2 minute auto-dismiss
        stretch.later(Date.now());
        return;
      }
      await guidedStretch();
    } finally {
      stretchOpen = false;
    }
  };

  /** The guided sequence itself (after the user said yes to the offer, or asked for it in Ask Paperclip). */
  const guidedStretch = async (): Promise<void> => {
    stretch.completed();
    const epoch = agent.epoch;
    let cut = false;
    const finished = await runGuided(
      async (step) => { if ((await agent.speakAnimated(step.line, step.anim)) === 'closed') cut = true; },
      () => cut || agent.epoch !== epoch, // a click, a hide or another feature taking over ends the sequence
    );
    if (finished) {
      void agent.play('Congratulate');
      const done = await content.next('stretchDone');
      void agent.speak(done.text);
    }
  };

  // Once a minute: read the idle time, count active minutes, and offer a stretch when one is due.
  const stretchTick = async (): Promise<void> => {
    const s = await getSystem();
    if (!s) return;
    lastSnap = s;
    const now = Date.now();
    stretch.sample(s.idleSecs, now);
    if (stretch.due({
      now, hidden: agent.hidden, quiet, focus: focus.active, presenting: lastSnap.fullscreen,
      reminder: reminderOpen, busy: agent.busy || balloon.visible || menu.visible || sleep.sleeping || follow.active,
    })) await offerStretch();
  };

  /** Starts the timer and updates the prop and the tray; says nothing and leaves the current balloon alone. */
  const beginFocus = (minutes: number): void => {
    lastFocusMin = minutes;
    focus.start(minutes);
    renderer.setFocus(focusLabel(focus.minutesLeft()));
    sync();
  };
  const startFocus = async (minutes: number): Promise<void> => {
    user();
    beginFocus(minutes);
    if (agent.hidden) return; // the timer runs; he just is not there to hold it
    const item = await content.next('focusStart');
    await agent.speak(item.text);
  };
  const stopFocus = (): void => {
    focus.stop();
    renderer.setFocus(null);
    sync();
  };
  const finishFocus = async (): Promise<void> => {
    renderer.setFocus(null);
    sync();
    if (agent.hidden) return; // hidden (or presenting): stay out of the way
    try {
      follow.end('interrupt');
      if (sleep.sleeping) await sleep.wake('reminder');
      agent.interrupt();
      await agent.play('Celebrate');
      const item = await content.next('focusDone');
      const choice = await agent.ask(item.text, [
        { id: 'break', label: 'Take a break' },
        { id: 'again', label: 'Another round' },
      ]);
      if (choice === 'again') await startFocus(lastFocusMin);
      else if (choice === 'break') await speakKind('focusBreak');
    } catch (e) {
      console.warn('focus finish failed', e);
    }
  };

  // Meeting heads-up: Rust polls EventKit once a minute; this decides what to say and says each meeting once.
  const handleMeetings = async (events: CalEvent[]): Promise<void> => {
    if (!meetingHeadsUp || agent.hidden) return; // hidden: nothing is consumed, the next poll tries again
    const now = Date.now();
    const due = meetings.peek(events, now);
    if (!due.length) return;
    if (reminderOpen || stretchOpen || menu.visible) return; // retry on the next poll, the window is 5 min wide
    meetings.markFired(due);
    // Not silenced by quiet or focus mode: the user switched this on to be told about meetings.
    follow.end('interrupt');
    if (sleep.sleeping) await sleep.wake('reminder');
    agent.interrupt();
    void agent.play('GetAttention');
    const item = await content.next('meeting');
    await agent.speak(meetingLine(due, now, item.text));
  };

  const setMeeting = async (on: boolean): Promise<void> => {
    if (on) {
      // The one place that may trigger macOS's calendar prompt.
      const access = await calendarRequestAccess();
      if (access !== 'granted') {
        meetingHeadsUp = false;
        void saveSettings({ meetingHeadsUp });
        sync();
        user();
        await agent.speak("I can't see your calendar, so no meeting heads-ups. You can allow it in System Settings, Privacy & Security, Calendars.");
        return;
      }
    }
    meetingHeadsUp = on;
    await calendarSetEnabled(on);
    void saveSettings({ meetingHeadsUp });
    sync();
  };

  // Eye-follow: a single click on the clip makes his eyes track the cursor anywhere on screen (the Rust
  // poller streams the global cursor while this is on). The overlay is applied by the animator on every
  // rendered pose, so blinks and other animations keep working and no permanent rAF loop is needed.
  const tracker = new EyeTracker();
  let lastCursorT = 0;
  let easeRaf: number | null = null;
  const overlay = (p: Pose): Pose => {
    const v = tracker.values;
    return {
      ...p,
      pupils: { x: v.px, y: v.py, conv: v.conv },
      eyes: { ...p.eyes, x: p.eyes.x + v.ex, y: p.eyes.y + v.ey },
      body: { ...p.body, tilt: p.body.tilt + v.tilt },
    };
  };
  const cancelEase = () => {
    if (easeRaf !== null) cancelAnimationFrame(easeRaf);
    easeRaf = null;
  };
  const easeBack = () => { // ~200 ms, temporary rAF only while easing out
    cancelEase();
    let last = performance.now();
    const step = (now: number) => {
      tracker.decay(now - last);
      last = now;
      animator.refresh();
      if (tracker.settled) {
        easeRaf = null;
        tracker.reset();
        animator.setOverlay(null);
        animator.refresh();
      } else easeRaf = requestAnimationFrame(step);
    };
    easeRaf = requestAnimationFrame(step);
  };
  const follow: EyeFollow = new EyeFollow({
    canStart: () => !sleep.sleeping && !agent.hidden,
    onStart: () => {
      cancelEase();
      tracker.reset();
      lastCursorT = 0;
      animator.setOverlay(overlay);
      void setEyeFollow(true);
      void agent.play('Noticed'); // brows lift
    },
    onEnd: () => {
      void setEyeFollow(false);
      easeBack();
    },
  });
  void onCursor((p) => {
    if (!follow.active) return;
    follow.cursorMoved();
    const now = performance.now();
    const dt = lastCursorT ? now - lastCursorT : 16;
    lastCursorT = now;
    tracker.update(computeTarget(renderer.eyeCentres(), p, motionQuery.matches), dt);
    animator.refresh();
  }).catch((e) => console.warn('cursor listener failed', e));

  const user = () => {
    follow.end('user');
    agent.interrupt();
    scheduler.notifyActivity();
    sleep.notifyActivity();
  };
  const sync = (visible = !agent.hidden) =>
    void syncTray(visible, quiet, sleep.sleeping, style, {
      enabled: hydration.config.enabled,
      intervalMin: hydration.config.intervalMin,
      glasses: hydration.glassesToday,
    }, greetOnUnlock, { hidePresenting: hideWhenPresenting, music: reactToMusic }, {
      stretchEnabled: stretch.config.enabled,
      stretchInterval: stretch.config.everyMin,
      focusLeft: focusLeft(),
      meeting: meetingHeadsUp,
      outfits: outfitSetting === 'auto',
      askKey: askKeySet,
      askModel,
      askGroqModel,
      askProvider,
      askClaudeModel,
    });
  sleep.onChange(() => {
    if (sleep.sleeping) follow.end('sleep');
    sync();
  });

  // Live style switch: works in every state (idle, speaking, asleep, mid-animation, hidden).
  const setStyle = (s: Style) => {
    if (s === style) return;
    style = s;
    renderer.setStyle(s);
    void saveSettings({ style });
    sync();
    requestAnimationFrame(() => {
      updateHit();
      if (balloon.visible) hit.set('balloon', rectOf(balloonEl));
      if (menu.visible) hit.set('menu', menu.rect());
    });
  };

  const setQuiet = (q: boolean) => {
    quiet = q;
    scheduler.setConfig({ quiet });
    void saveSettings({ quiet });
    sync();
  };

  // `auto` = Presence hid/showed him (full screen): not a user choice, so it is never persisted.
  const hideNow = async (auto = false) => {
    if (!auto) presence.userChangedVisibility();
    follow.end('hide');
    ask.reset(); // the conversation lives in memory only and ends when he is hidden
    thrower.cancel();
    sleep.reset();
    sleep.stop();
    hydration.stop();
    renderer.setSleeping(false);
    agent.interrupt(true);
    await agent.hide();
    scheduler.stop();
    sync(false);
    if (!auto) void saveSettings({ hidden: true });
  };
  const showNow = async (auto = false) => {
    if (!auto) presence.userChangedVisibility();
    sync(true);
    if (!auto) void saveSettings({ hidden: false });
    await agent.show();
    scheduler.start();
    sleep.start();
    hydration.start();
    updateHit();
  };

  // ---- Ask Paperclip: the conversation logic is agent/ask.ts; this only supplies the pieces it needs ----
  // Lines may say {provider}: the privacy promise and the key prompt always name the service that is active.
  const askLine = async (k: AskLine): Promise<string> =>
    (await content.next(`ask${k[0].toUpperCase()}${k.slice(1)}` as ContentKind)).text.replaceAll('{provider}', providerName(askProvider))
      .replaceAll('{example}', askProvider === 'groq' ? 'openai/gpt-oss-20b' : 'openai/gpt-5-mini')
      .replaceAll('{shape}', askProvider === 'groq' ? 'qwen/qwen3.8-27b or openai/gpt-oss-20b' : 'vendor/model-name');
  const setGroqModel = (id: GroqModel) => {
    askGroqModel = id;
    void saveSettings({ askGroqModel });
    sync();
  };
  const setAskModel = (id: AskModel) => {
    askModel = id;
    void saveSettings({ askModel });
    sync();
  };
  const setClaudeModel = (id: ClaudeModel) => {
    askClaudeModel = id;
    void saveSettings({ askClaudeModel });
    sync();
  };
  const activeModel = (): string => (askProvider === 'anthropic' ? askClaudeModel : askProvider === 'groq' ? askGroqModel : askModel);
  /** Switching provider: each has its own key, so the key state is re-read, and the chat is forgotten (new recipient). */
  const setAskProvider = (p: AskProvider) => {
    if (p === askProvider) { sync(); return; }
    askProvider = p;
    void saveSettings({ askProvider });
    ask.reset();
    askKeySet = false;
    sync();
    void askKeyStatus(p).then((has) => { if (askProvider === p) { askKeySet = has; sync(); } });
  };
  /** An answer with buttons; a named animation plays with it, except a looping one (Thinking), which plays on its own for a moment. */
  const askBalloon = (text: string, actions: BalloonAction[], o?: { attribution?: string; anim?: AnimName }): Promise<string> => {
    const anim = o?.anim;
    if (anim && isLooping(ANIMATIONS[anim])) {
      void agent.play(anim);
      return agent.ask(text, actions, o?.attribution);
    }
    return agent.ask(text, actions, o?.attribution, anim);
  };
  // Local intents (agent/intents.ts): what he can do himself, with no key and no network. These reuse the same functions as the menu.
  const intentDeps: IntentDeps = {
    play: (a) => void agent.play(a),
    focusLeft,
    startTimer: beginFocus,
    stopTimer: stopFocus,
    water: {
      enabled: () => hydration.config.enabled,
      intervalMin: () => hydration.config.intervalMin,
      setEnabled: (on) => { hydration.setConfig({ enabled: on }); persistWater(); sync(); },
      logGlass: () => hydration.logGlass(),
    },
    content: (kind) => content.next(kind),
    stretch: async () => {
      stretchOpen = true;
      try {
        follow.end('interrupt');
        await guidedStretch();
      } finally {
        stretchOpen = false;
      }
    },
    nap: () => runCommand('nap'),
    hide: () => hideNow(),
    style: () => style,
    setStyle,
  };
  const ask = new AskFlow(
    {
      hasKey: () => askKeySet,
      introSeen: () => askIntroSeen,
      markIntroSeen: () => { askIntroSeen = true; void saveSettings({ askIntroSeen }); },
      line: askLine,
      prompt: (text, opts) => agent.prompt(text, opts),
      say: (text) => agent.speak(text),
      choose: (text, actions, o) => askBalloon(text, actions, o),
      local: async (q) => {
        const intent = matchIntent(q);
        return intent ? runIntent(intent, intentDeps) : null;
      },
      think: () => agent.hold('Thinking'),
      query: async (q, turns) => {
        const r = await askQuestion(q, turns, activeModel(), askProvider);
        if (!r.ok && r.failure.kind === 'noKey') { askKeySet = false; sync(); } // removed behind our back
        return r;
      },
      saveKey: async (key) => {
        const p = askProvider;
        const ok = await askSetKey(key, p);
        if (ok && p === askProvider) { askKeySet = true; sync(); }
        return ok;
      },
      removeKey: async () => { await askRemoveKey(askProvider); askKeySet = false; sync(); },
      setModel: (id) => (askProvider === 'groq' ? setGroqModel(id) : setAskModel(id)),
      provider: () => askProvider,
      epoch: () => agent.epoch,
    },
    new AskHistory(),
  );
  void askKeyStatus(askProvider).then((has) => { askKeySet = has; sync(); });

  // ---- Updates: the decisions live in agent/updates.ts. The silent daily check never speaks unless a new version exists. ----
  let updateState = settings.updates;
  const updates = new UpdateFlow({
    check: checkForUpdate,
    install: installUpdateAndRestart,
    now: () => Date.now(),
    state: () => updateState,
    save: (s) => { updateState = s; void saveSettings({ updates: s }); },
    line: async (k) => (await content.next(k)).text,
    say: (text) => agent.speak(text),
    choose: (text, actions) => agent.ask(text, actions),
    busy: () => agent.hidden || quiet || focus.active || agent.busy || balloon.visible || menu.visible || sleep.sleeping || reminderOpen || stretchOpen || follow.active,
  });
  const UPDATE_TICK_MS = 60 * 60 * 1000; // an hourly look at the clock; the network is touched at most once a day
  setTimeout(() => void updates.tick(), 45_000); // shortly after launch, once he has settled
  setInterval(() => void updates.tick(), UPDATE_TICK_MS);

  const presenceCtx = (): PresenceCtx => ({
    now: Date.now(),
    hidden: agent.hidden,
    quiet: quiet || focus.active, // focus mode keeps him quiet like quiet mode does
    busy: agent.busy || balloon.visible || menu.visible || sleep.sleeping || reminderOpen || follow.active,
  });
  const runReactions = (reactions: Reaction[]): void => {
    for (const r of reactions) {
      if (r.type === 'hide') void hideNow(true);
      else if (r.type === 'show') void showNow(true);
      else {
        if (r.anim) void agent.play(r.anim);
        if (r.speak) {
          void content.next(r.line)
            .then((item) => agent.speak(item.text))
            .catch((e) => console.warn('presence line failed', e));
        }
      }
    }
  };
  // The Rust sampler only emits on change, so a slow heartbeat drives the time-based rules (CPU for 30 s, a line
  // that had to wait for a quiet moment). 10 s is far above the 1 s polling ceiling and costs nothing while idle.
  const PRESENCE_TICK_MS = 10_000;
  const startPresence = (): void => {
    void onSystem((s) => { lastSnap = s; runReactions(presence.update(s, presenceCtx())); }).catch((e) => console.warn('system listener failed', e));
    void getSystem().then((s) => { if (s) { lastSnap = s; runReactions(presence.update(s, presenceCtx())); } });
    setInterval(() => {
      runReactions(presence.tick(presenceCtx()));
      applyOutfit();
      focus.check(); // catches the wake-up after sleep within seconds (no-op unless a session runs)
    }, PRESENCE_TICK_MS);
    setInterval(() => void stretchTick(), SAMPLE_EVERY_MS); // one getSystem() call a minute
  };

  async function runCommand(id: string, checked?: boolean): Promise<void> {
    try {
      const settingOnly = ['nap', 'tray-click', 'style-classic', 'style-flat', 'quit', 'hide', 'toggle', 'quiet', 'greet', 'meeting', 'focus-stop', 'stretch-enabled', 'style-outfits'].includes(id)
        || id.startsWith('water-') || id.startsWith('ask-model-') || id.startsWith('ask-groq-') || id.startsWith('presence-') || (id.startsWith('stretch-') && id !== 'stretch-now');
      if (sleep.sleeping && !settingOnly) await sleep.wake('command');
      switch (id) {
        case 'style-classic':
        case 'style-flat':
          setStyle(id === 'style-flat' ? 'flat' : 'classic');
          return;
        case 'style-outfits':
          outfitSetting = (checked ?? outfitSetting !== 'auto') ? 'auto' : 'off';
          void saveSettings({ outfits: outfitSetting });
          applyOutfit();
          sync();
          return;
        case 'ask-open':
        case 'ask-key':
        case 'ask-remove':
          if (agent.hidden) await showNow(); // from the tray while hidden: bring him back first
          user();
          if (id === 'ask-open') await ask.ask();
          else if (id === 'ask-key') await ask.setKey();
          else await ask.removeKey();
          return;
        case 'update-check':
          if (agent.hidden) await showNow(); // from the tray while hidden: bring him back first
          user();
          await updates.checkNow();
          return;
        case 'ask-model-free':
          setAskModel(FREE_MODEL);
          return;
        case 'ask-model-haiku':
          setAskModel(PAID_HAIKU_MODEL);
          return;
        case 'ask-groq-fast':
        case 'ask-groq-smart':
          setGroqModel(id === 'ask-groq-smart' ? GROQ_SMART_MODEL : GROQ_FAST_MODEL);
          return;
        case 'ask-claude-haiku':
        case 'ask-claude-sonnet':
          setClaudeModel(id === 'ask-claude-sonnet' ? 'claude-sonnet-5-5' : 'claude-haiku-5-5');
          return;
        case 'ask-provider-openrouter':
        case 'ask-provider-groq':
        case 'ask-provider-anthropic':
          setAskProvider(id === 'ask-provider-anthropic' ? 'anthropic' : id === 'ask-provider-groq' ? 'groq' : 'openrouter');
          return;
        case 'ask-model-other':
        case 'ask-groq-other':
          if (agent.hidden) await showNow();
          user();
          await ask.chooseModel();
          sync(); // the radios may have been flipped by the tray before the id was accepted
          return;
        case 'water-enabled':
          hydration.setConfig({ enabled: checked ?? !hydration.config.enabled });
          persistWater();
          sync();
          return;
        case 'water-30':
        case 'water-45':
        case 'water-60':
        case 'water-90':
          hydration.setConfig({ intervalMin: Number(id.slice(6)) as IntervalMin });
          persistWater();
          sync();
          return;
        case 'water-now':
          user();
          await hydration.remindNow();
          return;
        case 'stretch-enabled':
          stretch.setConfig({ enabled: checked ?? !stretch.config.enabled });
          persistStretch();
          sync();
          return;
        case 'stretch-30':
        case 'stretch-45':
        case 'stretch-60':
        case 'stretch-90':
          stretch.setConfig({ everyMin: Number(id.slice(8)) as StretchMin });
          persistStretch();
          sync();
          return;
        case 'stretch-now':
          user();
          await offerStretch();
          return;
        case 'focus-15':
        case 'focus-25':
        case 'focus-45':
        case 'focus-60':
          await startFocus(Number(id.slice(6)));
          return;
        case 'focus-stop':
          stopFocus();
          return;
        case 'meeting':
          await setMeeting(checked ?? !meetingHeadsUp);
          return;
        case 'tray-click':
          // Left click on the tray icon: summon if hidden, otherwise poke (never hides).
          if (agent.hidden) await showNow();
          else if (sleep.sleeping) await sleep.wake('command');
          else {
            user();
            void agent.play(pick(Math.random, ['GetAttention', 'Wave'] as AnimName[]));
          }
          return;
        case 'nap':
          if (sleep.sleeping) await sleep.wake('command');
          else {
            scheduler.notifyActivity();
            agent.interrupt();
            await sleep.sleepNow();
          }
          return;
        case 'hi':
          user();
          void agent.play('Greeting');
          await speakKind('greeting');
          return;
        case 'joke':
        case 'quote':
        case 'tip':
          user();
          await speakKind(id);
          return;
        case 'animate':
          user();
          await agent.play(pick(Math.random, SHOWY_ANIMS));
          return;
        case 'quiet':
          setQuiet(checked ?? !quiet);
          return;
        case 'greet':
          greetOnUnlock = checked ?? !greetOnUnlock;
          void saveSettings({ greetOnUnlock });
          sync();
          return;
        case 'presence-hide':
          hideWhenPresenting = checked ?? !hideWhenPresenting;
          void saveSettings({ hideWhenPresenting });
          runReactions(presence.setConfig({ hideWhenPresenting, reactToMusic }, presenceCtx()));
          sync();
          return;
        case 'presence-music':
          reactToMusic = checked ?? !reactToMusic;
          void saveSettings({ reactToMusic });
          presence.setConfig({ hideWhenPresenting, reactToMusic }, presenceCtx());
          sync();
          return;
        case 'hide':
          await hideNow();
          return;
        case 'toggle':
          if (agent.hidden) await showNow();
          else await hideNow();
          return;
        case 'quit':
          // Play an exit variant (max ~1.2 s) before the process exits.
          follow.end('hide');
          sleep.reset();
          sleep.stop();
          hydration.stop();
          scheduler.stop();
          renderer.setSleeping(false);
          agent.interrupt(true);
          await Promise.race([agent.hide(), new Promise<void>((r) => setTimeout(r, 1200))]);
          await quitApp();
          return;
      }
    } catch (e) {
      console.warn('command failed', id, e);
    }
  }

  const menuItems = (): MenuItem[] => buildMenu({
    sleeping: sleep.sleeping,
    quiet,
    greetOnUnlock,
    hideWhenPresenting,
    reactToMusic,
    outfits: outfitSetting === 'auto',
    style,
    water: { enabled: hydration.config.enabled, intervalMin: hydration.config.intervalMin, glassesToday: hydration.glassesToday },
    stretch: stretch.config,
    focusLeft: focusLeft(),
    calendarSupported: calendarOk,
    meetingHeadsUp,
    ask: { keySet: askKeySet, provider: askProvider, model: askModel, groqModel: askGroqModel, claudeModel: askClaudeModel },
  });

  // Throwing: rAF runs only while he is flying (see agent/thrower.ts). Physics are in physical px on the monitor he is on.
  let lastBounceAt = 0;
  const thrower = new Thrower({
    dpr: () => window.devicePixelRatio || 1,
    locate: async (pos) => {
      const [where, size] = await Promise.all([locateWindow(pos), windowSize()]);
      if (!where || !size) return null;
      const k = where.scale;
      // Transparent margins around the drawn clip + mat in the 320x380 window (logical px): he lands ON the work-area edge.
      return { bounds: boundsFor(where.area, size, { left: 112 * k, right: 20 * k, top: 130 * k, bottom: 12 * k }), scale: k };
    },
    setPosition: (x, y) => win.setPosition(x, y),
    raf: (cb) => requestAnimationFrame(cb),
    caf: (id) => cancelAnimationFrame(id),
    onLaunch: () => {
      follow.end('drag');
      balloon.close();
      menu.close();
      agent.interrupt();
      scheduler.notifyActivity();
      sleep.notifyActivity();
      void animator.play(ANIMATIONS.Fling);
    },
    onBounce: (surface, speed) => {
      const now = performance.now();
      if (speed < ROUGH_BOUNCE_SPEED || now - lastBounceAt < 90) return; // tiny settles do not squash him
      lastBounceAt = now;
      void animator.play(surface === 'left' || surface === 'right' ? ANIMATIONS.Bump : ANIMATIONS.Thud);
    },
    onLand: (l) => {
      void savePosition(); // at rest: persist now (the debounced tracker would also catch it)
      updateHit();
      if (!l.rough || agent.hidden) return;
      void agent.play('Dizzy');
      void speakKind('dizzy');
    },
  });
  let oohActive = false;
  const endOoh = () => {
    if (!oohActive) return;
    oohActive = false;
    agent.interrupt();
  };

  const jumps = new JumpCombo(agent);
  const hitTarget = characterHitTarget(charEl);
  attachInteraction(
    hitTarget,
    {
      click: () =>
        characterClick({
          sleeping: sleep.sleeping,
          follow,
          wake: () => void sleep.wake('click'),
          activity: () => {
            scheduler.notifyActivity();
            sleep.notifyActivity();
          },
        }),
      doubleClick: () => {
        if (sleep.sleeping) { void sleep.wake('doubleClick'); return; }
        user();
        void agent.play('Thinking', 900);
        void speakKind('joke');
      },
      tripleClick: () => {
        if (sleep.sleeping) { void sleep.wake('doubleClick'); return; }
        user();
        void speakKind('quote'); // same as the menu's "Give a quote"
      },
      middleClick: () => {
        if (sleep.sleeping) { void sleep.wake('doubleClick'); return; }
        user();
        void speakKind('quote');
      },
      openAsk: () => {
        menu.close(); // in case a menu from an earlier right click is still open
        if (sleep.sleeping) void sleep.wake('doubleClick');
        user();
        void ask.ask(); // same as the menu's "Ask a question…"
      },
      contextMenu: (x, y) => {
        scheduler.notifyActivity();
        menu.open(x, y, menuItems());
      },
      matTap: () => {
        follow.end('user');
        if (sleep.sleeping) { void sleep.wake('click'); return; }
        scheduler.notifyActivity();
        sleep.notifyActivity();
        balloon.close();
        jumps.tap();
      },
      dragStart: () => {
        thrower.beginDrag(); // a drag in progress cancels any flight and starts measuring the release velocity
        endOoh();
        follow.end('drag');
        if (sleep.sleeping) void sleep.wake('drag');
        sleep.notifyActivity();
        balloon.close();
        menu.close();
      },
    },
    () => win.startDragging(),
  );

  hitTarget.addEventListener('mouseenter', () => sleep.hoverStart());
  hitTarget.addEventListener('mouseleave', () => sleep.hoverEnd());

  void onTrayAction((a) => void runCommand(a.id, a.checked)).catch((e) => console.warn('tray listener failed', e));

  // Welcome back: say hello when the screen is unlocked (the Rust side reports how long he was locked).
  const welcomeBack = new WelcomeBack(
    {
      enabled: () => greetOnUnlock,
      isHidden: () => agent.hidden,
      isAsleep: () => sleep.sleeping,
      isQuiet: () => quiet || focus.active,
      waitForReminder: () => (reminderOpen ? reminderWait : Promise.resolve()),
      wake: () => sleep.wake('reminder'), // WakeUp without the sleep line
      endFollow: () => follow.end('interrupt'),
      interrupt: () => agent.interrupt(),
      wave: () => agent.play('Greeting'),
      speak: (text) => agent.speak(text),
    },
    new WelcomeLines(),
  );
  void onSessionUnlocked((p) => { focus.check(); void welcomeBack.onUnlock(p.awaySeconds); }).catch((e) => console.warn('unlock listener failed', e));

  // Native drags only report window moves, so watch onMoved (physical px). Two listeners share the stream:
  //  - Throw: the silence after the last move is the release; a fast release flings him (see agent/thrower.ts).
  //  - Dizzy: lots of rough dragging makes him dizzy (a throw takes precedence; it decides dizziness on landing).
  const dizzy = new DizzyDetector();
  let dizzyTimer: ReturnType<typeof setTimeout> | null = null;
  let throwTimer: ReturnType<typeof setTimeout> | null = null;
  let lastMoveT = 0;
  void win
    .onMoved((p) => {
      const dpr = window.devicePixelRatio || 1;
      const t = performance.now();
      if (thrower.flying) return; // our own setPosition echoes
      lastMoveT = t;
      thrower.move(p.x, p.y, t);
      if (throwTimer !== null) clearTimeout(throwTimer);
      throwTimer = setTimeout(() => {
        throwTimer = null;
        void thrower.release(lastMoveT + RELEASE_SILENCE_MS).then((thrown) => {
          if (!thrown) return;
          if (dizzyTimer !== null) { clearTimeout(dizzyTimer); dizzyTimer = null; }
          dizzy.reset();
        });
      }, RELEASE_SILENCE_MS);
      dizzy.move(p.x / dpr, p.y / dpr, t);
      if (dizzyTimer !== null) clearTimeout(dizzyTimer);
      dizzyTimer = setTimeout(() => {
        dizzyTimer = null;
        if (!dizzy.consume(performance.now()) || agent.hidden || thrower.flying) return;
        user();
        void agent.play('Dizzy');
        void speakKind('dizzy');
      }, DIZZY_IDLE_MS);
    })
    .catch((e) => console.warn('dizzy listener failed', e));

  // ---- File drop: Rust owns the paths; here we only react and ask ----
  const isMac = /Mac/i.test(navigator.platform);
  const overCharacter = (x: number, y: number): boolean => {
    const inside = (r: DOMRect) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
    return inside(renderer.characterRect()) || inside(renderer.matRect());
  };
  const offerZip = async (d: FilesDropped): Promise<void> => {
    try {
      follow.end('interrupt');
      if (sleep.sleeping) await sleep.wake('command');
      scheduler.notifyActivity();
      agent.interrupt();
      const choice = await agent.ask(dropLine(d), [{ id: 'zip', label: 'Zip it' }, { id: 'no', label: 'No thanks' }]);
      if (choice !== 'zip') {
        await clearDropped();
        if (choice === 'no') await speakKind('zipNo');
        return;
      }
      const name = await zipDropped();
      await clearDropped();
      if (!name) { await speakKind('zipFail'); return; }
      void agent.play('Congratulate');
      const done = await content.next('zipDone');
      const next = await agent.ask(done.text, [{ id: 'show', label: isMac ? 'Show in Finder' : 'Show in folder' }, { id: 'ok', label: 'Thanks' }]);
      if (next === 'show') await revealZip();
    } catch (e) {
      console.warn('zip flow failed', e);
    }
  };
  void onFileDrag((e) => {
    if (e.phase === 'leave' || agent.hidden || sleep.sleeping || thrower.flying || !overCharacter(e.x, e.y)) { endOoh(); return; }
    if (oohActive) return;
    oohActive = true;
    follow.end('interrupt');
    agent.interrupt();
    void agent.play('Ooh', 30_000); // loops until the drag leaves or drops; the 30 s is only a safety net
  }).catch((e) => console.warn('file-drag listener failed', e));
  void onFilesDropped((d) => {
    endOoh();
    // Only a drop on the character counts (the window ignores the pointer elsewhere, but be explicit).
    if (agent.hidden || !overCharacter(d.x, d.y)) { void clearDropped(); return; }
    void offerZip(d);
  }).catch((e) => console.warn('files-dropped listener failed', e));

  // Focus survives restarts (and sleep) through its stored end time.
  if (settings.focus && focus.resume(settings.focus.endsAt, settings.focus.minutes)) {
    renderer.setFocus(focusLabel(focus.minutesLeft()));
  }
  // Meeting heads-up: the toggle only shows where the platform supports it. Boot never prompts: it just
  // checks the stored permission and quietly switches the feature off if access was taken away.
  void calendarSupported().then(async (ok) => {
    calendarOk = ok;
    if (!ok) return;
    void onMeetingEvents((evs) => void handleMeetings(evs)).catch((e) => console.warn('meeting listener failed', e));
    if (!meetingHeadsUp) return;
    if ((await calendarStatus()) === 'granted') await calendarSetEnabled(true);
    else {
      meetingHeadsUp = false;
      void saveSettings({ meetingHeadsUp });
    }
    sync();
  });

  // Startup: restore position, then show (no flash at 0,0).
  await restorePosition(settings.position);
  void trackPosition();
  if (settings.hidden) {
    // User left Paperclip hidden in the tray last time: start hidden, tray left-click summons him.
    await agent.hide();
    sync(false);
    startPresence();
    return;
  }
  void agent.show();
  void agent.play('Greeting');
  void speakKind('greeting');
  scheduler.start();
  sleep.start();
  hydration.start();
  sync(true);
  startPresence();
}

void boot().catch((e) => console.warn('boot failed', e));
