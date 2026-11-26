import { describe, expect, it } from 'vitest';
import { keyGesture, lessonKeyHint } from './stageKeys';
import { LESSONS } from './flow';

const k = (key: string, shiftKey = false) => keyGesture({ key, shiftKey });

describe('keyboard gestures', () => {
  it('maps keys to gestures', () => {
    expect(k('Enter')).toBe('click');
    expect(k(' ')).toBe('click');
    expect(k('d')).toBe('doubleClick');
    expect(k('D')).toBe('doubleClick');
    expect(k('ArrowLeft')).toBe('dragLeft');
    expect(k('ArrowRight')).toBe('dragRight');
    expect(k('ArrowLeft', true)).toBe('flingLeft');
    expect(k('ArrowRight', true)).toBe('flingRight');
    expect(k('ContextMenu')).toBe('contextMenu');
    expect(k('F10', true)).toBe('contextMenu');
    expect(k('F10')).toBeNull();
    expect(k('x')).toBeNull();
  });
  it('hints every lesson except the tray', () => {
    expect(lessonKeyHint('doubleClick')).toBe('Keyboard: press D');
    for (const l of [...LESSONS.try, ...LESSONS.menus]) {
      if (l === 'tray') expect(lessonKeyHint(l)).toBeNull();
      else expect(lessonKeyHint(l)).toMatch(/^Keyboard: /);
    }
  });
});
