import type { AnimName } from '../anim/types';

/**
 * Local intents for "Ask Paperclip": a pure, conservative matcher that runs BEFORE a question goes to an AI provider.
 * Small anchored regex rules, no LLM. A rule only fires when the whole question clearly asks for that one thing, so
 * "what can you do about my taxes" is not "what can you do". Anything unclear returns null and goes to the AI as before.
 */

export const MIN_TIMER = 1;
export const MAX_TIMER = 180;
/** "pomodoro" and "start a focus timer" without a length. */
export const DEFAULT_TIMER = 25;

export type Intent =
  | { kind: 'aboutCreator' }
  | { kind: 'capabilities' }
  /** Plays `anim` (`repeat` times, so a blink can be seen) and says `reply`. */
  | { kind: 'animate'; anim: AnimName; reply: string; repeat: number }
  /** "sleep" / "nap": goes through the same path as the menu's nap command. */
  | { kind: 'nap' }
  | { kind: 'startTimer'; minutes: number }
  /** A length outside 1..180 minutes: he says what he can do instead of guessing. */
  | { kind: 'timerRange' }
  | { kind: 'stopTimer' }
  | { kind: 'timeLeft' }
  | { kind: 'water'; action: 'on' | 'off' }
  | { kind: 'drankWater' }
  | { kind: 'joke' }
  | { kind: 'quote' }
  | { kind: 'stretch' }
  | { kind: 'hide' }
  | { kind: 'style'; style: 'classic' | 'flat' | 'toggle' };

const WORD_MAP: Record<string, string> = { u: 'you', ur: 'your', pls: 'please', plz: 'please', r: 'are' };
const LEADING_FILLER = new Set(['hey', 'hi', 'hello', 'hiya', 'yo', 'ok', 'okay', 'so', 'oh', 'um', 'uh', 'well', 'paperclip', 'clippy']);
const TRAILING_FILLER = new Set(['paperclip', 'clippy', 'thanks']);

/**
 * Lower-case, drop apostrophes, turn other punctuation into spaces, collapse whitespace, treat "u" as "you" and "pls" as
 * "please", then drop "please", greetings, his name and a leading "can/could/would/will you" (or "i want you to").
 */
export function normalizeQuestion(text: string): string {
  const cleaned = text.toLowerCase().replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  let words = cleaned === '' ? [] : cleaned.split(' ').map((w) => WORD_MAP[w] ?? w).filter((w) => w !== 'please');
  while (words.length > 0 && LEADING_FILLER.has(words[0])) words = words.slice(1);
  while (words.length > 0 && TRAILING_FILLER.has(words[words.length - 1])) words = words.slice(0, -1);
  let out = words.join(' ');
  out = out.replace(/^(?:(?:can|could|would|will) you|i (?:want|need) you to|id like you to) /, '');
  return out;
}

// ---- Creator and capabilities ----

const CREATOR: RegExp[] = [
  /^(?:(?:tell me|do you know|i wonder|i want to know|id like to know) )?who (?:built|made|created|designed|developed|programmed|coded|invented|wrote) (?:you|this|this app|paperclip)$/,
  /^(?:(?:tell me|do you know) )?who (?:is|was) (?:your|the) (?:creator|maker|designer|developer|author|builder|inventor|programmer)$/,
  /^(?:(?:tell me|do you know) )?who are you(?: exactly| anyway)?$/,
  /^(?:(?:tell me|do you know) )?where (?:do|did) you come from$/,
  /^(?:(?:tell me|do you know) )?where are you from$/,
];

const CAPABILITIES: RegExp[] = [
  /^what (?:can|do) you do(?: for me)?$/,
  /^what (?:else )?can you do(?: for me)?$/,
  /^what are you (?:able to do|capable of)$/,
  /^what are your (?:features|abilities|skills|powers|capabilities|functions)$/,
  /^what (?:features|abilities|skills) do you have$/,
  /^(?:show me|tell me) what you can do$/,
  /^what can i ask you(?: about| for)?$/,
  /^how can you help(?: me)?$/,
  /^(?:list|show) (?:me )?your (?:features|abilities|skills|commands)$/,
  /^help(?: me)?$/,
];

