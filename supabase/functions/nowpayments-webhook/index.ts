// nowpayments-webhook — IPN handler for crypto prepaid passes.
// Verifies the HMAC-SHA512 signature, then credits the purchased period.
// Deploy with --no-verify-jwt.
import { adminClient, errorResponse, json } from '../_shared/utils.ts';

/** NOWPayments signs the JSON payload with keys sorted recursively. */
function sortedStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(sortedStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${JSON.stringify(k)}:${sortedStringify(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

async function hmacSha512(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  const ipnSecret = Deno.env.get('NOWPAYMENTS_IPN_SECRET');
  const signature = req.headers.get('x-nowpayments-sig');
  if (!ipnSecret || !signature) return errorResponse('Missing signature', 401);

  const payload = await req.json().catch(() => null);
  if (!payload) return errorResponse('Invalid payload');

  const expected = await hmacSha512(ipnSecret, sortedStringify(payload));
  if (expected !== signature) return errorResponse('Bad signature', 401);

  const admin = adminClient();
  const status: string = payload.payment_status;
  const orderId: string = payload.order_id ?? '';
  // order_id format: "<user_id>:<tier>:<months>:<ts>" (set in create-checkout)
  const [userId, tier, monthsStr] = orderId.split(':');
  const months = parseInt(monthsStr, 10) || 1;

  await admin.from('payments').insert({
    user_id: userId || null,
    provider: 'nowpayments',
    provider_payment_id: String(payload.payment_id ?? ''),
    amount: payload.price_amount,
    currency: payload.pay_currency,
    status,
    raw: payload,
  });

  // 'finished' = fully confirmed on-chain; 'partially_paid' etc. are ignored
  if (status === 'finished' && userId && (tier === 'pro' || tier === 'advanced')) {
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + months);

    await admin.from('subscriptions').insert({
      user_id: userId,
      provider: 'nowpayments',
      provider_subscription_id: String(payload.payment_id ?? ''),
      tier,
      status: 'active',
      current_period_end: periodEnd.toISOString(),
    });
    await admin.from('profiles').update({ tier }).eq('id', userId);
  }

  return json({ received: true });
});
