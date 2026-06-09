import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, accept',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders, ...extra },
  });
}

export function errorResponse(message: string, status = 400) {
  return json({ error: message }, status);
}

export function handleOptions(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}

/** Service-role client — bypasses RLS. Server-side only. */
export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
}

export interface AuthedUser {
  id: string;
  tier: 'free' | 'pro' | 'advanced';
  isAnonymous: boolean;
}

/** Resolve the calling user from the request JWT and load their tier. */
export async function getUser(req: Request): Promise<AuthedUser | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const admin = adminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('tier')
    .eq('id', data.user.id)
    .maybeSingle();

  return {
    id: data.user.id,
    tier: (profile?.tier as AuthedUser['tier']) ?? 'free',
    isAnonymous: !!data.user.is_anonymous,
  };
}

export const TIER_LIMITS: Record<AuthedUser['tier'], number | null> = {
  free: 15,
  pro: 500,
  advanced: null,
};

/**
 * Atomically checks and consumes one message credit.
 * Returns false when the user is out of credits for their tier.
 * Free-tier credits are lifetime (trial); paid tiers reset monthly.
 */
export async function consumeCredit(userId: string, tier: AuthedUser['tier']): Promise<boolean> {
  const limit = TIER_LIMITS[tier];
  const admin = adminClient();

  const { data: credits } = await admin
    .from('usage_credits')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  let used = credits?.messages_used ?? 0;
  const periodStart = credits?.period_start as string | undefined;

  // Monthly reset for paid tiers
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  const monthStartStr = monthStart.toISOString().slice(0, 10);
  if (tier !== 'free' && periodStart && periodStart < monthStartStr) {
    used = 0;
    await admin
      .from('usage_credits')
      .update({ messages_used: 0, period_start: monthStartStr })
      .eq('user_id', userId);
  }

  if (limit !== null && used >= limit) return false;

  await admin
    .from('usage_credits')
    .upsert({ user_id: userId, messages_used: used + 1 }, { onConflict: 'user_id' });
  return true;
}
