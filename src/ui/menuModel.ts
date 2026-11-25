import { INTERVAL_OPTIONS } from '../agent/hydration';
import type { IntervalMin } from '../agent/hydration';
import { FOCUS_OPTIONS } from '../agent/focus';
import { STRETCH_OPTIONS } from '../agent/stretch';
import type { StretchMin } from '../agent/stretch';
import { FREE_MODEL, GROQ_FAST_MODEL, GROQ_SMART_MODEL, PAID_HAIKU_MODEL, isPresetGroqModel, isPresetModel } from '../agent/ask';
import type { AskModel, AskProvider, ClaudeModel, GroqModel } from '../agent/ask';
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
  ask: { keySet: boolean; provider: AskProvider; model: AskModel; groqModel: GroqModel; claudeModel: ClaudeModel };
}

/**
 * The main menu. It must stay short (the window is 380 px tall and the menu already scrolls), so the reminder-like
 * features live under ONE "Wellbeing" row whose submenus open inside the sub-panel. Add new features there
 * (or in a similar group), never as another top-level row.
 * "Check for updates…" sits inside the Presence submenu for the same reason (no new top-level row).
 * The one exception is "Ask Paperclip": a headline action like Say hi / Tell a joke, so it gets its own row. It is a
 * single submenu (ask, provider, key management, model choice) rather than several rows, and the row-count pin test was updated for it.
 */
export function buildMenu(s: MenuState): MenuItem[] {
  return [
    { id: 'hi', label: 'Say hi' },
    { id: 'joke', label: 'Tell a joke' },
    { id: 'quote', label: 'Give a quote' },
    { id: 'tip', label: 'Give me a tip' },
    {
      id: 'ask', label: 'Ask Paperclip',
      children: [
        { id: 'ask-open', label: 'Ask a question…' },
        { id: 'ask-provider-openrouter', label: 'OpenRouter', role: 'radio' as const, checked: s.ask.provider !== 'anthropic' && s.ask.provider !== 'groq', separatorBefore: true },
        { id: 'ask-provider-groq', label: 'Groq', role: 'radio' as const, checked: s.ask.provider === 'groq' },
        { id: 'ask-provider-anthropic', label: 'Claude (Anthropic)', role: 'radio' as const, checked: s.ask.provider === 'anthropic' },
        { id: 'ask-key', label: s.ask.provider === 'anthropic' ? 'Set Claude API key…' : s.ask.provider === 'groq' ? 'Set Groq API key…' : 'Set OpenRouter API key…', separatorBefore: true },
        ...(s.ask.keySet ? [{ id: 'ask-remove', label: 'Remove API key' }] : []),
        ...(s.ask.provider === 'groq'
          ? [
              { id: 'ask-groq-fast', label: 'Fast answers (Llama 3.3 70B)', role: 'radio' as const, checked: s.ask.groqModel === GROQ_FAST_MODEL, separatorBefore: true },
              { id: 'ask-groq-smart', label: 'Smarter answers (GPT-OSS 120B)', role: 'radio' as const, checked: s.ask.groqModel === GROQ_SMART_MODEL },
              { id: 'ask-groq-other', label: isPresetGroqModel(s.ask.groqModel) ? 'Other model…' : s.ask.groqModel, role: 'radio' as const, checked: !isPresetGroqModel(s.ask.groqModel) },
            ]
          : s.ask.provider === 'anthropic'
          ? [
              { id: 'ask-claude-haiku', label: 'Fast answers (Haiku)', role: 'radio' as const, checked: s.ask.claudeModel !== 'claude-sonnet-5-5', separatorBefore: true },
              { id: 'ask-claude-sonnet', label: 'Smarter answers (Sonnet)', role: 'radio' as const, checked: s.ask.claudeModel === 'claude-sonnet-5-5' },
            ]
          : [
              { id: 'ask-model-free', label: 'Free (Gemma 4 31B)', role: 'radio' as const, checked: s.ask.model === FREE_MODEL, separatorBefore: true },
              { id: 'ask-model-haiku', label: 'Claude Haiku 5.5 (paid)', role: 'radio' as const, checked: s.ask.model === PAID_HAIKU_MODEL },
              { id: 'ask-model-other', label: isPresetModel(s.ask.model) ? 'Other model…' : s.ask.model, role: 'radio' as const, checked: !isPresetModel(s.ask.model) },
            ]),
      ],
    },
    { id: 'animate', label: 'Animate!' },
    { id: 'nap', label: s.sleeping ? 'Wake up' : 'Take a nap' },
    { id: 'quiet', label: 'Quiet mode', checked: s.quiet, separatorBefore: true },
    { id: 'greet', label: 'Greet me when I unlock', checked: s.greetOnUnlock },
    {
      id: 'presence', label: 'Presence',
      children: [
        { id: 'presence-hide', label: 'Hide when presenting', role: 'checkbox', checked: s.hideWhenPresenting },
        { id: 'presence-music', label: 'Dance to music', role: 'checkbox', checked: s.reactToMusic },
        { id: 'update-check', label: 'Check for updates…', separatorBefore: true },
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
