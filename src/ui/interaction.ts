export interface InteractionHandlers {
  click(): void;
  doubleClick(): void;
  /** Three quick clicks on the clip (never the mat). */
  tripleClick(): void;
  contextMenu(x: number, y: number): void;
  dragStart(): void;
  /** A click on the yoga mat (not the clip): bounce. Fires on every tap, no click delay. */
  matTap(): void;
}

const onMat = (e: Event): boolean => e.target instanceof Element && e.target.closest('#mat') !== null;

const DRAG_THRESHOLD = 4;
/** Clicks closer together than this belong to one gesture; the gesture is decided when it has been quiet this long. */
const CLICK_DELAY = 250;

export function attachInteraction(
  target: HTMLElement,
  h: InteractionHandlers,
  startDragging: () => Promise<void>,
): () => void {
  let armed = false;
  let sx = 0;
  let sy = 0;
  let clickTimer: ReturnType<typeof setTimeout> | null = null;
  let clicks = 0; // our own counter: more predictable than MouseEvent.detail across webviews

  const clearClick = () => {
    if (clickTimer !== null) { clearTimeout(clickTimer); clickTimer = null; }
    clicks = 0;
  };
  const onDown = (e: MouseEvent) => {
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
  const onCtx = (e: MouseEvent) => {
    e.preventDefault();
    armed = false;
    h.contextMenu(e.clientX, e.clientY);
  };
  const onBlur = () => { armed = false; };

  target.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  target.addEventListener('contextmenu', onCtx);
  window.addEventListener('blur', onBlur);
  return () => {
    clearClick();
    target.removeEventListener('mousedown', onDown);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    target.removeEventListener('contextmenu', onCtx);
    window.removeEventListener('blur', onBlur);
  };
}
