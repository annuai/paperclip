// The welcome guide window: wires the pure flow to the stage, the screens and the platform. No logic worth testing lives here.
import { normalizeAskProvider } from '../agent/ask';
import type { AskProvider } from '../agent/ask';
import { normalizeOutfit } from '../art/outfits';
import { normalizeStyle } from '../art/style';
import type { Style } from '../art/style';
import { LocalContentProvider } from '../content/provider';
import type { ScreenContext, ScreenView } from './context';
import { COPY } from './copy';
import { button, el } from './dom';
import { CHAIN_CLIP } from './explainers';
import { SCREENS, back, forward, goto, initial, markKeySaved, next, perform, setProvider } from './flow';
import type { GuideState, Screen } from './flow';
import { createPlatform } from './platform';
import { mountScreen } from './screens';
import { createStage } from './stage';

const SPEECH_MS = 5000;
const SLIDE_MS = 175; // out, then the same again in

async function boot(): Promise<void> {
  const q = new URLSearchParams(location.search);
  const platform = createPlatform(q);
  // Told at once: the pet moves back in if it hears nothing, and a keychain question could take a while.
  void platform.toMain('guide:ready');
  const root = document.documentElement;
  const style = normalizeStyle(q.get('style') ?? 'flat');
  root.dataset.style = style;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const reducedMotion = motion.matches || (platform.sandbox && q.get('reduced') === '1');
  root.classList.toggle('reduced', reducedMotion);
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  const providers: AskProvider[] = ['openrouter', 'groq', 'anthropic'];
  const saved = await Promise.all(providers.map((p) => platform.keyStatus(p)));
  let state: GuideState = initial(q, { openrouter: saved[0], groq: saved[1], anthropic: saved[2] });
  const screenParam = q.get('screen') as Screen | null;
  if (platform.sandbox && screenParam && SCREENS.includes(screenParam)) state = goto(state, screenParam);
  let savedNow = false;

  const pane = document.querySelector('.pane') as HTMLElement;
  const foot = document.querySelector('.foot') as HTMLElement;
  const live = document.getElementById('announce') as HTMLElement;

  // ---- the balloon: the screen's instruction, or what he just said with the instruction underneath ----
  const balloon = el('div', 'bal');
  const line = el('h1');
  line.tabIndex = -1;
  const sub = el('p', 'balsub');
  balloon.append(line, sub);
  let instruction: [string, string] = ['', ''];
  let speech: [string, string] | null = null;
  let speechTimer: ReturnType<typeof setTimeout> | null = null;
  const paintBalloon = () => {
    const [main, small] = speech ?? instruction;
    line.textContent = main;
    sub.textContent = speech ? [speech[1], instruction[1] || instruction[0]].filter(Boolean).join(' · ') : small;
    sub.hidden = !sub.textContent;
  };
  const hush = () => {
    if (speechTimer !== null) clearTimeout(speechTimer);
    speechTimer = null;
    speech = null;
  };

  const content = new LocalContentProvider();
  const stage = createStage(document.getElementById('character') as HTMLElement, {
    style,
    outfit: normalizeOutfit(q.get('outfit')),
    reducedMotion,
    menuEl: document.getElementById('menu') as HTMLElement,
    content,
    say(text, attribution) {
      hush();
      speech = [text, attribution ? `— ${attribution}` : ''];
      speechTimer = setTimeout(() => { hush(); paintBalloon(); }, SPEECH_MS);
      paintBalloon();
    },
    onStyle(s: Style) {
      root.dataset.style = s;
      stage.setStyle(s);
      void platform.toMain('guide:style', { style: s });
    },
  });

  let view: ScreenView | null = null;
  let mounted: Screen | null = null;
  let leaving = false;

  const finish = () => {
    if (leaving) return;
    leaving = true;
    void platform.toMain('guide:finished', { keySaved: savedNow, asked: state.asked });
    document.getElementById('guide')?.classList.add('leaving');
    void stage.leave().then(() => platform.close());
  };

  const context: ScreenContext = {
    get: () => state,
    set(s) {
      for (const p of providers) if (s.keySaved[p] && !state.keySaved[p]) savedNow = true;
      state = s;
      paint();
    },
    stage,
    platform,
    content,
    reducedMotion,
    say(text, small = '') {
      instruction = [text, small];
      paintBalloon();
    },
    interject(text) {
      hush();
      context.say(text);
    },
    announce(text) {
      live.textContent = text;
    },
    model: () => q.get(state.provider === 'groq' ? 'groqModel' : state.provider === 'anthropic' ? 'claudeModel' : 'orModel') ?? '',
    finish,
  };

  // ---- footer ----
  const backBtn = button('ghost', COPY.footer.back, () => context.set(back(state)));
  const chain = el('div', 'chain');
  chain.setAttribute('aria-hidden', 'true');
  chain.innerHTML = SCREENS.map(() => `<span>${CHAIN_CLIP}</span>`).join('');
  const stepText = el('span', 'sr');
  const nextBtn = button('ghost forward', '', () => (state.screen === 'ask' ? finish() : context.set(next(state))));
  foot.append(backBtn, chain, stepText, nextBtn);

  const paintFoot = () => {
    const i = SCREENS.indexOf(state.screen);
    backBtn.style.visibility = i === 0 ? 'hidden' : 'visible';
    chain.querySelectorAll('span').forEach((s, n) => {
      s.classList.toggle('on', n <= i);
      s.classList.toggle('now', n === i);
    });
    stepText.textContent = `Step ${i + 1} of ${SCREENS.length}`;
    const f = forward(state);
    nextBtn.textContent = f.label;
    nextBtn.classList.toggle('primary', f.primary);
  };

  let slideTimer: ReturnType<typeof setTimeout> | null = null;
  const mount = (first: boolean) => {
    view?.destroy();
    stage.closeMenu();
    hush();
    mounted = state.screen;
    pane.textContent = '';
    pane.dataset.screen = state.screen;
    const body = el('div', 'screen');
    pane.append(balloon, body);
    view = mountScreen(state.screen, body, context);
    view.update();
    pane.classList.remove('out');
    if (!first) {
      line.focus({ preventScroll: true });
      context.announce(`Step ${SCREENS.indexOf(state.screen) + 1} of ${SCREENS.length}`);
    }
  };

  function paint(): void {
    paintFoot();
    if (state.screen === mounted) {
      view?.update();
      return;
    }
    if (slideTimer !== null) return; // the pending swap mounts whatever the state says then
    if (mounted === null || reducedMotion) {
      mount(mounted === null);
      return;
    }
    // Pane slides out, he hops, the new pane slides in. The old screen stops listening to state meanwhile.
    view?.destroy();
    view = null;
    pane.classList.add('out');
    void stage.play('Jump');
    slideTimer = setTimeout(() => {
      slideTimer = null;
      mount(false);
    }, SLIDE_MS);
  }

  stage.onGesture((l) => context.set(perform(state, l)));
  const tray = () => {
    const after = perform(state, 'tray');
    if (after === state) return;
    context.set(after);
    void stage.play('Noticed');
    context.interject(COPY.menus.trayFound);
  };
  window.addEventListener('sandbox:tray', tray);

  // Esc is "Skip the tour", unless a menu or a text box wanted it first.
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur();
    else finish();
  });
  // Loops rest whenever nobody is looking.
  const rest = () => {
    const typing = document.activeElement instanceof HTMLInputElement && document.activeElement.id === 'keyfield';
    root.classList.toggle('paused', document.hidden || !document.hasFocus() || typing);
  };
  window.addEventListener('blur', rest);
  window.addEventListener('focus', rest);
  document.addEventListener('visibilitychange', rest);

  await platform.onFromMain((ev, payload) => {
    const p = (payload ?? {}) as { start?: string; provider?: string; style?: string };
    if (ev === 'guide:tray') tray();
    else if (ev === 'guide:goto' && (p.start === 'key' || p.start === 'hello')) context.set(goto(state, p.start));
    else if (ev === 'guide:provider' && p.provider) context.set(setProvider(state, normalizeAskProvider(p.provider)));
    else if (ev === 'guide:style' && p.style) {
      const s = normalizeStyle(p.style);
      root.dataset.style = s;
      stage.setStyle(s);
    }
  });
  await platform.onKeyChanged((p) => {
    void platform.keyStatus(p).then((has) => {
      if (has === state.keySaved[p]) return;
      context.set(has ? markKeySaved(state, p) : { ...state, keySaved: { ...state.keySaved, [p]: false } });
    });
  });

  paint();
  await stage.enter();
}

void boot().catch((e) => console.warn('welcome guide failed to start', e));
