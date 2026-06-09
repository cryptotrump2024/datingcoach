// generate-persona-image — builds a portrait prompt from the persona spec,
// generates it with FLUX via fal.ai, stores it in Supabase Storage.
import {
  adminClient,
  errorResponse,
  getUser,
  handleOptions,
  json,
} from '../_shared/utils.ts';
import { PersonaRow } from '../_shared/anthropic.ts';

const FAL_MODEL = Deno.env.get('FAL_MODEL') ?? 'fal-ai/flux/schnell';

const ARCHETYPE_VIBES: Record<string, string> = {
  sweetheart: 'soft warm smile, approachable, cozy knit sweater',
  sassy: 'playful smirk, confident expression, trendy outfit',
  intellectual: 'thoughtful expression, stylish glasses, bookstore or cafe setting',
  adventurous: 'bright genuine laugh, outdoor golden-hour setting, athletic casual wear',
  reserved: 'gentle shy smile, soft natural light, minimalist style',
  party: 'big joyful smile, vibrant night-out outfit, festive bokeh background',
  ambitious: 'poised confident look, smart business-casual, city backdrop',
  artsy: 'creative effortless style, paint-splashed studio or gallery, warm film tones',
};

function buildImagePrompt(p: PersonaRow): string {
  const c = p.characteristics ?? {};
  const vibe = ARCHETYPE_VIBES[p.personality_archetype] ?? 'natural genuine smile';
  return `Authentic candid dating app profile photo of a beautiful ${c.age ?? 25} year old ${p.ethnicity} woman, ${vibe}, interests include ${(c.interests ?? []).slice(0, 3).join(' and ') || 'travel'}, shot on a smartphone, natural lighting, realistic skin texture, shallow depth of field, no text, no watermark, single person, fully clothed, tasteful`;
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  const user = await getUser(req);
  if (!user) return errorResponse('Unauthorized', 401);
  if (user.tier === 'free') {
    return errorResponse('Persona photos are a Pro feature', 403);
  }

  const { persona_id } = await req.json().catch(() => ({}));
  if (!persona_id) return errorResponse('persona_id is required');

  const admin = adminClient();
  const { data: persona } = await admin
    .from('personas')
    .select('*')
    .eq('id', persona_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!persona) return errorResponse('Persona not found', 404);
  if (persona.image_url) return json(persona); // already generated

  const falKey = Deno.env.get('FAL_KEY');
  if (!falKey) return errorResponse('Image generation not configured', 503);

  // fal.ai synchronous endpoint
  const falRes = await fetch(`https://fal.run/${FAL_MODEL}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${falKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: buildImagePrompt(persona as PersonaRow),
      image_size: 'portrait_4_3',
      num_images: 1,
      enable_safety_checker: true,
    }),
  });
  if (!falRes.ok) {
    return errorResponse(`Image generation failed: ${await falRes.text()}`, 502);
  }
  const falData = await falRes.json();
  const imageUrl: string | undefined = falData?.images?.[0]?.url;
  if (!imageUrl) return errorResponse('No image returned', 502);

  // Copy into our own storage so the URL is permanent
  const imgRes = await fetch(imageUrl);
  const bytes = new Uint8Array(await imgRes.arrayBuffer());
  const path = `${user.id}/${persona_id}.jpg`;
  const { error: uploadErr } = await admin.storage
    .from('personas')
    .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
  if (uploadErr) return errorResponse(uploadErr.message, 500);

  const { data: pub } = admin.storage.from('personas').getPublicUrl(path);
  const { data: updated } = await admin
    .from('personas')
    .update({ image_url: pub.publicUrl })
    .eq('id', persona_id)
    .select()
    .single();

  return json(updated);
});
