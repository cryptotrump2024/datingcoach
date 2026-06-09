// analyze-profile-image — Claude vision reads a dating-profile screenshot and
// returns the decode: what it communicates, hooks, and tailored openers.
import {
  adminClient,
  errorResponse,
  getUser,
  handleOptions,
  json,
} from '../_shared/utils.ts';
import { COACH_MODEL, structuredCall } from '../_shared/anthropic.ts';

const ANALYZE_SYSTEM = `You are an elite dating coach analyzing a screenshot of a dating-app profile (photos, bio, prompts). Decode it for a man deciding how to open.

- what_it_communicates: what the profile signals about her — lifestyle, values, self-presentation choices, what she's screening for. Read between the lines of photo choices and bio wording.
- personality_read: your best inference of her personality and humor style, and what kind of messages she likely responds to.
- conversation_hooks: 3-5 specific details from the profile worth referencing (the more specific, the better).
- suggested_openers: 3 openers tailored to THIS profile, in a natural casual voice — playful, specific, zero clichés, no pickup lines. Each should invite an easy reply.
- red_flags_or_cautions: anything worth knowing before investing (vague profile, group-photo ambiguity, signs of low effort) — or an empty string if nothing notable.
- If the image is not a dating profile, say so in what_it_communicates and leave the arrays empty.
- Be respectful — this is about reading social signals, never about judging her worth.`;

const SCHEMA = {
  type: 'object',
  properties: {
    what_it_communicates: { type: 'string' },
    personality_read: { type: 'string' },
    conversation_hooks: { type: 'array', items: { type: 'string' } },
    suggested_openers: { type: 'array', items: { type: 'string' } },
    red_flags_or_cautions: { type: 'string' },
  },
  required: [
    'what_it_communicates',
    'personality_read',
    'conversation_hooks',
    'suggested_openers',
    'red_flags_or_cautions',
  ],
  additionalProperties: false,
} as const;

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  const user = await getUser(req);
  if (!user) return errorResponse('Unauthorized', 401);
  if (user.tier !== 'advanced') {
    return errorResponse('Profile analysis is an Advanced feature', 403);
  }

  const { image_base64, media_type } = await req.json().catch(() => ({}));
  if (!image_base64 || typeof image_base64 !== 'string') {
    return errorResponse('image_base64 is required');
  }
  const mediaType = ALLOWED_TYPES.includes(media_type) ? media_type : 'image/jpeg';
  if (image_base64.length > 8_000_000) {
    return errorResponse('Image too large — please use a smaller screenshot');
  }

  const analysis = await structuredCall<Record<string, unknown>>({
    model: COACH_MODEL,
    system: ANALYZE_SYSTEM,
    schema: SCHEMA as unknown as Record<string, unknown>,
    userContent: [
      {
        type: 'image',
        source: { type: 'base64', media_type: mediaType, data: image_base64 },
      },
      { type: 'text', text: 'Analyze this dating profile screenshot.' },
    ],
  });

  const admin = adminClient();
  await admin.from('profile_analyses').insert({ user_id: user.id, analysis });

  return json(analysis);
});
