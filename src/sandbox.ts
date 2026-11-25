// Dev-only pose sandbox: http://localhost:1420/?sandbox (plain browser, no Tauri).
import { ANIMATIONS } from './anim/animations';
import { Animator } from './anim/animator';
import { HIDDEN, NEUTRAL, poseEquals } from './anim/pose';
import { EXIT_ANIMS, SLEEP_POSE } from './anim/animations';
import { mergePose } from './anim/pose';
import type { AnimName } from './anim/types';
import { Renderer } from './art/renderer';
import { normalizeStyle } from './art/style';
import type { Style } from './art/style';
import { Balloon } from './ui/balloon';

/** ?sandbox[&style=flat][&compare]  -  compare shows Classic and Flat side by side. */
export function runSandbox(): void {
  const q = new URLSearchParams(location.search);
  const style: Style = normalizeStyle(q.get('style'));
  const compare = q.has('compare');
  document.documentElement.style.background = '#6b8cae';
  document.body.style.background = '#6b8cae';
  const stage = document.getElementById('stage') as HTMLElement;
  stage.style.outline = '1px dashed rgba(255,255,255,.5)';
  const renderers: Renderer[] = [new Renderer(document.getElementById('character') as HTMLElement, compare ? 'classic' : style)];
  const balloons: Balloon[] = [];
  if (compare) {
    const wrap = document.createElement('div');
    wrap.dataset.style = 'flat';
    wrap.style.cssText = 'position:absolute;left:340px;top:0;width:320px;height:380px';
    wrap.innerHTML = stage.outerHTML;
    document.body.append(wrap);
    const s2 = wrap.firstElementChild as HTMLElement;
    s2.style.outline = '1px dashed rgba(255,255,255,.5)';
    renderers.push(new Renderer(s2.querySelector('#character') as HTMLElement, 'flat', wrap));
    balloons.push(new Balloon(s2.querySelector('#balloon') as HTMLElement, () => undefined));
  }
  const animator = new Animator({ render: (p) => renderers.forEach((r) => r.render(p)) });
  animator.setPose(NEUTRAL);
  balloons.unshift(new Balloon(document.getElementById('balloon') as HTMLElement, () => undefined));
  const speakAll = (t: string, a?: string) => balloons.forEach((b) => void b.speak(t, a));

  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;left:'+(compare ? 680 : 340)+'px;top:8px;font:12px system-ui;color:#fff;max-width:520px';
  document.body.append(panel);
  const log = document.createElement('pre');
  log.id = 'sandbox-log';
  log.style.cssText = 'white-space:pre-wrap;margin:8px 0 0';
  const names = Object.keys(ANIMATIONS) as AnimName[];
  const mk = (label: string, fn: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.margin = '2px';
    b.onclick = fn;
    panel.append(b);
  };
  const playOne = async (n: AnimName): Promise<boolean> => {
    const p = animator.play(ANIMATIONS[n]);
    const t = setTimeout(() => animator.exit(), 1500);
    await p;
    clearTimeout(t);
    const pose = animator.pose;
    const ok = EXIT_ANIMS.includes(n) ? poseEquals(pose, HIDDEN) : n === 'FallAsleep' || n === 'Sleeping' ? poseEquals(pose, mergePose(NEUTRAL, SLEEP_POSE)) : poseEquals(pose, NEUTRAL);
    log.textContent += `${ok ? 'OK  ' : 'FAIL'} ${n}\n`;
    return ok;
  };
  for (const n of names) mk(n, () => void playOne(n));
  mk('PLAY ALL', async () => {
    log.textContent = '';
    let all = true;
    for (const n of names) {
      all = (await playOne(n)) && all;
      if (EXIT_ANIMS.includes(n)) animator.setPose(NEUTRAL);
      if (n === 'FallAsleep' || n === 'Sleeping') animator.setPose(NEUTRAL);
    }
    animator.setPose(mergePose(NEUTRAL, {}));
    log.textContent += all ? 'ALL OK\n' : 'SOME FAILED\n';
  });
  const long = 'x'.repeat(0) + 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercit.';
  mk('Balloon 180', () => speakAll(long.slice(0, 180), 'Someone Famous'));
  mk('Water reminder (balloon with actions)', () => {
    const actions = [{ id: 'drank', label: 'Drank some' }, { id: 'later', label: 'Later' }];
    void playOne('Drink').then(() =>
      balloons.forEach((b) =>
        void b.speak('Hydration check! Your brain is mostly water. Top it up?', undefined, actions).then((r) => {
          log.textContent += `balloon -> ${r}\n`;
        })),
    );
  });
  mk('Balloon short', () => speakAll('Imagination is more important than knowledge.', 'Albert Einstein'));
  if (!compare) mk('Toggle style', () => renderers[0].setStyle(renderers[0].style === 'flat' ? 'classic' : 'flat'));
  panel.append(log);

  // ?sandbox&compare&shot=<scene>: static, chrome-free scenes for README screenshots
  // (see scripts/screenshots.sh). Scenes: quote | water | sleep | jump | dizzy.
  const shot = q.get('shot');
  if (shot) {
    panel.style.display = 'none';
    const bg = '#' + (q.get('bg') ?? 'E9ECF1');
    document.documentElement.style.background = bg;
    document.body.style.background = bg;
    document.querySelectorAll<HTMLElement>('#stage').forEach((s) => { s.style.outline = 'none'; });
    const frame = (n: AnimName, i: number) => mergePose(NEUTRAL, ANIMATIONS[n].frames[i].pose ?? {});
    if (shot === 'water') {
      const actions = [{ id: 'drank', label: 'Drank some' }, { id: 'later', label: 'Later' }];
      balloons.forEach((b) => void b.speak('Hydration check! Your brain is mostly water. Top it up?', undefined, actions));
    } else if (shot === 'sleep') {
      animator.setPose(mergePose(NEUTRAL, SLEEP_POSE));
      renderers.forEach((r) => r.setSleeping(true));
    } else if (shot === 'jump') {
      animator.setPose(frame('Jump', 2));
    } else if (shot === 'dizzy') {
      animator.setPose(frame('Dizzy', 0));
    } else {
      speakAll('Imagination is more important than knowledge.', 'Albert Einstein');
    }
    return;
  }
  if (compare) speakAll('Imagination is more important than knowledge.', 'Albert Einstein');
}
