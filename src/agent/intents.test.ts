import { describe, expect, it } from 'vitest';
import { matchIntent, normalizeQuestion } from './intents';
import type { Intent } from './intents';

const kind = (s: string): string | null => matchIntent(s)?.kind ?? null;

describe('normalizeQuestion', () => {
  it.each([
    ['  Who   MADE you?!  ', 'who made you'],
    ["What's up, Paperclip?", 'whats up'],
    ['who made u', 'who made you'],
    ['can u dance pls', 'dance'],
    ['Please, start a 25-minute timer.', 'start a 25 minute timer'],
    ['Hey Paperclip, tell me a joke!', 'tell me a joke'],
    ['could you please wave', 'wave'],
    ['What can you do?', 'what can you do'],
    ['hello', ''],
  ])('%j -> %j', (input, out) => {
    expect(normalizeQuestion(input)).toBe(out);
  });
});

describe('matchIntent: aboutCreator', () => {
  it.each([
    'who built you', 'who made you', 'Who created you?', 'who designed you', 'who are you', 'Who are you?!', 'who are u',
    'where do you come from', 'where did you come from?', 'where are you from', 'who made u pls', 'who is your creator',
    'who is your designer', 'tell me who made you', 'hey paperclip, who built you?', 'who programmed you', 'who made this app',
    'can you tell me who built you',
  ])('%j', (q) => {
    expect(kind(q)).toBe('aboutCreator');
  });
  it.each([
    'who built the pyramids', 'who made the moon', 'who are you voting for', 'who made you a sandwich', 'who created the internet',
    'who built you a house', 'who made clippy', 'who is the creator of python', 'where do you come from in the building',
  ])('near-miss %j goes to the AI', (q) => {
    expect(matchIntent(q)).toBeNull();
  });
});

describe('matchIntent: capabilities', () => {
  it.each([
    'what can you do', 'What can you do?', 'what do you do', 'help', 'Help!', 'help me', 'what are your features', 'what can i ask you',
    'what can you do for me', 'what can u do', 'what are your abilities', 'how can you help me', 'show me what you can do',
    'what are you able to do', 'can you help', 'what can i ask you about', 'list your features',
  ])('%j', (q) => {
    expect(kind(q)).toBe('capabilities');
  });
  it.each([
    'what can you do about my taxes', 'what do you do for a living', 'help me with my homework', 'what can you do with a paperclip',
    'what can i ask my boss for', 'help me write an email', 'what are your thoughts on tea',
  ])('near-miss %j goes to the AI', (q) => {
    expect(matchIntent(q)).toBeNull();
  });
});

