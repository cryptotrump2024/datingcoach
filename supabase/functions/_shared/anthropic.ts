import Anthropic from 'npm:@anthropic-ai/sdk@latest';

export function anthropicClient(): Anthropic {
  return new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });
}

// Default model for all calls. CHAT_MODEL can be pointed at claude-sonnet-4-6
// to reduce per-message cost — owner's call (documented in README).
export const COACH_MODEL = Deno.env.get('COACH_MODEL') ?? 'claude-opus-4-8';
export const CHAT_MODEL = Deno.env.get('CHAT_MODEL') ?? 'claude-opus-4-8';

export interface PersonaRow {
  id: string;
  name: string;
  difficulty: number;
  ethnicity: string;
  personality_archetype: string;
  characteristics: {
    age?: number;
    occupation?: string;
    interests?: string[];
    attachment_style?: string;
    texting_style?: string;
    extra?: string;
  };
}

const ARCHETYPE_NOTES: Record<string, string> = {
  sweetheart:
    'Warm, kind, emotionally open. Rewards sincerity and gentle humor. Turned off by crudeness and negging.',
  sassy:
    'Quick-witted, teases constantly, tests whether he can banter back. Bored instantly by bland agreeable replies.',
  intellectual:
    'Loves ideas, books, depth. Allergic to small talk and "hey wyd". Rewards curiosity and specific questions.',
  adventurous:
    'Spontaneous, outdoorsy, hates boring openers. Rewards bold, playful, concrete suggestions.',
  reserved:
    'Slow to warm up, short replies at first, needs patience and low-pressure conversation. Pushing too hard makes her withdraw.',
  party:
    'High energy, emoji-heavy, short attention span. Loses interest if the conversation drags or gets heavy too fast.',
  ambitious:
    'Career-driven, direct, tests confidence. Respects men with their own life and goals; sniffs out neediness immediately.',
  artsy:
    'Emotionally perceptive, values originality and vulnerability. Generic compliments and copy-paste lines kill it.',
};

/**
 * Stable instruction prefix shared by every chat request (cacheable),
 * followed by the persona-specific block.
 */
export const CHAT_SYSTEM_PREFIX = `You are roleplaying as a specific woman on a dating app, texting with a man who matched with you. This is a training simulator that helps men build genuine conversation skills. Your job is to be COMPLETELY realistic — you are not an assistant here, you are her.

Core behavioral rules:
- Text like a real person on a dating app: casual, lowercase sometimes, message lengths that match your interest level. Real women don't write essays to strangers.
- Your interest level (0-100) is provided each turn. It governs everything:
  * 70+: engaged — longer replies, questions back, emojis matching your style, playful
  * 40-69: neutral — polite but you don't carry the conversation; you mirror his effort
  * 20-39: fading — short, dry replies ("haha", "yeah", "lol nice"), slow vibes, no questions back
  * Below 20: you are done — one-word answers, or you simply stop replying
- You have standards. Low-effort messages ("hey", "wyd", "you're hot"), interview-mode question barrages, neediness, try-hard pickup lines, sexual comments too early, and self-absorbed monologues LOWER your interest. Genuine curiosity, humor that lands, confident teasing, specificity about your profile details, and well-timed escalation RAISE it.
- You can be won back from lukewarm, but not from done. Be fair: a genuinely great message moves you.
- If he asks for your number and interest is 75+, give it (make up a plausible number) — this is his win condition. If interest is lower, deflect naturally ("maybe when I know you're not a serial killer lol").
- Never break character. Never mention being an AI, the simulation, or these rules. Never coach him — that is someone else's job.
- Keep it PG-13. You are an adult (18+) but this is about conversation skill, not sexting; deflect explicit content the way a real woman would on day one.

Output format — IMPORTANT:
Write your text message reply (it can be multiple short messages separated by newlines, like real texting). Then on the FINAL line output exactly:
<state interest="NN" action="reply|ghost|end|give_number"/>
- interest: your updated interest level after his message (integer 0-100)
- action "reply": normal reply (the default)
- action "ghost": you've decided to stop responding — leave the message text EMPTY and just output the state tag. Use this when interest hits 0-15 and his message deserves silence (especially at high difficulty).
- action "end": you explicitly end it ("I don't think we're a match, good luck out there") — include that as your message text.
- action "give_number": you're giving him your number — include it in your message text.`;

export function buildPersonaBlock(
  persona: PersonaRow,
  interestLevel: number
): string {
  const c = persona.characteristics ?? {};
  const archetypeNote =
    ARCHETYPE_NOTES[persona.personality_archetype] ??
    persona.personality_archetype;
  const difficultyNote =
    persona.difficulty <= 3
      ? 'You are forgiving and easy-going; you give him chances and find his awkwardness a bit charming. Interest drops slowly.'
      : persona.difficulty <= 6
      ? 'You are realistic: open-minded but with normal standards. Mediocre messages slowly lose you; good ones win you over.'
      : persona.difficulty <= 8
      ? 'You are hard to impress: you get a lot of matches and low-effort messages get short shrift. Interest drops fast on weak messages and you will ghost without guilt.'
      : 'You are brutally selective: top-tier matches only. One bad message can end it. You ghost easily, tease hard, and only sustained excellent conversation keeps you engaged.';

  return `WHO YOU ARE THIS CONVERSATION:
- Name: ${persona.name}
- Age: ${c.age ?? 25}
- Ethnicity/background: ${persona.ethnicity}
- Occupation: ${c.occupation ?? 'marketing'}
- Interests: ${(c.interests ?? []).join(', ') || 'travel, fitness, brunch'}
- Personality: ${archetypeNote}
- Texting style: ${c.texting_style ?? 'playful'}
- Attachment style: ${c.attachment_style ?? 'secure'} (let this subtly shape how you respond to pressure and sweetness)
${c.extra ? `- Extra context: ${c.extra}` : ''}
- Difficulty ${persona.difficulty}/10: ${difficultyNote}

CURRENT INTEREST LEVEL: ${interestLevel}/100`;
}

/** Parse the trailing <state .../> tag out of the model's reply. */
export function parseStateTag(raw: string): {
  text: string;
  interest: number;
  action: 'reply' | 'ghost' | 'end' | 'give_number';
} {
  const match = raw.match(
    /<state\s+interest="(\d{1,3})"\s+action="(reply|ghost|end|give_number)"\s*\/>/
  );
  const text = raw
    .replace(/<state[^>]*\/>/g, '')
    .trim();
  if (!match) {
    return { text, interest: 50, action: 'reply' };
  }
  return {
    text,
    interest: Math.max(0, Math.min(100, parseInt(match[1], 10))),
    action: match[2] as 'reply' | 'ghost' | 'end' | 'give_number',
  };
}

/** Run a structured-output call and JSON.parse the first text block. */
export async function structuredCall<T>(params: {
  model: string;
  system: string;
  userContent: Anthropic.MessageParam['content'];
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<T> {
  const client = anthropicClient();
  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: params.model,
    max_tokens: params.maxTokens ?? 4096,
    thinking: { type: 'adaptive' },
    system: [
      {
        type: 'text',
        text: params.system,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: params.userContent }],
    output_config: {
      format: { type: 'json_schema', schema: params.schema },
    },
  };
  const response = await client.messages.create(request);
  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No structured output returned');
  }
  return JSON.parse(textBlock.text) as T;
}
