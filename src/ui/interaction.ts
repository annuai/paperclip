export interface InteractionHandlers {
  click(): void;
  doubleClick(): void;
  contextMenu(x: number, y: number): void;
  dragStart(): void;
  /** A click on the yoga mat (not the clip): bounce. Fires on every tap, no click delay. */
  matTap(): void;
}

const onMat = (e: Event): boolean => e.target instanceof Element && e.target.closest('#mat') !== null;

const DRAG_THRESHOLD = 4;
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

  const clearClick = () => {
    if (clickTimer !== null) { clearTimeout(clickTimer); clickTimer = null; }
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
      clearClick();
      h.dragStart();
      startDragging().catch((err) => console.warn('startDragging failed', err));
    }
  };
  const onUp = (e: MouseEvent) => {
    if (e.button !== 0 || !armed) return;
    armed = false;
    clearClick();
    if (onMat(e)) { h.matTap(); return; }
    clickTimer = setTimeout(() => { clickTimer = null; h.click(); }, CLICK_DELAY);
  };
  const onDbl = (e: MouseEvent) => {
    if (onMat(e)) return; // rapid mat taps are bounces, not a double-click joke
    clearClick();
    h.doubleClick();
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
  target.addEventListener('dblclick', onDbl);
  target.addEventListener('contextmenu', onCtx);
  window.addEventListener('blur', onBlur);
  return () => {
    clearClick();
    target.removeEventListener('mousedown', onDown);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    target.removeEventListener('dblclick', onDbl);
    target.removeEventListener('contextmenu', onCtx);
    window.removeEventListener('blur', onBlur);
  };
}
