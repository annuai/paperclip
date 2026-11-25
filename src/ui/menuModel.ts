import { INTERVAL_OPTIONS } from '../agent/hydration';
import type { IntervalMin } from '../agent/hydration';
import { FOCUS_OPTIONS } from '../agent/focus';
import { STRETCH_OPTIONS } from '../agent/stretch';
import type { StretchMin } from '../agent/stretch';
import type { Style } from '../art/style';
import type { MenuItem } from './contextMenu';

/** Everything the right-click menu shows; main.ts fills it from live state. */
export interface MenuState {
  sleeping: boolean;
  quiet: boolean;
  greetOnUnlock: boolean;
  hideWhenPresenting: boolean;
  reactToMusic: boolean;
  outfits: boolean; // seasonal outfits on ('auto') or off
  style: Style;
  water: { enabled: boolean; intervalMin: IntervalMin; glassesToday: number };
  stretch: { enabled: boolean; everyMin: StretchMin };
  focusLeft: number | null; // whole minutes left while a focus session runs
  calendarSupported: boolean; // macOS only
  meetingHeadsUp: boolean;
}

/**
 * The main menu. It must stay short (the window is 380 px tall and the menu already scrolls), so the reminder-like
 * features live under ONE "Wellbeing" row whose submenus open inside the sub-panel. Add new features there
 * (or in a similar group), never as another top-level row.
 */
export function buildMenu(s: MenuState): MenuItem[] {
  return [
    { id: 'hi', label: 'Say hi' },
    { id: 'joke', label: 'Tell a joke' },
    { id: 'quote', label: 'Give a quote' },
    { id: 'tip', label: 'Give me a tip' },
    { id: 'animate', label: 'Animate!' },
    { id: 'nap', label: s.sleeping ? 'Wake up' : 'Take a nap' },
    { id: 'quiet', label: 'Quiet mode', checked: s.quiet, separatorBefore: true },
    { id: 'greet', label: 'Greet me when I unlock', checked: s.greetOnUnlock },
    {
      id: 'presence', label: 'Presence',
      children: [
        { id: 'presence-hide', label: 'Hide when presenting', role: 'checkbox', checked: s.hideWhenPresenting },
        { id: 'presence-music', label: 'Dance to music', role: 'checkbox', checked: s.reactToMusic },
      ],
    },
    {
      id: 'style', label: 'Style', separatorBefore: false,
      children: [
        { id: 'style-classic', label: 'Classic', role: 'radio', checked: s.style === 'classic' },
        { id: 'style-flat', label: 'Flat', role: 'radio', checked: s.style === 'flat' },
        { id: 'style-outfits', label: 'Seasonal outfits', role: 'checkbox', checked: s.outfits, separatorBefore: true },
      ],
    },
    {
      id: 'wellbeing', label: 'Wellbeing',
      children: [
        {
          id: 'water', label: 'Water reminders',
          children: [
            { id: 'water-enabled', label: 'Remind me', role: 'checkbox', checked: s.water.enabled },
            ...INTERVAL_OPTIONS.map((n) => ({ id: `water-${n}`, label: `Every ${n} min`, role: 'radio' as const, checked: s.water.intervalMin === n })),
            { id: 'water-now', label: 'Remind me now', separatorBefore: true },
            { id: 'water-info', label: `Today: ${s.water.glassesToday} ${s.water.glassesToday === 1 ? 'glass' : 'glasses'}`, disabled: true },
          ],
        },
        {
          id: 'stretch', label: 'Stretch breaks',
          children: [
            { id: 'stretch-enabled', label: 'Remind me', role: 'checkbox', checked: s.stretch.enabled },
            ...STRETCH_OPTIONS.map((n) => ({ id: `stretch-${n}`, label: `Every ${n} min`, role: 'radio' as const, checked: s.stretch.everyMin === n })),
            { id: 'stretch-now', label: 'Stretch now', separatorBefore: true },
          ],
        },
        {
          id: 'focus', label: s.focusLeft !== null ? `Focus: ${s.focusLeft} min left` : 'Focus timer',
          children: [
            ...FOCUS_OPTIONS.map((n) => ({ id: `focus-${n}`, label: `${n} minutes` })),
            ...(s.focusLeft !== null ? [{ id: 'focus-stop', label: 'Stop', separatorBefore: true }] : []),
          ],
        },
        ...(s.calendarSupported ? [{ id: 'meeting', label: 'Meeting heads-up', role: 'checkbox' as const, checked: s.meetingHeadsUp }] : []),
      ],
    },
    { id: 'hide', label: 'Hide', separatorBefore: true },
    { id: 'quit', label: 'Quit' },
  ];
}
