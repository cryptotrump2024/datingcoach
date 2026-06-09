-- CharmCoach initial schema
-- Tiers, credits, personas, conversations, coaching, ratings, payments.

create type tier as enum ('free', 'pro', 'advanced');
create type conversation_status as enum ('active', 'ghosted', 'ended', 'number_given');
create type payment_provider as enum ('stripe', 'nowpayments');

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user, including anonymous trial users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  tier tier not null default 'free',
  stripe_customer_id text,
  created_at timestamptz not null default now()
);

create table public.usage_credits (
  user_id uuid primary key references auth.users (id) on delete cascade,
  period_start date not null default date_trunc('month', now()),
  messages_used integer not null default 0
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  insert into public.usage_credits (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Subscriptions & payments
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider payment_provider not null,
  provider_subscription_id text,
  tier tier not null,
  status text not null default 'active', -- active | past_due | canceled | expired
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_user_idx on public.subscriptions (user_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  provider payment_provider not null,
  provider_payment_id text,
  amount numeric,
  currency text,
  status text not null,
  raw jsonb,
  created_at timestamptz not null default now()
);
create index payments_user_idx on public.payments (user_id);

-- ---------------------------------------------------------------------------
-- Personas & conversations
-- ---------------------------------------------------------------------------
create table public.personas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  difficulty integer not null check (difficulty between 1 and 10),
  ethnicity text not null,
  personality_archetype text not null,
  characteristics jsonb not null default '{}',
  image_url text,
  created_at timestamptz not null default now()
);
create index personas_user_idx on public.personas (user_id);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  persona_id uuid not null references public.personas (id) on delete cascade,
  mode text not null default 'dating_app',
  interest_level integer not null default 50 check (interest_level between 0 and 100),
  status conversation_status not null default 'active',
  created_at timestamptz not null default now()
);
create index conversations_user_idx on public.conversations (user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index messages_convo_idx on public.messages (conversation_id, created_at);

create table public.message_feedback (
  message_id uuid primary key references public.messages (id) on delete cascade,
  feedback jsonb not null,
  created_at timestamptz not null default now()
);

create table public.conversation_ratings (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  overall_score integer not null,
  categories jsonb not null,
  top_improvements jsonb not null,
  psychology_insight text not null,
  summary text not null,
  created_at timestamptz not null default now()
);
create index ratings_convo_idx on public.conversation_ratings (conversation_id);

create table public.profile_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  analysis jsonb not null,
  created_at timestamptz not null default now()
);
create index analyses_user_idx on public.profile_analyses (user_id);

-- ---------------------------------------------------------------------------
-- Storage bucket for persona portraits
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('personas', 'personas', true)
on conflict (id) do nothing;

create policy "Public read persona images"
  on storage.objects for select
  using (bucket_id = 'personas');

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Users can read/insert their own rows. Edge functions use the service role
-- for writes that must bypass these (messages, feedback, subscriptions).
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.usage_credits enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.personas enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.message_feedback enable row level security;
alter table public.conversation_ratings enable row level security;
alter table public.profile_analyses enable row level security;

create policy "own profile read" on public.profiles
  for select using (auth.uid() = id);
create policy "own profile update" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
-- Users may only edit display_name; tier changes go through payment webhooks
revoke update on public.profiles from authenticated, anon;
grant update (display_name) on public.profiles to authenticated;

create policy "own credits read" on public.usage_credits
  for select using (auth.uid() = user_id);

create policy "own subscriptions read" on public.subscriptions
  for select using (auth.uid() = user_id);

create policy "own payments read" on public.payments
  for select using (auth.uid() = user_id);

create policy "own personas" on public.personas
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own conversations" on public.conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own messages read" on public.messages
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

create policy "own feedback read" on public.message_feedback
  for select using (
    exists (
      select 1
      from public.messages m
      join public.conversations c on c.id = m.conversation_id
      where m.id = message_id and c.user_id = auth.uid()
    )
  );

create policy "own ratings read" on public.conversation_ratings
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  );

create policy "own analyses read" on public.profile_analyses
  for select using (auth.uid() = user_id);
