// Keyboard equivalents for every gesture on the guide's Paperclip, so each lesson can be done without a mouse.
import type { Lesson } from './flow';

export type StageKey = 'click' | 'doubleClick' | 'dragLeft' | 'dragRight' | 'flingLeft' | 'flingRight' | 'contextMenu';
/** Two context-menu presses this close together mean "double right-click". */
export const DOUBLE_CONTEXT_MS = 400;

export function keyGesture(e: { key: string; shiftKey: boolean }): StageKey | null {
  switch (e.key) {
    case 'Enter':
    case ' ':
      return 'click';
    case 'd':
    case 'D':
      return 'doubleClick';
    case 'ArrowLeft':
      return e.shiftKey ? 'flingLeft' : 'dragLeft';
    case 'ArrowRight':
      return e.shiftKey ? 'flingRight' : 'dragRight';
    case 'ContextMenu':
      return 'contextMenu';
    case 'F10':
      return e.shiftKey ? 'contextMenu' : null;
    default:
      return null;
  }
}

const HINTS: Record<Lesson, string | null> = {
  click: 'Keyboard: press Enter on me.',
  doubleClick: 'Keyboard: press D',
  drag: 'Keyboard: use the arrow keys (Shift to fling)',
  contextMenu: 'Keyboard: press Shift+F10',
  menuPick: 'Keyboard: press Shift+F10, then pick with the arrows',
  askBox: 'Keyboard: press Shift+F10 twice quickly',
  tray: null,
};
export const lessonKeyHint = (l: Lesson): string | null => HINTS[l];
