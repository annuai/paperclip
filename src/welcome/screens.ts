// The first three screens (hello and the hands-on lessons) and the dispatcher for all five.
import { mountAskScreen } from './askScreen';
import type { ScreenContext, ScreenView } from './context';
import { COPY, trayLine } from './copy';
import { button, el } from './dom';
import { ROW_ART, gestureTile } from './explainers';
import type { GestureLesson } from './explainers';
import { LESSONS, activeLesson, setDraft, skipLesson } from './flow';
import type { Lesson, Screen } from './flow';
import { mountKeyScreen } from './keyScreen';
import { lessonKeyHint } from './stageKeys';

const NEXT_LESSON_MS = 600;

const SPOKEN: Record<Lesson, string> = {
  click: 'click Paperclip, or press Enter.',
  doubleClick: 'double-click Paperclip, or press D.',
  drag: 'drag Paperclip, or press the arrow keys.',
  contextMenu: 'right-click Paperclip, or press Shift F10.',
  menuPick: 'right-click Paperclip and choose Tell a joke, or press Shift F10.',
  askBox: 'double right-click Paperclip, or press Shift F10 twice.',
  tray: 'click the Paperclip tray icon, or skip this one.',
};

function mountHello(root: HTMLElement, c: ScreenContext): ScreenView {
  c.say(COPY.hello.balloon);
  root.append(button('textbtn', COPY.hello.skip, c.finish));
  return { update: () => c.say(COPY.hello.balloon), destroy: () => undefined };
}

/** Shared lesson bookkeeping: the active lesson appears a beat after the last one was ticked. */
function lessonPacer(c: ScreenContext, list: readonly Lesson[], paint: (active: Lesson | null) => void) {
  let showing: Lesson | null = activeLesson(c.get());
  let seen = '';
  let timer: ReturnType<typeof setTimeout> | null = null;
  const announce = (l: Lesson | null) => c.announce(l ? `Lesson ${list.indexOf(l) + 1} of ${list.length}: ${SPOKEN[l]}` : 'All lessons done.');
  return {
    update() {
      const s = c.get();
      const sig = list.map((l) => s.lessons[l]).join();
      if (sig === seen) return;
      const first = seen === '';
      seen = sig;
      if (timer !== null) clearTimeout(timer);
      if (first) {
        paint(showing);
        announce(showing);
        return;
      }
      c.announce('Done.');
      paint(null);
      timer = setTimeout(() => {
        showing = activeLesson(c.get());
        paint(showing);
        announce(showing);
      }, NEXT_LESSON_MS);
    },
    destroy() {
      if (timer !== null) clearTimeout(timer);
    },
  };
}

function lessonFoot(c: ScreenContext): { node: HTMLElement; paint(active: Lesson | null): void } {
  const node = el('div', 'under');
  const hint = el('span', 'note');
  const skip = button('textbtn', COPY.footer.skipLesson, () => c.set(skipLesson(c.get())));
  node.append(hint, skip);
  return {
    node,
    paint(active) {
      hint.textContent = active ? (lessonKeyHint(active) ?? '') : '';
      skip.hidden = !activeLesson(c.get());
    },
  };
}

function mountTry(root: HTMLElement, c: ScreenContext): ScreenView {
  const grid = el('div', 'grid');
  const foot = lessonFoot(c);
  root.append(grid, foot.node, el('p', 'note', `${COPY.try.dragNote} ${COPY.try.footnote}`));
  const list = LESSONS.try as readonly GestureLesson[];
  const pacer = lessonPacer(c, list, (active) => {
    const s = c.get();
    grid.innerHTML = list.map((l) => gestureTile(l, s.lessons[l], l === active)).join('');
    foot.paint(active);
    if (active) c.say(COPY.try[active as GestureLesson]);
    else if (!activeLesson(s)) c.say(COPY.try.done);
  });
  return { update: pacer.update, destroy: pacer.destroy };
}

function mountMenus(root: HTMLElement, c: ScreenContext): ScreenView {
  const m = COPY.menus;
  const rows = el('ol', 'rows');
  const askBox = el('form', 'field askbox hidden');
  const box = el('input');
  box.type = 'text';
  box.maxLength = 500;
  box.placeholder = COPY.ask.placeholder;
  box.setAttribute('aria-label', COPY.ask.placeholder);
  const send = el('button', 'save', 'Send');
  send.type = 'submit';
  askBox.append(box, send);
  askBox.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!box.value.trim()) return;
    c.set(setDraft(c.get(), box.value.trim()));
    askBox.classList.add('hidden');
    c.interject(m.holdThought);
  });
  box.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault(); // closes the box, not the guide
    askBox.classList.add('hidden');
  });
  c.stage.onAsk(() => {
    askBox.classList.remove('hidden');
    box.focus();
  });
  const foot = lessonFoot(c);
  root.append(rows, askBox, foot.node, el('p', 'note', m.trayNote));
  if (c.platform.sandbox) {
    root.append(button('textbtn', 'Simulate tray click', () => window.dispatchEvent(new CustomEvent('sandbox:tray'))));
  }
  void c.stage.play('LookUp');

  const text: Record<'menuPick' | 'askBox' | 'tray', string> = { menuPick: m.rows.menuPick.text, askBox: m.rows.askBox.text, tray: trayLine(c.get().platform) };
  const list = LESSONS.menus as readonly ('menuPick' | 'askBox' | 'tray')[];
  const pacer = lessonPacer(c, list, (active) => {
    const s = c.get();
    rows.innerHTML = '';
    for (const l of list) {
      const li = el('li', ['row', s.lessons[l], l === active ? 'active' : ''].filter(Boolean).join(' '));
      li.innerHTML = ROW_ART[l];
      const words = el('div');
      words.append(el('b', '', m.rows[l].title), el('span', '', text[l]));
      li.append(words, el('i', 'state', s.lessons[l] === 'done' ? '✓' : s.lessons[l] === 'skipped' ? 'skipped' : ''));
      rows.append(li);
    }
    foot.paint(active);
    c.say(m.balloon, active ? text[active as keyof typeof text] : undefined);
  });
  return {
    update: pacer.update,
    destroy() {
      pacer.destroy();
      c.stage.onAsk(() => c.say(text.askBox));
    },
  };
}

export function mountScreen(screen: Screen, root: HTMLElement, c: ScreenContext): ScreenView {
  if (screen === 'hello') return mountHello(root, c);
  if (screen === 'try') return mountTry(root, c);
  if (screen === 'menus') return mountMenus(root, c);
  if (screen === 'key') return mountKeyScreen(root, c);
  return mountAskScreen(root, c);
}
