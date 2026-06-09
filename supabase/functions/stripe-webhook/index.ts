// stripe-webhook — keeps profiles.tier and subscriptions in sync with Stripe.
// Deploy with --no-verify-jwt (Stripe authenticates via signature header).
import Stripe from 'npm:stripe@latest';
import { adminClient, errorResponse, json } from '../_shared/utils.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);

Deno.serve(async (req) => {
  const signature = req.headers.get('stripe-signature');
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!signature || !secret) return errorResponse('Missing signature', 400);

  const payload = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(payload, signature, secret);
  } catch (e) {
    return errorResponse(
      `Signature verification failed: ${e instanceof Error ? e.message : ''}`,
      400
    );
  }

  const admin = adminClient();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id ?? session.metadata?.user_id;
      const tier = session.metadata?.tier as 'pro' | 'advanced' | undefined;
      if (!userId || !tier) break;

      await admin
        .from('profiles')
        .update({
          tier,
          stripe_customer_id: (session.customer as string) ?? null,
        })
        .eq('id', userId);

      await admin.from('subscriptions').insert({
        user_id: userId,
        provider: 'stripe',
        provider_subscription_id: (session.subscription as string) ?? null,
        tier,
        status: 'active',
      });

      await admin.from('payments').insert({
        user_id: userId,
        provider: 'stripe',
        provider_payment_id: session.id,
        amount: (session.amount_total ?? 0) / 100,
        currency: session.currency,
        status: 'completed',
        raw: session as unknown as Record<string, unknown>,
      });
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.user_id;
      if (!userId) break;
      const active = ['active', 'trialing'].includes(sub.status);
      const tier = (sub.metadata?.tier as 'pro' | 'advanced') ?? 'pro';

      await admin
        .from('subscriptions')
        .update({
          status: sub.status,
          current_period_end: sub.items.data[0]?.current_period_end
            ? new Date(sub.items.data[0].current_period_end * 1000).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        })
        .eq('provider_subscription_id', sub.id);

      await admin
        .from('profiles')
        .update({ tier: active ? tier : 'free' })
        .eq('id', userId);
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata?.user_id;
      await admin
        .from('subscriptions')
        .update({ status: 'canceled', updated_at: new Date().toISOString() })
        .eq('provider_subscription_id', sub.id);
      if (userId) {
        await admin.from('profiles').update({ tier: 'free' }).eq('id', userId);
      }
      break;
    }
  }

  return json({ received: true });
});
