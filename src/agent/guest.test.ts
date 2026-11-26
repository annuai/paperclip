import { describe, expect, it } from 'vitest';
import { returnPlan, routeCommand } from './guest';

describe('routeCommand while he is in the welcome guide', () => {
  it('runs everything normally when no guide is open', () => {
    expect(routeCommand('none', 'joke')).toBe('run');
  });
  it('brings the guide forward for commands that need him on the desktop', () => {
    for (const id of ['joke', 'tray-click', 'toggle', 'hide', 'focus-25', 'water-now', 'stretch-now', 'ask-open', 'guide-open', 'ask-model-other', 'ask-groq-other']) {
      expect(routeCommand('away', id), id).toBe('focusGuide');
    }
    expect(routeCommand('leaving', 'hi')).toBe('focusGuide');
    expect(routeCommand('returning', 'hi')).toBe('focusGuide');
  });
  it('lets setting changes and quit through', () => {
    for (const id of ['style-flat', 'quiet', 'ask-provider-groq', 'quit', 'greet', 'water-enabled', 'water-30', 'focus-stop']) expect(routeCommand('away', id), id).toBe('run');
  });
});

describe('returnPlan', () => {
  const base = { wasHidden: false, fullscreen: false, hideWhenPresenting: true };
  it('keeps a user hide', () => expect(returnPlan({ ...base, wasHidden: true, fullscreen: true })).toBe('stayHidden'));
  it('re-applies an automatic hide while presenting', () => expect(returnPlan({ ...base, fullscreen: true })).toBe('adoptAutoHide'));
  it('shows him otherwise', () => {
    expect(returnPlan({ ...base, fullscreen: true, hideWhenPresenting: false })).toBe('show');
    expect(returnPlan(base)).toBe('show');
  });
});
