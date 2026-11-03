-- Notisinkorg per användare: samma notiser som skickas som push/e-post sparas här, så de kan läsas i appen (klockan),
-- markeras som lästa eller rensas. Rensade notiser tas inte bort utan döljs och kan visas igen som historik.
-- Rader skapas enbart av Edge Functions (service role); användaren får bara läsa sina egna och ändra read_at/cleared_at.

create table if not exists user_notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  kind text not null check (kind in ('note', 'project', 'project_update', 'task')),
  title text not null,
  body text not null default '',
  url text,
  project_id uuid references projects (id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  cleared_at timestamptz
);

create index if not exists idx_user_notifications_user on user_notifications (user_id, created_at desc);

alter table user_notifications enable row level security;

drop policy if exists "users read own notifications" on user_notifications;
create policy "users read own notifications" on user_notifications
  for select using (user_id = auth.uid());

drop policy if exists "users update own notifications" on user_notifications;
create policy "users update own notifications" on user_notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on user_notifications from anon, authenticated;
grant select on user_notifications to authenticated;
grant update (read_at, cleared_at) on user_notifications to authenticated;
