# CharmCoach — AI Dating Conversation Simulator

> The flight simulator for dating — practice real conversations with AI women, get coached on every message, and never fumble a match again.

Practice dating-app conversations against realistic AI personas (you pick difficulty, ethnicity, personality, and characteristics). She texts like a real person: she teases, gets bored, tests you, and **ghosts you** if you fumble. Every message you send is scored by an AI coach that decodes the *invisible context* — what she's really communicating — and a "Rate conversation" button produces a full report card with category scores and advice.

## Features

- **Persona builder** — difficulty slider (1–10), ethnicity, 8 personality archetypes, age/occupation/interests, texting + attachment style. AI-generated portrait (FLUX via fal.ai) for Pro+.
- **Realistic chat simulation** — streaming replies from Claude (`claude-opus-4-8`), hidden interest meter (0–100) drives her behavior; she can give her number (win), end it, or leave you on read.
- **Per-message coaching** — score 1–10, what worked/hurt, invisible-context decode, "what she really means", a stronger rewrite of your message, and a tip.
- **Conversation report card** — overall grade + 6 categories (Opening, Engagement, Wit & Humor, Confidence, Emotional Intelligence, Escalation & Close), top-3 improvements, psychology insight.
- **Profile analyzer** (Advanced) — upload a dating-profile screenshot; Claude vision decodes it and writes tailored openers.
- **Tiers** — Free: 15 messages, no signup (anonymous auth). Pro $9.95/mo: 500 msgs, all personas, portraits, full decoder, ratings, interest meter. Advanced $19.95/mo: unlimited msgs + profile analyzer + (roadmap) relationship-maintenance coaching, science deep-dives, progress tracking.
- **Payments** — Stripe subscriptions + crypto prepaid passes (USDT/USDC/BTC via NOWPayments, 1/3/12 months).

## Repo layout

```
apps/mobile-web/    Expo (React Native) app — runs on web today, iOS/Android via EAS in phase 2
supabase/
  migrations/       Postgres schema + RLS + pg_cron pass expiry
  functions/        Edge Functions: chat, coach, rate-conversation,
                    generate-persona-image, analyze-profile-image,
                    create-checkout, stripe-webhook, nowpayments-webhook
MARKETING.md        One-liner + full go-to-market plan
```

## Setup

### Accounts you need

| Service | Used for | Keys |
|---|---|---|
| [Supabase](https://supabase.com) | DB, auth, storage, edge functions | project URL, anon key, service-role key |
| [Anthropic](https://platform.claude.com) | chat + coaching AI | `ANTHROPIC_API_KEY` |
| [fal.ai](https://fal.ai) | persona portraits (FLUX) | `FAL_KEY` |
| [Stripe](https://stripe.com) | card subscriptions | secret key, webhook secret, 2 price IDs |
| [NOWPayments](https://nowpayments.io) | crypto payments | API key, IPN secret |

### 1. Supabase

```sh
supabase link --project-ref <your-project-ref>
supabase db push                      # applies migrations/
supabase secrets set \
  ANTHROPIC_API_KEY=sk-ant-... \
  FAL_KEY=... \
  STRIPE_SECRET_KEY=sk_live_... \
  STRIPE_WEBHOOK_SECRET=whsec_... \
  STRIPE_PRICE_PRO=price_... \
  STRIPE_PRICE_ADVANCED=price_... \
  NOWPAYMENTS_API_KEY=... \
  NOWPAYMENTS_IPN_SECRET=... \
  APP_URL=https://your-app.vercel.app
supabase functions deploy chat coach rate-conversation generate-persona-image \
  analyze-profile-image create-checkout
supabase functions deploy stripe-webhook nowpayments-webhook --no-verify-jwt
```

In the Supabase dashboard: enable **Anonymous sign-ins** (Auth → Providers) and, optionally, Google/Apple OAuth.

In Stripe: create two recurring prices ($9.95, $19.95) and a webhook endpoint pointed at
`https://<project>.supabase.co/functions/v1/stripe-webhook` for events
`checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.

### 2. App (local dev)

```sh
cd apps/mobile-web
npm install
EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co \
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key> \
npm run web
```

### 3. Deploy web to Vercel

```sh
cd apps/mobile-web && npx expo export --platform web
```

Deploy the `dist/` output (Vercel: framework "Other", output dir `apps/mobile-web/dist`, build command `cd apps/mobile-web && npm install && npx expo export --platform web`). Set the two `EXPO_PUBLIC_*` env vars in Vercel.

## Cost tuning

All AI calls default to `claude-opus-4-8` for maximum coaching quality. If per-message cost needs trimming, set the `CHAT_MODEL` secret to `claude-sonnet-4-6` — persona replies switch to Sonnet while coaching/ratings stay on Opus. (`COACH_MODEL` exists too.)

## Roadmap (phase 2)

- **Relationship-maintenance mode** — post-meeting coaching: deepening connection, keeping her invested, conflict navigation.
- **iOS / Android store releases** — EAS builds + RevenueCat for in-app purchases (stores require IAP; Stripe/crypto stay on web).
- **Progress tracking** — score trends across conversations, weak-category drills.
- **Science library** — short explainers on the psychology behind each coaching concept.

## Positioning & ethics

CharmCoach teaches genuine communication skills grounded in social psychology — curiosity, humor, confidence, emotional attunement. The coaching prompts explicitly refuse manipulation tactics. All personas are adults; simulations are clearly labeled AI; content stays PG-13.
