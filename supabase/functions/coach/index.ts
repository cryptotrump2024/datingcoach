// coach — per-message coaching: scores the user's message, decodes the
// "invisible context" of her reply, and suggests a stronger version.
import {
  adminClient,
  errorResponse,
  getUser,
  handleOptions,
  json,
} from '../_shared/utils.ts';
import { COACH_MODEL, structuredCall } from '../_shared/anthropic.ts';

const COACH_SYSTEM = `You are an elite dating-conversation coach with deep grounding in social psychology — attraction research, attachment theory, signaling, reciprocity, and conversational dynamics. You analyze one exchange from a dating-app conversation: the man's message and the woman's reaction (or silence).

Your coaching philosophy:
- Honest, specific, and actionable — never generic platitudes.
- You decode the INVISIBLE CONTEXT: what her message actually communicates beneath the literal words (effort level, interest signals, tests, boredom, openings she's giving him).
- You teach genuine social skill: curiosity, humor, confident escalation, emotional attunement. You never teach manipulation, dishonesty, or disrespect.
- Score the man's message 1-10 for how well it serves building real attraction in this context.
- "what_she_really_means" translates her reply (or her silence) into plain language. If she hasn't replied yet, decode what his message will likely signal to her.
- "suggested_better_message" rewrites HIS message into a noticeably stronger version in his own casual voice — not cringe, not a script, just better.
- Keep every field tight: 1-3 sentences. This appears as a card in a chat UI.

The user's tier is provided. For "basic" tier give shorter, surface-level fields (1 sentence each, suggested_better_message may be empty). For "full" tier give the complete decode.`;

const SCHEMA = {
  type: 'object',
  properties: {
    message_score: { type: 'integer' },
    what_worked: { type: 'string' },
    what_hurt: { type: 'string' },
    invisible_context_decode: { type: 'string' },
    what_she_really_means: { type: 'string' },
    suggested_better_message: { type: 'string' },
    tip: { type: 'string' },
    interest_level: { type: 'integer' },
  },
  required: [
    'message_score',
    'what_worked',
    'what_hurt',
    'invisible_context_decode',
    'what_she_really_means',
    'suggested_better_message',
    'tip',
    'interest_level',
  ],
  additionalProperties: false,
} as const;

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  const user = await getUser(req);
  if (!user) return errorResponse('Unauthorized', 401);

  const { conversation_id, user_message_id } = await req.json().catch(() => ({}));
  if (!conversation_id || !user_message_id) {
    return errorResponse('conversation_id and user_message_id are required');
  }

  const admin = adminClient();
  const { data: convo } = await admin
    .from('conversations')
    .select('*, personas(name, difficulty, personality_archetype)')
    .eq('id', conversation_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!convo) return errorResponse('Conversation not found', 404);

  const { data: msgs } = await admin
    .from('messages')
    .select('id, role, content, created_at')
    .eq('conversation_id', conversation_id)
    .order('created_at', { ascending: true })
    .limit(40);
  if (!msgs?.length) return errorResponse('No messages', 404);

  const targetIdx = msgs.findIndex((m) => m.id === user_message_id);
  if (targetIdx < 0 || msgs[targetIdx].role !== 'user') {
    return errorResponse('Message not found', 404);
  }

  const transcript = msgs
    .slice(0, targetIdx + 2) // context up to and including her reaction
    .map((m) => `${m.role === 'user' ? 'HIM' : 'HER'}: ${m.content}`)
    .join('\n');
  const herReaction =
    msgs[targetIdx + 1]?.role === 'assistant'
      ? msgs[targetIdx + 1].content
      : convo.status === 'ghosted'
      ? '(she left him on read — no reply)'
      : '(no reply yet)';

  const depth = user.tier === 'free' ? 'basic' : 'full';
  const persona = convo.personas as {
    name: string;
    difficulty: number;
    personality_archetype: string;
  };

  const feedback = await structuredCall<Record<string, unknown>>({
    model: COACH_MODEL,
    system: COACH_SYSTEM,
    schema: SCHEMA as unknown as Record<string, unknown>,
    userContent: `Coaching tier: ${depth}
Her persona: ${persona.name}, difficulty ${persona.difficulty}/10, type "${persona.personality_archetype}". Current interest level: ${convo.interest_level}/100. Conversation status: ${convo.status}.

Conversation so far:
${transcript}

ANALYZE THIS EXCHANGE:
His message: "${msgs[targetIdx].content}"
Her reaction: "${herReaction}"`,
  });

  await admin
    .from('message_feedback')
    .upsert({ message_id: user_message_id, feedback });

  return json(feedback);
});
