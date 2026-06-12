// Demo mode — runs when no Supabase backend is configured. Simulates the
// conversation, coaching, and rating loop locally so the app can be
// click-tested end-to-end before the backend is connected.
import {
  CategoryScore,
  CoachingFeedback,
  ConversationRating,
  ConversationStatus,
  PersonaCharacteristics,
} from './types';

export interface DemoPersona {
  name: string;
  difficulty: number;
  ethnicity: string;
  personality_archetype: string;
  characteristics: PersonaCharacteristics;
}

interface DemoState {
  persona: DemoPersona | null;
  interest: number;
  turn: number;
  status: ConversationStatus;
}

export const demoState: DemoState = {
  persona: null,
  interest: 50,
  turn: 0,
  status: 'active',
};

export function startDemo(persona: DemoPersona) {
  demoState.persona = persona;
  demoState.interest = 50;
  demoState.turn = 0;
  demoState.status = 'active';
}

const LOW_EFFORT = ['hey', 'hi', 'hello', 'wyd', 'sup', 'yo', 'hey :)', 'hru'];

function scoreMessage(msg: string): number {
  const m = msg.toLowerCase().trim();
  let score = 5;
  if (LOW_EFFORT.includes(m) || m.length < 8) score -= 3;
  if (m.includes('?')) score += 1.5;
  if (m.length > 40) score += 1;
  if (m.length > 240) score -= 1.5; // essay to a stranger
  if (/(lol|haha|😂|😉|😏)/.test(m)) score += 0.5;
  if (/(sexy|hot|body|babe)/.test(m)) score -= 2.5;
  if (/(you're beautiful|ur beautiful|gorgeous)/.test(m)) score -= 1;
  if (/(travel|music|food|dog|hike|book|movie|coffee|weekend)/.test(m)) score += 1;
  return Math.max(1, Math.min(10, Math.round(score)));
}

const REPLIES_HIGH = [
  "okay that's actually a good question 😄 most people just say hey",
  "haha stop, you're trouble. fine — tell me something about you that's not on your profile",
  "omg yes!! finally someone who gets it. what else you got?",
  "lol okay you're kind of funny. kind of 😏",
];
const REPLIES_MID = [
  'haha yeah maybe',
  'lol what do you mean',
  "that's fair I guess. so what do you do?",
  'hmm okay 😅',
];
const REPLIES_LOW = ['haha', 'lol', 'yeah', 'nice', 'haha ok'];

export interface DemoChatResult {
  reply: string | null;
  interest_level: number;
  status: ConversationStatus;
  feedback: CoachingFeedback;
}

export function demoSend(userMsg: string): DemoChatResult {
  const p = demoState.persona;
  const difficulty = p?.difficulty ?? 5;
  const msgScore = scoreMessage(userMsg);
  demoState.turn += 1;

  // Interest moves with message quality, harsher at high difficulty
  const harshness = 0.7 + difficulty * 0.12;
  const delta = Math.round((msgScore - 5.5) * 4 * (msgScore < 5 ? harshness : 1));
  demoState.interest = Math.max(0, Math.min(100, demoState.interest + delta));

  const asksForNumber = /(number|digits|whatsapp|insta|instagram|snap)/i.test(userMsg);

  let reply: string | null;
  if (asksForNumber && demoState.interest >= 75) {
    demoState.status = 'number_given';
    reply = `okay fine, you earned it 😄 555-01${(20 + difficulty).toString()}. don't make it weird`;
  } else if (asksForNumber && demoState.interest < 40) {
    demoState.interest = Math.max(0, demoState.interest - 10);
    reply = "lol slow down, I don't even know your coffee order yet";
  } else if (demoState.interest <= 12 && difficulty >= 6) {
    demoState.status = 'ghosted';
    reply = null;
  } else if (demoState.interest <= 8) {
    demoState.status = 'ended';
    reply = "I don't really think we're vibing, but good luck out there 🙂";
  } else {
    const pool =
      demoState.interest >= 65
        ? REPLIES_HIGH
        : demoState.interest >= 35
        ? REPLIES_MID
        : REPLIES_LOW;
    reply = pool[(demoState.turn - 1) % pool.length];
  }

  const feedback: CoachingFeedback = {
    message_score: msgScore,
    what_worked:
      msgScore >= 6
        ? 'You showed effort and gave her something to respond to.'
        : msgScore >= 4
        ? 'You kept the conversation alive.'
        : '',
    what_hurt:
      msgScore <= 3
        ? 'Low-effort message — she gets 50 of these a day. It signals she isn’t worth 10 seconds of thought.'
        : msgScore <= 5
        ? 'Safe but forgettable. Nothing here makes her want to invest back.'
        : '',
    invisible_context_decode:
      reply === null
        ? 'Silence is data: her effort dropped to zero because yours did first. Ghosting at this stage means the conversation cost more than it gave.'
        : demoState.interest >= 65
        ? 'Longer reply + a question back = she’s investing. When a woman asks you something, she’s giving you a green light to escalate.'
        : demoState.interest >= 35
        ? 'Short-but-polite replies mean she’s undecided. She’s mirroring your effort level — raise the stakes with something specific or playful.'
        : 'One-word answers are a soft exit. She’s being polite, not interested. You need a pattern break, not another question.',
    what_she_really_means:
      reply === null
        ? '"This isn’t worth my time anymore."'
        : demoState.interest >= 65
        ? '"Keep going, I’m enjoying this."'
        : demoState.interest >= 35
        ? '"Convince me."'
        : '"I’m losing interest but I’m too polite to say it."',
    suggested_better_message:
      msgScore < 6
        ? 'Reference something specific about her — “okay important question: the dog in your third pic, is he the real owner of the account?”'
        : '',
    tip:
      msgScore >= 7
        ? 'Good message. Now watch her investment level — when she asks questions back, that’s your window to move toward the date.'
        : 'Specificity beats compliments. One detail from her profile is worth ten “heys”. (DEMO MODE — connect the backend for real AI coaching.)',
    interest_level: demoState.interest,
  };

  return {
    reply,
    interest_level: demoState.interest,
    status: demoState.status,
    feedback,
  };
}

export function demoRating(messageScores: number[]): ConversationRating {
  const avg =
    messageScores.length > 0
      ? messageScores.reduce((a, b) => a + b, 0) / messageScores.length
      : 5;
  const bonus =
    demoState.status === 'number_given' ? 18 : demoState.status === 'active' ? 5 : -8;
  const overall = Math.max(5, Math.min(98, Math.round(avg * 9 + bonus)));
  const cat = (base: number): number =>
    Math.max(1, Math.min(10, Math.round(base + (Math.random() * 2 - 1))));

  const categories: CategoryScore[] = [
    {
      category: 'Opening',
      score: cat(messageScores[0] ?? avg),
      advice:
        'Your opener sets her effort ceiling. Reference one specific detail from her profile and end with something easy to answer.',
    },
    {
      category: 'Engagement',
      score: cat(avg),
      advice:
        'Balance questions with statements about yourself — interviews are for jobs. Pick up the threads she offers you.',
    },
    {
      category: 'Wit & Humor',
      score: cat(avg - 0.5),
      advice:
        'Tease lightly and let silences breathe. Humor that fits HER personality type lands twice as hard.',
    },
    {
      category: 'Confidence',
      score: cat(avg),
      advice:
        'Avoid over-validating early. Confidence reads as having your own life — mention what your week looks like.',
    },
    {
      category: 'Emotional Intelligence',
      score: cat(avg + 0.5),
      advice:
        'Match her energy and message length. When her replies shorten, change the rhythm instead of pushing harder.',
    },
    {
      category: 'Escalation & Close',
      score: cat(demoState.status === 'number_given' ? 9 : avg - 1),
      advice:
        demoState.status === 'number_given'
          ? 'You closed at the right moment — when her investment peaked. Repeat that timing.'
          : 'Move toward the number when she starts asking YOU questions — that’s peak investment, and it fades if you wait.',
    },
  ];

  return {
    conversation_id: 'demo',
    overall_score: overall,
    categories,
    top_improvements: [
      'Open with a specific detail from her profile instead of a greeting.',
      'Mirror-then-raise: match her message length, then add one playful escalation.',
      'Ask for the number at peak investment — right after she asks about you.',
    ],
    psychology_insight:
      'Reciprocity of investment drives early attraction: people value conversations they put effort into. Your job isn’t to impress her — it’s to make investing in you feel easy and rewarding. (DEMO MODE — connect the backend for analysis of your real conversation.)',
    summary:
      demoState.status === 'number_given'
        ? 'Solid run — you built interest and closed at the right time.'
        : demoState.status === 'ghosted'
        ? 'She ghosted — the effort gap killed it. Fix the opener and the rest gets easier.'
        : 'A decent foundation with clear, fixable leaks. Drill the top improvements below.',
  };
}
