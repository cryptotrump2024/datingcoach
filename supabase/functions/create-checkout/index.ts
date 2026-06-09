// create-checkout — creates a Stripe Checkout session (subscriptions), a
// Stripe billing-portal session, or a NOWPayments invoice (crypto prepaid pass).
import Stripe from 'npm:stripe@latest';
import {
  adminClient,
  errorResponse,
  getUser,
  handleOptions,
  json,
} from '../_shared/utils.ts';

const PRICES_USD: Record<'pro' | 'advanced', number> = {
  pro: 9.95,
  advanced: 19.95,
};
const CRYPTO_DISCOUNT: Record<number, number> = { 1: 0, 3: 0.1, 12: 0.2 };

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  const user = await getUser(req);
  if (!user) return errorResponse('Unauthorized', 401);
  if (user.isAnonymous) {
    return errorResponse('Create an account before purchasing', 403);
  }

  const body = await req.json().catch(() => ({}));
  const provider = body.provider as 'stripe' | 'crypto' | 'portal';
  const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:8081';
  const admin = adminClient();

  // ---- Stripe billing portal -------------------------------------------------
  if (provider === 'portal') {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);
    const { data: profile } = await admin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();
    if (!profile?.stripe_customer_id) {
      return errorResponse('No billing account found', 404);
    }
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${appUrl}/account`,
    });
    return json({ url: session.url });
  }

  const tier = body.tier as 'pro' | 'advanced';
  if (!['pro', 'advanced'].includes(tier)) return errorResponse('Invalid tier');

  // ---- Stripe subscription checkout -------------------------------------------
  if (provider === 'stripe') {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);
    const priceId =
      tier === 'pro'
        ? Deno.env.get('STRIPE_PRICE_PRO')
        : Deno.env.get('STRIPE_PRICE_ADVANCED');
    if (!priceId) return errorResponse('Stripe prices not configured', 503);

    const { data: profile } = await admin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/?upgraded=1`,
      cancel_url: `${appUrl}/pricing`,
      customer: profile?.stripe_customer_id ?? undefined,
      client_reference_id: user.id,
      subscription_data: { metadata: { user_id: user.id, tier } },
      metadata: { user_id: user.id, tier },
    });
    return json({ url: session.url });
  }

  // ---- NOWPayments crypto prepaid pass ----------------------------------------
  if (provider === 'crypto') {
    const apiKey = Deno.env.get('NOWPAYMENTS_API_KEY');
    if (!apiKey) return errorResponse('Crypto payments not configured', 503);

    const months = [1, 3, 12].includes(body.months) ? (body.months as number) : 1;
    const discount = CRYPTO_DISCOUNT[months] ?? 0;
    const amount = +(PRICES_USD[tier] * months * (1 - discount)).toFixed(2);
    const orderId = `${user.id}:${tier}:${months}:${Date.now()}`;

    const res = await fetch('https://api.nowpayments.io/v1/invoice', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        price_amount: amount,
        price_currency: 'usd',
        pay_currency: body.pay_currency || undefined, // usdttrc20 | usdc | btc
        order_id: orderId,
        order_description: `CharmCoach ${tier} — ${months} month${months > 1 ? 's' : ''}`,
        ipn_callback_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/nowpayments-webhook`,
        success_url: `${appUrl}/?upgraded=1`,
        cancel_url: `${appUrl}/pricing`,
      }),
    });
    if (!res.ok) {
      return errorResponse(`Crypto invoice failed: ${await res.text()}`, 502);
    }
    const invoice = await res.json();
    return json({ url: invoice.invoice_url });
  }

  return errorResponse('Unknown provider');
});