// ---- Animations ----

interface AnimRule { verb: string; anim: AnimName; reply: string; repeat?: number }
const PRE = '(?:do |show me |give me |make |perform |try )?(?:an? |some |the )?(?:little |quick |small |big )?';
const SUF = '(?: for me| at me| again| hello| around| up and down| once)?';
const ANIM_RULES: AnimRule[] = [
  { verb: 'blink(?:ing)?', anim: 'Blink', reply: 'Yes I can! *blink*', repeat: 2 },
  { verb: 'wink(?:ing)?', anim: 'Blink', reply: 'Yes I can! *wink*', repeat: 2 },
  { verb: 'jump(?:ing)?|hop(?:ping)?', anim: 'Jump', reply: 'Yes I can!' },
  { verb: 'wav(?:e|ing)', anim: 'Wave', reply: 'Hi there!' },
  { verb: 'danc(?:e|ing)|boogie', anim: 'Dance', reply: 'Yes I can! Watch this!' },
  { verb: 'stretch(?:ing)?', anim: 'Stretch', reply: 'Yes I can! Ahh, that feels good.' },
  { verb: 'yawn(?:ing)?', anim: 'Yawn', reply: 'Yes I can! *yaaawn*' },
  { verb: 'spin(?:ning)?|twirl|(?:get |be |feel )?dizzy', anim: 'Dizzy', reply: 'Whee! Yes I can!' },
  { verb: 'celebrat(?:e|ion|ing)|cheer(?:ing)?', anim: 'Celebrate', reply: 'Hooray! Yes I can!' },
  { verb: 'think(?:ing)?', anim: 'Thinking', reply: 'Hmm... yes I can!' },
];
const ANIM_RES = ANIM_RULES.map((r) => ({ ...r, re: new RegExp(`^${PRE}(?:${r.verb})${SUF}$`) }));
const LOOK = /^look (?:to the |at the |to )?(left|right|up|down|upwards|downwards)$/;
const NAP = /^(?:(?:take|have|go for|do) (?:an? )?(?:quick |little |short )?(?:nap|sleep)|nap|sleep|go to sleep|go to bed|fall asleep)$/;

// ---- Timers ----

const DUR = '(?:\\d{1,6}(?: ?(?:min|mins|minute|minutes|m|h|hr|hrs|hour|hours))?|half an hour|an hour|a half hour)';
const START = '(?:start|set|put|run|begin|create|make|launch|do|kick off|fire up)(?: me)?(?: up| on)?(?: an?| the| my)?';
const THING = '(?:focus timer|timer|countdown|focus session|focus mode|focus|pomodoro timer|pomodoro session|pomodoro|session)';
const TIMER_RES: RegExp[] = [
  new RegExp(`^${START} (${DUR})(?: focus| pomodoro| countdown)? ${THING}$`), // start a 25 minute timer
  new RegExp(`^${START} ${THING}(?: for| of| on| to| at)? (${DUR})$`), // set a timer for 25 minutes
  new RegExp(`^(?:focus|timer|countdown|pomodoro)(?: for| of| on)? (${DUR})$`), // focus for 45 minutes, timer for 15
  new RegExp(`^(?:an? |the )?(\\d{1,6} ?(?:min|mins|minute|minutes|m|h|hr|hrs|hour|hours)) (?:of )?(?:focus timer|focus session|focus|timer|pomodoro|session|countdown)$`), // 25 minute focus
];
const DEFAULT_TIMER_RES: RegExp[] = [
  /^(?:start|begin|run|do|kick off|set)(?: me)?(?: an?| the| my)? (?:focus timer|focus session|focus mode|pomodoro timer|pomodoro session|pomodoro)$/,
  /^pomodoro(?: timer)?$/,
];
const STOP_TIMER = /^(?:stop|cancel|end|clear|abort|turn off|reset)(?: the| my| this)? (?:focus(?: timer| session)?|timer|session|countdown|pomodoro)$/;
const OF_TIMER = '(?: on (?:the|my) (?:timer|focus timer|focus session|countdown))?';
const TIME_LEFT: RegExp[] = [
  new RegExp(`^how (?:much )?time(?: is| do i have| have i got)? (?:left|remaining|to go)${OF_TIMER}$`),
  new RegExp(`^how (?:many )?minutes(?: are| do i have)?(?: there)? (?:left|remaining|to go)${OF_TIMER}$`),
  new RegExp(`^how long(?: is| are)? (?:left|remaining|to go)${OF_TIMER}$`),
  new RegExp(`^how much longer${OF_TIMER}$`),
  new RegExp(`^(?:what is |whats )?(?:the )?time (?:left|remaining)${OF_TIMER}$`),
];