describe('matchIntent: animate', () => {
  const anim = (q: string): string | null => {
    const i = matchIntent(q);
    return i?.kind === 'animate' ? i.anim : null;
  };
  it.each([
    ['blink', 'Blink'], ['can you blink', 'Blink'], ['Can you blink?', 'Blink'], ['can you wink', 'Blink'], ['wink', 'Blink'],
    ['jump', 'Jump'], ['can you jump', 'Jump'], ['can u jump pls', 'Jump'], ['hop', 'Jump'], ['can you hop', 'Jump'], ['jump up and down', 'Jump'],
    ['wave', 'Wave'], ['can you wave', 'Wave'], ['wave at me', 'Wave'], ['wave hello', 'Wave'], ['give me a wave', 'Wave'],
    ['dance', 'Dance'], ['can you dance', 'Dance'], ['do a dance', 'Dance'], ['do a little dance', 'Dance'], ['show me a dance', 'Dance'], ['dance for me', 'Dance'],
    ['stretch', 'Stretch'], ['can you stretch', 'Stretch'], ['do a stretch', 'Stretch'],
    ['yawn', 'Yawn'], ['can you yawn', 'Yawn'], ['show me a yawn', 'Yawn'],
    ['spin', 'Dizzy'], ['can you spin', 'Dizzy'], ['spin around', 'Dizzy'], ['get dizzy', 'Dizzy'], ['can you get dizzy', 'Dizzy'], ['be dizzy', 'Dizzy'],
    ['celebrate', 'Celebrate'], ['can you celebrate', 'Celebrate'], ['do a celebration', 'Celebrate'], ['cheer', 'Celebrate'],
    ['think', 'Thinking'], ['can you think', 'Thinking'], ['show me thinking', 'Thinking'], ['do some thinking', 'Thinking'],
    ['look left', 'LookLeft'], ['can you look left', 'LookLeft'], ['look to the left', 'LookLeft'], ['look right', 'LookRight'], ['look up', 'LookUp'],
    ['look down', 'LookDown'], ['can you look down', 'LookDown'], ['look to the right pls', 'LookRight'],
  ])('%j plays %s', (q, a) => {
    expect(anim(q)).toBe(a);
  });

  it.each(['sleep', 'nap', 'can you sleep', 'take a nap', 'go to sleep', 'can you take a nap', 'can you nap', 'fall asleep', 'take a nap pls'])('%j is the nap command', (q) => {
    expect(kind(q)).toBe('nap');
  });

  it('replies in his voice, per animation', () => {
    const reply = (q: string) => (matchIntent(q) as Extract<Intent, { kind: 'animate' }>).reply;
    expect(reply('can you jump')).toBe('Yes I can!');
    expect(reply('wave')).toBe('Hi there!');
    expect(reply('blink')).toContain('Yes I can!');
    expect(reply('blink')).toContain('*blink*');
    expect(reply('wink')).toContain('*wink*');
  });

  it('blinks twice so it can be seen', () => {
    expect(matchIntent('blink')).toMatchObject({ kind: 'animate', anim: 'Blink', repeat: 2 });
    expect(matchIntent('jump')).toMatchObject({ kind: 'animate', anim: 'Jump', repeat: 1 });
  });

  it.each([
    'can you fly', 'can you do a backflip', 'can you jump over the moon', 'can you dance the tango with me tonight', 'dance like nobody is watching',
    'can you wave goodbye to my boss', 'can you look left and right and up', 'how do i sleep better', 'can you sleep in a bed', 'think about it',
    'jump to conclusions', 'do you dance', 'blink twice if you need help', 'look up the weather',
  ])('near-miss %j goes to the AI', (q) => {
    expect(matchIntent(q)).toBeNull();
  });
});

