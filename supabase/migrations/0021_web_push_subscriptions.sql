create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_sent_at timestamptz,
  last_error text
);
create index push_subscriptions_user_idx on public.push_subscriptions(user_id, org_id);
alter table public.push_subscriptions enable row level security;
-- Subscription keys are managed only through the authenticated Edge Function.
revoke all on public.push_subscriptions from anon, authenticated;
grant all on public.push_subscriptions to service_role;