/** "25 min", "25", "1 hour", "an hour", "half an hour" -> minutes (null when it is not a plain duration). */
function minutesOf(d: string): number | null {
  if (d === 'an hour') return 60;
  if (d === 'half an hour' || d === 'a half hour') return 30;
  const m = /^(\d+) ?([a-z]*)$/.exec(d);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2].startsWith('h') ? n * 60 : n;
}

function timerIntent(t: string): Intent | null {
  for (const re of TIMER_RES) {
    const m = re.exec(t);
    if (!m) continue;
    const minutes = minutesOf(m[1]);
    if (minutes === null) continue;
    return minutes >= MIN_TIMER && minutes <= MAX_TIMER ? { kind: 'startTimer', minutes } : { kind: 'timerRange' };
  }
  if (DEFAULT_TIMER_RES.some((re) => re.test(t))) return { kind: 'startTimer', minutes: DEFAULT_TIMER };
  return null;
}

// ---- Water, jokes, quotes ----

const WATER_ON: RegExp[] = [
  /^remind me to (?:drink|have|sip)(?: some| more| a glass of| a bit of| enough)? ?water(?: regularly| often| sometimes)?$/,
  /^remind me to (?:stay hydrated|hydrate|drink)$/,
  /^remind me about (?:drinking )?water$/,
  /^(?:turn on|enable|start|switch on|set up|activate)(?: the| my)? water reminders?$/,
  /^water reminders? on$/,
  /^i (?:want|need) water reminders?$/,
];
const WATER_OFF: RegExp[] = [
  /^(?:turn off|disable|stop|switch off|cancel)(?: the| my)? water reminders?$/,
  /^(?:stop reminding me to drink water|dont remind me to drink water)$/,
];
const DRANK: RegExp[] = [
  /^(?:i )?(?:just )?(?:drank|had|finished|downed|chugged) (?:some |a |my |another |one |the )?(?:glass of water|glass|cup of water|bottle of water|water)$/,
  /^(?:log|add|count|record) (?:a |my |one |another )?(?:glass of water|glass|water)$/,
];
const JOKE: RegExp[] = [
  /^(?:tell|give|say|crack|hit)(?: me| us)?(?: with)?(?: an?| another| one| some| one more| the| any)?(?: more)?(?: funny| good| dad| bad| new| silly)* ?jokes?$/,
  /^(?:another|one more|next|more|an?|any|new) jokes?$/,
  /^joke(?: time)?$/,
  /^(?:got|have you got|do you have|do you know|know) (?:an?|any|another) jokes?$/,
  /^make me laugh$/,
];
const QUOTE: RegExp[] = [
  /^(?:give|tell|show|share|say)(?: me| us)?(?: an?| another| one| some| one more| the| any)?(?: more)?(?: new| good| nice| famous| motivational| inspirational| inspiring| random)* ?quotes?$/,
  /^(?:another|one more|next|more|an?|any|new) quotes?$/,
  /^quote(?: of the day)?$/,
  /^inspire me$/,
  /^motivate me$/,
  /^i need (?:some )?(?:inspiration|motivation)$/,
];

