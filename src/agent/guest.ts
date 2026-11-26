// While the welcome guide is open Paperclip is a guest there: he is off the desktop, and this decides what menu and tray
// commands do meanwhile and how he comes home (spec 6.3). Pure, so main.ts only executes the answers.

export type Guest = 'none' | 'leaving' | 'away' | 'returning';

/** Commands that need him on the desktop (or open a desktop prompt): while he is away they bring the guide forward. */
export const GUIDE_FOCUS_COMMANDS: ReadonlySet<string> = new Set([
  'tray-click', 'toggle', 'hide', 'guide-open', 'hi', 'joke', 'quote', 'tip', 'animate', 'nap', 'ask-open', 'ask-key', 'ask-remove',
  'ask-model-other', 'ask-groq-other', 'update-check', 'water-now', 'stretch-now', 'focus-15', 'focus-25', 'focus-45', 'focus-60',
]);

export const routeCommand = (guest: Guest, id: string): 'focusGuide' | 'run' => (guest !== 'none' && GUIDE_FOCUS_COMMANDS.has(id) ? 'focusGuide' : 'run');

/** What to do when the guide closes. `wasHidden` means a user hide; an automatic one is re-decided here. */
export function returnPlan(c: { wasHidden: boolean; fullscreen: boolean; hideWhenPresenting: boolean }): 'stayHidden' | 'adoptAutoHide' | 'show' {
  if (c.wasHidden) return 'stayHidden';
  return c.fullscreen && c.hideWhenPresenting ? 'adoptAutoHide' : 'show';
}
