export interface InteractionHandlers {
  click(): void;
  doubleClick(): void;
  /** Three quick clicks on the clip (never the mat). */
  tripleClick(): void;
  /** Middle mouse button on the clip (never the mat): a quote, once it's clear no second middle click follows. */
  middleClick(): void;
  /** Two quick middle clicks, or two quick right clicks: open Ask Paperclip. */
  openAsk(): void;
  contextMenu(x: number, y: number): void;
  dragStart(): void;
  /** A click on the yoga mat (not the clip): bounce. Fires on every tap, no click delay. */
  matTap(): void;
}

const onMat = (e: Event): boolean => e.target instanceof Element && e.target.closest('#mat') !== null;

const DRAG_THRESHOLD = 4;
/** Clicks closer together than this belong to one gesture; the gesture is decided when it has been quiet this long. */
const CLICK_DELAY = 250;
/** A right click waits this long for a second one: two (within RIGHT_DOUBLE_DIST px) open Ask Paperclip,
 *  one alone opens the menu once the wait is over. */
const RIGHT_DOUBLE_MS = 400;
const RIGHT_DOUBLE_DIST = 12;
/** Two-finger clicks on a trackpad are often slower: a second one this soon still opens Ask, even though the menu
 *  is already up and under the pointer. */
const RIGHT_LATE_MS = 1000;
const RIGHT_LATE_DIST = 24;

export function attachInteraction(
  target: HTMLElement,
  h: InteractionHandlers,
  startDragging: () => Promise<void>,
): () => void {
  let armed = false;
  let sx = 0;
  let sy = 0;
  let clickTimer: ReturnType<typeof setTimeout> | null = null;
  let midArmed = false; // middle button pressed on the clip; fires on release nearby
  let mx = 0;
  let my = 0;
  let midTimer: ReturnType<typeof setTimeout> | null = null;
  let ctxTimer: ReturnType<typeof setTimeout> | null = null;
  let ctxX = 0;
  let ctxY = 0;
  let menuFrom: { at: number; x: number; y: number } | null = null; // the right click that opened the menu
  let clicks = 0; // our own counter: more predictable than MouseEvent.detail across webviews

  const clearClick = () => {
    if (clickTimer !== null) { clearTimeout(clickTimer); clickTimer = null; }
    clicks = 0;
  };
  const onDown = (e: MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault(); // no autoscroll / paste-on-middle-click
      midArmed = !onMat(e);
      mx = e.clientX;
      my = e.clientY;
      return;
    }
    if (e.button !== 0) return;
    armed = true;
    sx = e.clientX;
    sy = e.clientY;
  };
  const onMove = (e: MouseEvent) => {
    if (!armed) return;
    if (Math.hypot(e.clientX - sx, e.clientY - sy) > DRAG_THRESHOLD) {
      armed = false;
      clearClick(); // a drag is never a click
      h.dragStart();
      startDragging().catch((err) => console.warn('startDragging failed', err));
    }
  };
  const onUp = (e: MouseEvent) => {
    if (e.button === 1) {
      const fire = midArmed && Math.hypot(e.clientX - mx, e.clientY - my) <= DRAG_THRESHOLD;
      midArmed = false;
      if (!fire) return;
      clearClick();
      if (midTimer !== null) { // second middle click in time: Ask Paperclip instead of a quote
        clearTimeout(midTimer);
        midTimer = null;
        h.openAsk();
        return;
      }
      midTimer = setTimeout(() => { midTimer = null; h.middleClick(); }, CLICK_DELAY);
      return;
    }
    if (e.button !== 0 || !armed) return;
    armed = false;
    if (onMat(e)) { h.matTap(); return; } // mat taps bounce at once and never count toward a multi-click
    clicks++;
    if (clickTimer !== null) { clearTimeout(clickTimer); clickTimer = null; }
    if (clicks >= 3) { clicks = 0; h.tripleClick(); return; }
    clickTimer = setTimeout(() => {
      clickTimer = null;
      const n = clicks;
      clicks = 0;
      if (n === 1) h.click(); // single click: eye-follow
      else h.doubleClick(); // double click: a joke, after waiting to see whether a third click turns it into a quote
    }, CLICK_DELAY);
  };
  const clearCtx = () => {
    if (ctxTimer !== null) { clearTimeout(ctxTimer); ctxTimer = null; }
  };
  const onCtx = (e: MouseEvent) => {
    e.preventDefault();
    armed = false;
    if (ctxTimer !== null && Math.hypot(e.clientX - ctxX, e.clientY - ctxY) <= RIGHT_DOUBLE_DIST) {
      clearCtx(); // second right click in time: Ask Paperclip, and the menu never opens
      clearClick();
      h.openAsk();
      return;
    }
    clearCtx();
    ctxX = e.clientX;
    ctxY = e.clientY;
    const at = Date.now();
    menuFrom = null;
    ctxTimer = setTimeout(() => {
      ctxTimer = null;
      menuFrom = { at, x: ctxX, y: ctxY };
      h.contextMenu(ctxX, ctxY);
    }, RIGHT_DOUBLE_MS);
  };
  const onLateCtx = (e: MouseEvent) => {
    const first = menuFrom;
    if (!first) return;
    const on = e.target instanceof Element && (target.contains(e.target) || e.target.closest('.menu') !== null);
    if (!on || Date.now() - first.at > RIGHT_LATE_MS || Math.hypot(e.clientX - first.x, e.clientY - first.y) > RIGHT_LATE_DIST) return;
    menuFrom = null;
    e.preventDefault();
    e.stopPropagation(); // neither the menu nor the clip sees it as a new right click
    clearClick();
    h.openAsk();
  };
  const onBlur = () => { armed = false; midArmed = false; };

  target.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  window.addEventListener('contextmenu', onLateCtx, true);
  target.addEventListener('contextmenu', onCtx);
  window.addEventListener('blur', onBlur);
  return () => {
    clearClick();
    if (midTimer !== null) { clearTimeout(midTimer); midTimer = null; }
    clearCtx();
    target.removeEventListener('mousedown', onDown);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('contextmenu', onLateCtx, true);
    target.removeEventListener('contextmenu', onCtx);
    window.removeEventListener('blur', onBlur);
  };
}
