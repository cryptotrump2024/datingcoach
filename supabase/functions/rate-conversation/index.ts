// rate-conversation — full-transcript report card: overall score, category
// scores with advice, prioritized improvements, and a psychology insight.
import {
  adminClient,
  errorResponse,
  getUser,
  handleOptions,
  json,
} from '../_shared/utils.ts';
import { COACH_MODEL, structuredCall } from '../_shared/anthropic.ts';

const RATE_SYSTEM = `You are an elite dating-conversation coach grounded in social psychology. You grade a complete dating-app conversation between a man (HIM) and a woman (HER), then produce a report card that makes him measurably better.

Grading principles:
- overall_score is 1-100. Calibrate honestly: an average conversation that goes nowhere is 40-55. Getting genuine engagement is 60-75. Getting the number with real rapport is 80+.
- Grade these exact categories (one entry each, in this order):
  1. "Opening" — did his opener earn a reply? Specific to her, or copy-paste?
  2. "Engagement" — did he build a two-way conversation, use her threads, balance questions and statements?
  3. "Wit & Humor" — did his humor land for HER personality type?
  4. "Confidence" — neediness vs. self-assurance; did he qualify himself or chase?
  5. "Emotional Intelligence" — did he read her signals, match her energy, notice tests and openings?
  6. "Escalation & Close" — did he move toward the number/date at the right moment, too early, too late, or never?
- Each category: integer score 1-10 plus 1-2 sentences of specific advice referencing actual messages.
- top_improvements: the 3 highest-leverage changes, ordered by impact, phrased as instructions he can apply next conversation.
- psychology_insight: 2-4 sentences explaining the science behind the main dynamic of this conversation (e.g. reciprocity of self-disclosure, scarcity vs availability signals, attachment responses) in plain language.
- summary: 1-2 sentence verdict, direct but motivating.
- Coach genuine skill — never manipulation or disrespect.`;

const SCHEMA = {
  type: 'object',
  properties: {
    overall_score: { type: 'integer' },
    categories: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          score: { type: 'integer' },
          advice: { type: 'string' },
        },
        required: ['category', 'score', 'advice'],
        additionalProperties: false,
      },
    },
    top_improvements: { type: 'array', items: { type: 'string' } },
    psychology_insight: { type: 'string' },
    summary: { type: 'string' },
  },
  required: [
    'overall_score',
    'categories',
    'top_improvements',
    'psychology_insight',
    'summary',
  ],
  additionalProperties: false,
} as const;

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  const user = await getUser(req);
  if (!user) return errorResponse('Unauthorized', 401);

  const { conversation_id } = await req.json().catch(() => ({}));
  if (!conversation_id) return errorResponse('conversation_id is required');

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
    .select('role, content')
    .eq('conversation_id', conversation_id)
    .order('created_at', { ascending: true })
    .limit(200);
  if (!msgs || msgs.length < 2) {
    return errorResponse('Not enough conversation to rate yet');
  }

  const persona = convo.personas as {
    name: string;
    difficulty: number;
    personality_archetype: string;
  };
  const transcript = msgs
    .map((m) => `${m.role === 'user' ? 'HIM' : 'HER'}: ${m.content}`)
    .join('\n');

  const outcome =
    convo.status === 'number_given'
      ? 'He got her number.'
      : convo.status === 'ghosted'
      ? 'She ghosted him.'
      : convo.status === 'ended'
      ? 'She explicitly ended the conversation.'
      : 'Conversation still in progress.';

  const rating = await structuredCall<{
    overall_score: number;
    categories: unknown;
    top_improvements: unknown;
    psychology_insight: string;
    summary: string;
  }>({
    model: COACH_MODEL,
    system: RATE_SYSTEM,
    schema: SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 8192,
    userContent: `Her persona: ${persona.name}, difficulty ${persona.difficulty}/10, type "${persona.personality_archetype}". Final interest level: ${convo.interest_level}/100. Outcome: ${outcome}

Full conversation:
${transcript}`,
  });

  await admin.from('conversation_ratings').insert({
    conversation_id,
    overall_score: rating.overall_score,
    categories: rating.categories,
    top_improvements: rating.top_improvements,
    psychology_insight: rating.psychology_insight,
    summary: rating.summary,
  });

  return json({ conversation_id, ...rating });
});
