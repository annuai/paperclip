// Paperclip as the guide's host: the real renderer and animator, with the pet's gestures practised in place.
import { ANIMATIONS } from '../anim/animations';
import { Animator } from '../anim/animator';
import { HIDDEN, NEUTRAL } from '../anim/pose';
import type { Pose } from '../anim/pose';
import type { AnimName } from '../anim/types';
import { Renderer } from '../art/renderer';
import type { OutfitName } from '../art/outfits';
import type { Style } from '../art/style';
import { EyeTracker, ZERO_TARGET, computeTarget } from '../agent/eyeFollow';
import type { Pt } from '../agent/eyeFollow';
import type { ContentKind, ContentProvider } from '../content/provider';
import { attachInteraction } from '../ui/interaction';
import { ContextMenu } from '../ui/contextMenu';
import type { MenuItem } from '../ui/contextMenu';
import { COPY } from './copy';
import type { Lesson } from './flow';
import { DOUBLE_CONTEXT_MS, keyGesture } from './stageKeys';

const FOLLOW_MS = 4000;
const SLIDE_LIMIT = 52; // viewBox units either way: he stays on his mat
const FLING_SPEED = 1.2; // px per ms at release
const ROUGH_SPEED = 2.4;

export interface Stage {
  play(name: AnimName): Promise<void>;
  /** Enter on the mat (instant under reduced motion). */
  enter(): Promise<void>;
  /** Roll the mat up and leave. */
  leave(): Promise<void>;
  /** Turn his eyes to a point in the window (null = straight ahead again). */
  lookAt(p: Pt | null): void;
  setStyle(s: Style): void;
  onGesture(cb: (l: Lesson) => void): void;
  onAsk(cb: () => void): void;
  closeMenu(): void;
}

export interface StageOpts {
  style: Style;
  outfit: OutfitName;
  reducedMotion: boolean;
  menuEl: HTMLElement;
  content: ContentProvider;
  say(text: string, attribution?: string): void;
  onStyle(s: Style): void;
}