describe('matchIntent: timers', () => {
  const minutes = (q: string): number | null => {
    const i = matchIntent(q);
    return i?.kind === 'startTimer' ? i.minutes : null;
  };
  it.each([
    ['start a 25 minute timer', 25], ['start a 25 min timer', 25], ['Start a 25-minute timer', 25], ['set a 10 minute timer', 10], ['put a 5 min timer', 5],
    ['run a 45 minute timer', 45], ['set a timer for 25 minutes', 25], ['set timer for 30 mins', 30], ['set a timer for 15', 15], ['timer for 15', 15],
    ['timer for 15 minutes', 15], ['focus for 45 minutes', 45], ['focus for 20', 20], ['25 minute focus', 25], ['25 minute timer', 25], ['a 25 minute timer', 25],
    ['25 min focus timer', 25], ['pomodoro', 25], ['start a pomodoro', 25], ['pomodoro timer', 25], ['start a focus timer', 25], ['start focus mode', 25],
    ['can you start a 7 minute timer', 7], ['please start a 12 minute timer', 12], ['start a 1 minute timer', 1], ['start a 180 minute timer', 180],
    ['start a 137 minute timer', 137], ['start a 90 minute focus timer', 90], ['set a timer for 1 hour', 60], ['set a timer for an hour', 60],
    ['focus for half an hour', 30], ['start a 2 hour timer', 120], ['set a 25m timer', 25], ['hey paperclip set a timer for 20 minutes', 20],
    ['start a focus timer for 40 minutes', 40], ['set up a 10 minute timer', 10], ['start timer 15 minutes', 15],
  ])('%j -> %d minutes', (q, n) => {
    expect(minutes(q)).toBe(n);
  });

  it('out-of-range lengths get a helpful intent instead of the AI', () => {
    for (const q of ['start a 0 minute timer', 'start a 181 minute timer', 'set a timer for 500 minutes', 'focus for 4 hours']) expect(kind(q), q).toBe('timerRange');
  });

  it.each(['stop the timer', 'cancel timer', 'cancel the timer', 'stop my timer', 'stop the focus timer', 'cancel my focus session', 'stop focus', 'end the timer', 'can you stop the timer'])(
    '%j stops the timer',
    (q) => { expect(kind(q)).toBe('stopTimer'); },
  );

  it.each([
    'how much time is left', 'how much time is left on the timer', 'how much time is left on my timer', 'how much time left', 'time left',
    'how many minutes are left', 'how many minutes left', 'how much longer', 'whats the time left', 'how long is left', 'time remaining',
    'how much time is remaining on the timer', 'how long left on the timer',
  ])('%j reports the time left', (q) => {
    expect(kind(q)).toBe('timeLeft');
  });

  it.each([
    'what is a 25 minute timer', 'how do i set a timer in python', 'my timer app is broken', 'start a timer', 'set a timer for 15 dollars',
    'timer', 'start a 25 minute walk', 'stop', 'stop the music', 'cancel my subscription', 'how much time is left in the day',
    'how much time is left until christmas', 'start a 25 minute timer and then tell me a joke', 'focus', 'is 25 minutes enough',
    'how long is the movie', 'how much time do i have to live',
  ])('near-miss %j goes to the AI', (q) => {
    expect(matchIntent(q)).toBeNull();
  });
});

describe('matchIntent: water', () => {
  it.each([
    'remind me to drink water', 'Remind me to drink water!', 'remind me to drink some water', 'remind me to drink more water', 'remind me to stay hydrated',
    'remind me to hydrate', 'turn on water reminders', 'enable the water reminders', 'water reminders on', 'remind me about water', 'can you remind me to drink water',
    'remind me to drink water pls', 'start water reminders',
  ])('%j turns reminders on', (q) => {
    expect(matchIntent(q)).toEqual({ kind: 'water', action: 'on' });
  });
  it.each(['turn off water reminders', 'stop the water reminders', 'disable water reminders', 'stop reminding me to drink water', 'dont remind me to drink water'])(
    '%j turns reminders off',
    (q) => { expect(matchIntent(q)).toEqual({ kind: 'water', action: 'off' }); },
  );
  it.each([
    'i drank water', 'I drank some water', 'i had a glass', 'i had a glass of water', 'drank some water', 'i just drank a glass of water', 'i just had a glass',
    'just had a glass of water', 'log a glass', 'log a glass of water', 'i finished my water', 'i drank a glass', 'i had some water',
  ])('%j logs a glass', (q) => {
    expect(kind(q)).toBe('drankWater');
  });
  it.each([
    'remind me to call mom', 'remind me to drink water every 20 minutes', 'remind me to buy water', 'i had a glass of wine', 'i drank coffee', 'is water wet',
    'how much water should i drink', 'i had a glass of water with lunch', 'remind me to water the plants', 'water',
  ])('near-miss %j goes to the AI', (q) => {
    expect(matchIntent(q)).toBeNull();
  });
});

