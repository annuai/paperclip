import type { Platform } from './providers';

/** Every string the guide shows (spec section 5). */
export const COPY = {
  titles: { hello: 'Welcome', try: 'Try me', menus: 'Two menus', key: 'Get your key', ask: 'Ask me something' },
  hello: {
    balloon: "Hi, I'm Paperclip! I usually live in the corner of your screen. I've moved in here for a minute to show you around.",
    skip: 'Skip the tour',
  },
  try: {
    click: 'Click me once.',
    doubleClick: 'Now double-click me.',
    drag: 'Drag me along my mat. Give me a fling!',
    contextMenu: 'Right-click me.',
    done: "You've got it. The real me works the same way on your desktop.",
    tiles: {
      click: { title: 'Click', caption: 'My eyes follow you' },
      doubleClick: { title: 'Double-click', caption: 'I tell a joke' },
      drag: { title: 'Drag', caption: 'Move me, or fling me' },
      contextMenu: { title: 'Right-click', caption: 'Everything else' },
    },
    dragNote: 'On your desktop, drag moves me anywhere.',
    footnote: 'Triple-click for a quote. Tap the mat and I jump.',
  },
  menus: {
    balloon: 'Everything else lives in two menus.',
    rows: {
      menuPick: { title: 'Pick from my menu', text: 'Right-click me and choose Tell a joke.' },
      askBox: { title: 'Ask box', text: 'Double right-click me.' },
      tray: { title: 'Tray' },
    },
    holdThought: "Hold that thought: we'll ask for real in two steps.",
    trayFound: 'There it is! Click it any time to bring me back.',
    trayNote: 'Right-click the icon for the full menu.',
    desktopOnly: 'That one works on your desktop, once the tour is over.',
    askPrompt: "What's on your mind?",
  },
  key: {
    practiseFirst: "Let's practise first. Click Sign in.",
    signIn: 'Click Sign in.',
    createKey: 'Now Create key.',
    copy: 'Copy it.',
    paste: 'Click the practice field to paste.',
    practised: "Nice. That's all it takes.",
    practiceLabel: 'Practice',
    practiceField: 'Practice: click to paste',
    skipPractice: 'I know how, skip practice',
    illustration: 'Illustration',
    signInButton: 'Sign in',
    copyButton: 'Copy',
    keysTitle: 'API keys',
    stepNames: ['Sign in', 'Create a key', 'Copy and paste'],
    forReal: 'Now for real',
    forRealBalloon: 'Now for real. Open the keys page, do the same three things, and paste your key here.',
    open: 'Open the keys page',
    yourKey: 'Your key',
    show: 'Show key',
    hide: 'Hide key',
    save: 'Save',
    saved: 'Saved to your keychain.',
    saveAnyway: 'Save anyway',
    fixIt: 'Fix it',
    replace: 'Replace key',
    noKeyNeeded: 'Everything else works without a key.',
    online: "You'll need to be online.",
    keychainRefused: "Your keychain wouldn't take the key. Try again.",
    linuxKeyring: 'Paperclip needs a keyring such as GNOME Keyring or KWallet.',
    browserFailed: "I couldn't open your browser. Go to",
    playAgain: 'Play again',
  },
  ask: {
    balloon: 'Your turn. Ask me anything.',
    placeholder: 'Type your question',
    send: 'Ask',
    chips: ["What's a good stretch for my back?", 'Explain APIs in one sentence', 'Name a fun fact about paperclips'],
    privacy: 'Only what you type goes to {provider} and the model you picked.',
    again: 'Ask another',
    noKey: "No key yet, so I'll answer from what I know myself.",
    offline: { joke: 'Tell me a joke', quote: 'Give me a quote', tip: 'Give me a tip' },
    addKey: 'Add a key after all',
    unauthorized: "That key didn't work. Want to try a different one?",
    actions: { retry: 'Try again', fixKey: 'Fix the key', otherService: 'Try another service', freeModel: 'Use the free model', backToInput: 'Edit question', finish: 'Finish' },
  },
  footer: { back: '‹ Back', next: 'Next ›', skip: 'Skip ›', skipForNow: 'Skip for now ›', finish: 'Finish ›', start: "Let's go ›", skipLesson: 'Skip this one' },
} as const;

export function trayLine(p: Platform): string {
  if (p === 'windows') return 'Click the paperclip icon in the system tray, bottom right.';
  if (p === 'linux') return 'Click the paperclip icon in your system tray, if your desktop shows one.';
  return 'Click the paperclip icon in your menu bar.';
}