export function createStage(host: HTMLElement, o: StageOpts): Stage {
  const renderer = new Renderer(host, o.style, document.documentElement);
  renderer.setOutfit(o.outfit);
  const animator = new Animator({ render: (p) => renderer.render(p), reducedMotion: o.reducedMotion });
  animator.setPose(o.reducedMotion ? NEUTRAL : HIDDEN);

  const eyes = new EyeTracker();
  let slide = 0;
  animator.setOverlay((p: Pose): Pose => {
    const v = eyes.values;
    return {
      ...p,
      pupils: { x: p.pupils.x + v.px, y: p.pupils.y + v.py, conv: p.pupils.conv + v.conv },
      body: { ...p.body, x: p.body.x + slide, tilt: p.body.tilt + v.tilt },
    };
  });

  const play = (name: AnimName): Promise<void> => animator.play(ANIMATIONS[name]).then(() => undefined);
  const speak = (kind: ContentKind) => void o.content.next(kind).then((c) => o.say(c.text, c.attribution));

  // ---- eyes ----
  let lastMove = 0;
  let followTimer: ReturnType<typeof setTimeout> | null = null;
  let following = false;
  const aim = (p: Pt | null) => {
    const now = performance.now();
    // Targets arrive once (a lesson, a click) rather than in a stream, so settle on them in one go.
    const dt = following && p ? now - lastMove : 100;
    lastMove = now;
    const target = p ? computeTarget(renderer.eyeCentres(), p, o.reducedMotion) : ZERO_TARGET;
    eyes.update(target, dt);
    if (!following) for (let i = 0; i < 3; i++) eyes.update(target, 100);
    animator.refresh();
  };
  const onFollowMove = (e: MouseEvent) => aim({ x: e.clientX, y: e.clientY });
  const endFollow = () => {
    if (followTimer !== null) clearTimeout(followTimer);
    followTimer = null;
    following = false;
    document.removeEventListener('mousemove', onFollowMove);
    aim(null);
  };
  const follow = () => {
    endFollow();
    following = true;
    document.addEventListener('mousemove', onFollowMove);
    followTimer = setTimeout(endFollow, FOLLOW_MS);
  };

  // ---- gestures ----
  let gestureCb: (l: Lesson) => void = () => undefined;
  let askCb: () => void = () => undefined;
  const click = () => {
    follow();
    void play('Noticed');
    gestureCb('click');
  };
  const doubleClick = () => {
    void play('Wave');
    speak('joke');
    gestureCb('doubleClick');
  };

  let easing: number | null = null;
  const stopEase = () => {
    if (easing !== null) cancelAnimationFrame(easing);
    easing = null;
  };
  const slideHome = () => {
    stopEase();
    const from = slide;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 320);
      slide = from * (1 - k) * (1 - k);
      animator.refresh();
      easing = k < 1 ? requestAnimationFrame(step) : null;
    };
    easing = requestAnimationFrame(step);
  };
  const land = async (speed: number) => {
    gestureCb('drag');
    if (speed > FLING_SPEED) {
      slideHome();
      await play('Fling');
      await play(speed > ROUGH_SPEED ? 'Dizzy' : 'Thud');
    } else slideHome();
  };

  let downX = 0;
  host.addEventListener('mousedown', (e) => { downX = e.clientX; }, true);
  const startSlide = (): Promise<void> => {
    stopEase();
    endFollow();
    // viewBox units per CSS px, so he moves exactly with the pointer.
    const unit = 240 / (host.getBoundingClientRect().width || 240);
    const origin = downX - slide / unit;
    let lastX = downX;
    let lastT = performance.now();
    let speed = 0;
    const move = (e: MouseEvent) => {
      const t = performance.now();
      speed = Math.abs(e.clientX - lastX) / Math.max(t - lastT, 1);
      lastX = e.clientX;
      lastT = t;
      slide = Math.max(-SLIDE_LIMIT, Math.min(SLIDE_LIMIT, (e.clientX - origin) * unit));
      animator.refresh();
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      void land(performance.now() - lastT > 80 ? 0 : speed);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    return Promise.resolve();
  };

  // ---- the demo menu ----
  let style = o.style;
  const menu = new ContextMenu(o.menuEl, (id) => {
    if (id === 'demo-hi') {
      void play('Greeting');
      speak('greeting');
    } else if (id === 'demo-joke') speak('joke');
    else if (id === 'demo-quote') speak('quote');
    else if (id === 'style-classic' || id === 'style-flat') o.onStyle(id === 'style-flat' ? 'flat' : 'classic');
    gestureCb('menuPick');
  }, (visible) => {
    if (!visible && o.menuEl.contains(document.activeElement)) host.focus({ preventScroll: true });
  });
  const items = (): MenuItem[] => [
    { id: 'demo-hi', label: 'Say hi' },
    { id: 'demo-joke', label: 'Tell a joke' },
    { id: 'demo-quote', label: 'Give a quote' },
    {
      id: 'demo-style', label: 'Style',
      children: [
        { id: 'style-classic', label: 'Classic', role: 'radio', checked: style === 'classic' },
        { id: 'style-flat', label: 'Flat', role: 'radio', checked: style === 'flat' },
      ],
    },
    { id: 'demo-note', label: COPY.menus.demoLast, disabled: true, separatorBefore: true },
  ];
  const openMenu = (x: number, y: number) => {
    menu.open(x, y, items());
    gestureCb('contextMenu');
  };
  const openAsk = () => {
    menu.close();
    askCb();
    gestureCb('askBox');
  };

  attachInteraction(host, {
    click,
    doubleClick,
    tripleClick: () => speak('quote'),
    middleClick: () => speak('quote'),
    openAsk,
    contextMenu: openMenu,
    dragStart: () => menu.close(),
    matTap: () => void play('Jump'),
  }, startSlide);

  // ---- the same gestures from the keyboard ----
  let menuKeyTimer: ReturnType<typeof setTimeout> | null = null;
  host.addEventListener('keydown', (e) => {
    if (menu.visible) return; // the menu has the arrows and Enter
    const g = keyGesture(e);
    if (!g) return;
    e.preventDefault();
    e.stopPropagation();
    if (g === 'click') click();
    else if (g === 'doubleClick') doubleClick();
    else if (g === 'contextMenu') {
      if (menuKeyTimer !== null) {
        clearTimeout(menuKeyTimer);
        menuKeyTimer = null;
        openAsk();
        return;
      }
      menuKeyTimer = setTimeout(() => {
        menuKeyTimer = null;
        const r = host.getBoundingClientRect();
        openMenu(r.left + 20, r.top + 20);
        o.menuEl.querySelector<HTMLElement>('.item')?.dispatchEvent(new MouseEvent('mouseenter'));
      }, DOUBLE_CONTEXT_MS);
    } else {
      stopEase();
      const dir = g === 'dragLeft' || g === 'flingLeft' ? -1 : 1;
      slide = dir * SLIDE_LIMIT * 0.8;
      animator.refresh();
      void land(g.startsWith('fling') ? FLING_SPEED + 0.1 : 0);
    }
  });
  return {
    play,
    async enter() {
      if (o.reducedMotion) {
        animator.setPose(NEUTRAL);
        return;
      }
      await play('EnterSlide');
      await play('Greeting');
    },
    async leave() {
      menu.close();
      if (o.reducedMotion) return;
      await Promise.race([play('ExitRollUp'), new Promise<void>((r) => setTimeout(r, 1800))]);
    },
    lookAt: (p) => { if (!following) aim(p); },
    setStyle(s) {
      style = s;
      renderer.setStyle(s);
      animator.refresh();
    },
    onGesture: (cb) => { gestureCb = cb; },
    onAsk: (cb) => { askCb = cb; },
    closeMenu: () => menu.close(),
  };
}
