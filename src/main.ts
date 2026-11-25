import { IDLE_ANIMS, SHOWY_ANIMS } from './anim/animations';
import { Animator } from './anim/animator';
import { HIDDEN } from './anim/pose';
import { Agent } from './agent/agent';
import { DizzyDetector, DIZZY_IDLE_MS } from './agent/dizzy';
import type { Style } from './art/style';
import { HydrationScheduler, INTERVAL_OPTIONS } from './agent/hydration';
import type { IntervalMin } from './agent/hydration';
import { DEFAULT_SLEEP, SleepController } from './agent/sleep';
import { DEFAULT_SCHEDULER, IdleScheduler } from './agent/scheduler';
import { Renderer } from './art/renderer';
import { LocalContentProvider } from './content/provider';
import type { ContentKind, ContentProvider } from './content/provider';
import { loadSettings, restorePosition, saveSettings, trackPosition } from './platform/settings';
import { getDebugHit, onCursor, onSessionUnlocked, onTrayAction, pushHitRects, quitApp, setEyeFollow, syncTray, win } from './platform/tauri';
import { WelcomeBack, WelcomeLines } from './agent/welcomeBack';
import { EyeFollow, EyeTracker, characterClick, computeTarget } from './agent/eyeFollow';
import type { Pose } from './anim/pose';
import { Balloon } from './ui/balloon';
import { ContextMenu } from './ui/contextMenu';
import type { MenuItem } from './ui/contextMenu';
import { HitRects } from './ui/hitRects';
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

  const charEl = document.getElementById('character') as HTMLElement;
  let style: Style = settings.style;
  const renderer = new Renderer(charEl, style);
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
  const menuEl = document.getElementById('menu') as HTMLElement;
  const balloon = new Balloon(balloonEl, (v) => hit.set('balloon', v ? rectOf(balloonEl) : null));
  const menu = new ContextMenu(menuEl, (id) => void runCommand(id), (v) => hit.set('menu', v ? menu.rect() : null));

  const agent = new Agent({ animator, balloon, win });
  agent.onIdle(updateHit);
  const content: ContentProvider = new LocalContentProvider();

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
    isBusy: () => agent.busy || balloon.visible || menu.visible || follow.active,
  });

  const scheduler = new IdleScheduler(
    { ...DEFAULT_SCHEDULER, ...settings.scheduler, quiet },
    {
      blink: () => void agent.play('Blink'),
      idleAnim: () => {
        if (!sleep.maybeIdleSleep()) void agent.play(pick(Math.random, IDLE_ANIMS));
      },
      talk: () => void speakRandom(),
      // Eye-follow pauses idle animations and chatter, but blinks continue.
      isBusy: (kind) => agent.busy || balloon.visible || menu.visible || sleep.sleeping || (follow.active && kind !== 'blink'),
    },
  );

  // Water reminders: independent of quiet mode; persisted cadence + daily glass count.
  let reminderOpen = false;
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
      isHidden: () => agent.hidden,
      isBlocked: () => reminderOpen || balloon.visible || menu.visible,
      save: () => persistWater(),
    },
  );
  hydration.onChange(() => sync());

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
    }, greetOnUnlock);
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

  const hideNow = async () => {
    follow.end('hide');
    sleep.reset();
    sleep.stop();
    hydration.stop();
    renderer.setSleeping(false);
    agent.interrupt(true);
    await agent.hide();
    scheduler.stop();
    sync(false);
    void saveSettings({ hidden: true });
  };
  const showNow = async () => {
    sync(true);
    void saveSettings({ hidden: false });
    await agent.show();
    scheduler.start();
    sleep.start();
    hydration.start();
    updateHit();
  };

  async function runCommand(id: string, checked?: boolean): Promise<void> {
    try {
      if (sleep.sleeping && !['nap', 'tray-click', 'style-classic', 'style-flat', 'quit', 'hide', 'toggle', 'quiet', 'greet'].includes(id) && !id.startsWith('water-')) await sleep.wake('command');
      switch (id) {
        case 'style-classic':
        case 'style-flat':
          setStyle(id === 'style-flat' ? 'flat' : 'classic');
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

  const menuItems = (): MenuItem[] => [
    { id: 'hi', label: 'Say hi' },
    { id: 'joke', label: 'Tell a joke' },
    { id: 'quote', label: 'Give a quote' },
    { id: 'tip', label: 'Give me a tip' },
    { id: 'animate', label: 'Animate!' },
    { id: 'nap', label: sleep.sleeping ? 'Wake up' : 'Take a nap' },
    { id: 'quiet', label: 'Quiet mode', checked: quiet, separatorBefore: true },
    { id: 'greet', label: 'Greet me when I unlock', checked: greetOnUnlock },
    {
      id: 'style', label: 'Style', separatorBefore: false,
      children: [
        { id: 'style-classic', label: 'Classic', role: 'radio', checked: style === 'classic' },
        { id: 'style-flat', label: 'Flat', role: 'radio', checked: style === 'flat' },
      ],
    },
    {
      id: 'water', label: 'Water reminders',
      children: [
        { id: 'water-enabled', label: 'Remind me', role: 'checkbox', checked: hydration.config.enabled },
        ...INTERVAL_OPTIONS.map((n) => ({ id: `water-${n}`, label: `Every ${n} min`, role: 'radio' as const, checked: hydration.config.intervalMin === n })),
        { id: 'water-now', label: 'Remind me now', separatorBefore: true },
        { id: 'water-info', label: `Today: ${hydration.glassesToday} ${hydration.glassesToday === 1 ? 'glass' : 'glasses'}`, disabled: true },
      ],
    },
    { id: 'hide', label: 'Hide', separatorBefore: true },
    { id: 'quit', label: 'Quit' },
  ];

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
      isQuiet: () => quiet,
      waitForReminder: () => (reminderOpen ? reminderWait : Promise.resolve()),
      wake: () => sleep.wake('reminder'), // WakeUp without the sleep line
      endFollow: () => follow.end('interrupt'),
      interrupt: () => agent.interrupt(),
      wave: () => agent.play('Greeting'),
      speak: (text) => agent.speak(text),
    },
    new WelcomeLines(),
  );
  void onSessionUnlocked((p) => void welcomeBack.onUnlock(p.awaySeconds)).catch((e) => console.warn('unlock listener failed', e));

  // Dizzy: native drags only report window moves, so watch onMoved (physical px -> logical px).
  const dizzy = new DizzyDetector();
  let dizzyTimer: ReturnType<typeof setTimeout> | null = null;
  void win
    .onMoved((p) => {
      const dpr = window.devicePixelRatio || 1;
      dizzy.move(p.x / dpr, p.y / dpr, performance.now());
      if (dizzyTimer !== null) clearTimeout(dizzyTimer);
      dizzyTimer = setTimeout(() => {
        dizzyTimer = null;
        if (!dizzy.consume(performance.now()) || agent.hidden) return;
        user();
        void agent.play('Dizzy');
        void speakKind('dizzy');
      }, DIZZY_IDLE_MS);
    })
    .catch((e) => console.warn('dizzy listener failed', e));

  // Startup: restore position, then show (no flash at 0,0).
  await restorePosition(settings.position);
  void trackPosition();
  if (settings.hidden) {
    // User left Paperclip hidden in the tray last time: start hidden, tray left-click summons him.
    await agent.hide();
    sync(false);
    return;
  }
  void agent.show();
  void agent.play('Greeting');
  void speakKind('greeting');
  scheduler.start();
  sleep.start();
  hydration.start();
  sync(true);
}

void boot().catch((e) => console.warn('boot failed', e));