// ---- Guided stretch, hide, style ----

const STRETCH_SESSION: RegExp[] = [
  /^(?:stretch with me|stretch together|do a stretch with me|lets stretch|let us stretch|time to stretch|its time to stretch|can we stretch|shall we stretch|should we stretch|i want to stretch|i wanna stretch|id like to stretch|i need to stretch|i need a stretch|lets do a stretch|lets do some stretching|lets take a stretch break|stretch break|start stretching|start a stretch|start a stretch break|start the stretch|start a guided stretch|guide me through a stretch|take me through a stretch)(?: now| together| with me)?$/,
];
const HIDE = /^(?:hide(?: yourself| now)?|go away(?: now)?|disappear|vanish)$/;
const STYLE_VERB = '(?:change|switch|swap|set|go|use|be|make yourself)(?: back)?';
const STYLE_TOGGLE = /^(?:change|switch|swap|toggle)(?: your| the| my)? (?:style|look|appearance)$/;
const STYLE_SET: RegExp[] = [
  new RegExp(`^${STYLE_VERB}(?: your| the| my)?(?: style| look)? to(?: the)? (flat|classic)(?: style| look| version| mode)?$`),
  /^(?:use|be|go)(?: the)? (flat|classic)(?: style| look| version| mode)?$/,
  /^(flat|classic) (?:style|look|version|mode)$/,
];

const first = (res: RegExp[], t: string): RegExpExecArray | null => {
  for (const re of res) {
    const m = re.exec(t);
    if (m) return m;
  }
  return null;
};
const any = (res: RegExp[], t: string): boolean => first(res, t) !== null;

/** The local intent a question clearly asks for, or null (then it goes to the AI provider as usual). */
export function matchIntent(text: string): Intent | null {
  const t = normalizeQuestion(text);
  if (t === '') return null;

  if (any(CREATOR, t)) return { kind: 'aboutCreator' };
  if (any(CAPABILITIES, t)) return { kind: 'capabilities' };

  if (STOP_TIMER.test(t)) return { kind: 'stopTimer' };
  if (any(TIME_LEFT, t)) return { kind: 'timeLeft' };
  const timer = timerIntent(t);
  if (timer) return timer;

  if (any(WATER_ON, t)) return { kind: 'water', action: 'on' };
  if (any(WATER_OFF, t)) return { kind: 'water', action: 'off' };
  if (any(DRANK, t)) return { kind: 'drankWater' };

  if (any(JOKE, t)) return { kind: 'joke' };
  if (any(QUOTE, t)) return { kind: 'quote' };

  if (any(STRETCH_SESSION, t)) return { kind: 'stretch' };
  if (HIDE.test(t)) return { kind: 'hide' };
  if (STYLE_TOGGLE.test(t)) return { kind: 'style', style: 'toggle' };
  const style = first(STYLE_SET, t);
  if (style) return { kind: 'style', style: style[1] as 'flat' | 'classic' };

  if (NAP.test(t)) return { kind: 'nap' };
  const look = LOOK.exec(t);
  if (look) {
    const dir = look[1].replace('wards', '');
    const name = dir === 'left' ? 'LookLeft' : dir === 'right' ? 'LookRight' : dir === 'up' ? 'LookUp' : 'LookDown';
    return { kind: 'animate', anim: name, reply: `Yes I can! Looking ${dir}.`, repeat: 1 };
  }
  for (const r of ANIM_RES) {
    if (r.re.test(t)) return { kind: 'animate', anim: r.anim, reply: r.reply, repeat: r.repeat ?? 1 };
  }
  return null;
}