describe('matchIntent: joke and quote', () => {
  it.each([
    'tell me a joke', 'Tell me a joke!', 'another joke', 'one more joke', 'give me a joke', 'joke', 'joke pls', 'tell me another joke', 'got any jokes',
    'do you know any jokes', 'make me laugh', 'tell me a funny joke', 'can you tell me a joke', 'tell me a joke please', 'tell us a joke', 'more jokes', 'hit me with a joke',
  ])('%j', (q) => {
    expect(kind(q)).toBe('joke');
  });
  it.each([
    'give me a quote', 'Give me a quote!', 'inspire me', 'another quote', 'one more quote', 'quote', 'tell me a quote', 'share a quote', 'give me an inspirational quote',
    'motivate me', 'i need some inspiration', 'quote of the day', 'can you give me a quote', 'inspire me pls',
  ])('%j', (q) => {
    expect(kind(q)).toBe('quote');
  });
  it.each([
    'tell me a joke about my boss', 'what is a joke', 'give me a quote for my car insurance', 'who said that quote', 'is that a joke', 'tell me a story',
    'quote shakespeare', 'explain the joke', 'inspire me to write a poem', 'give me a quote from einstein',
  ])('near-miss %j goes to the AI', (q) => {
    expect(matchIntent(q)).toBeNull();
  });
});

describe('matchIntent: stretch, hide and style', () => {
  it.each([
    'lets stretch', "Let's stretch!", 'stretch with me', 'stretch together', 'time to stretch', 'can we stretch', 'start a stretch', 'start a stretch break',
    'lets do a stretch', 'guide me through a stretch', 'i need a stretch', 'lets stretch pls', 'stretch break', 'start stretching',
  ])('%j starts the guided stretch', (q) => {
    expect(kind(q)).toBe('stretch');
  });
  it('a bare "stretch" is the animation, not the guided session', () => {
    expect(kind('stretch')).toBe('animate');
    expect(kind('can you stretch')).toBe('animate');
  });
  it.each(['stretch my legs', 'how do i stretch my back', 'what is stretching good for', 'lets stretch the budget'])('near-miss %j goes to the AI', (q) => {
    expect(matchIntent(q)).toBeNull();
  });

  it.each(['hide', 'go away', 'Go away!', 'hide yourself', 'can you hide', 'go away pls', 'disappear', 'vanish', 'hide now', 'can you go away'])('%j hides him', (q) => {
    expect(kind(q)).toBe('hide');
  });
  it.each(['hide my files', 'where can i hide a key', 'go away for the weekend', 'how do i hide a column in excel', 'go'])('near-miss %j goes to the AI', (q) => {
    expect(matchIntent(q)).toBeNull();
  });

  it('switches style', () => {
    expect(matchIntent('change style')).toEqual({ kind: 'style', style: 'toggle' });
    expect(matchIntent('change your style')).toEqual({ kind: 'style', style: 'toggle' });
    expect(matchIntent('switch your look')).toEqual({ kind: 'style', style: 'toggle' });
    expect(matchIntent('flat style')).toEqual({ kind: 'style', style: 'flat' });
    expect(matchIntent('classic style')).toEqual({ kind: 'style', style: 'classic' });
    expect(matchIntent('switch to flat')).toEqual({ kind: 'style', style: 'flat' });
    expect(matchIntent('switch to the classic style')).toEqual({ kind: 'style', style: 'classic' });
    expect(matchIntent('change to flat style')).toEqual({ kind: 'style', style: 'flat' });
    expect(matchIntent('can you use the flat look')).toEqual({ kind: 'style', style: 'flat' });
    expect(matchIntent('go back to classic')).toEqual({ kind: 'style', style: 'classic' });
  });
  it.each(['change style of my essay', 'what is flat design', 'flat', 'classic', 'classic rock', 'change my password', 'a flat tyre', 'is classic style better'])('near-miss %j goes to the AI', (q) => {
    expect(matchIntent(q)).toBeNull();
  });
});

describe('matchIntent: general', () => {
  it('returns null for empty and unrelated text', () => {
    for (const q of ['', '   ', '?!', 'hi', 'hello paperclip', 'what is the capital of france', 'explain recursion', 'thanks', 'why is the sky blue']) {
      expect(matchIntent(q), q).toBeNull();
    }
  });
  it('is case, punctuation and spacing insensitive', () => {
    expect(kind('  WHO   BUILT   YOU ??? ')).toBe('aboutCreator');
    expect(kind("Let's  STRETCH!!!")).toBe('stretch');
  });
});
