-- Crypto prepaid passes have no recurring billing: downgrade users whose
-- pass expired. Runs daily via pg_cron.

create extension if not exists pg_cron;

create or replace function public.expire_prepaid_passes()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.subscriptions s
  set status = 'expired', updated_at = now()
  where s.provider = 'nowpayments'
    and s.status = 'active'
    and s.current_period_end < now();

  -- Downgrade profiles with no remaining active subscription on any provider
  update public.profiles p
  set tier = 'free'
  where p.tier <> 'free'
    and not exists (
      select 1 from public.subscriptions s
      where s.user_id = p.id
        and s.status = 'active'
        and (s.current_period_end is null or s.current_period_end > now())
    );
end;
$$;

select cron.schedule(
  'expire-prepaid-passes',
  '15 3 * * *', -- daily at 03:15 UTC
  $$select public.expire_prepaid_passes()$$
);
