-- Tidsstämpling: stämpelklocka (in, rast, lunch, byt, ut), manuell tid,
-- admin-hanterade tidskategorier, ändringslogg och summering per arbetsorder.
-- Modellen följer vi-hems stämpelklocka men är anpassad till projekt/arbetsordrar.

-- ============================================================
-- KATEGORIER (admin hanterar, t.ex. Rekning)
-- ============================================================
create table if not exists time_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  key text not null,
  label text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  is_builtin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, key)
);

alter table time_categories enable row level security;

drop policy if exists "org members read time categories" on time_categories;
drop policy if exists "admins manage time categories" on time_categories;
create policy "org members read time categories" on time_categories for select
  using (org_id = current_org_id());
create policy "admins manage time categories" on time_categories for all
  using (is_active_admin() and org_id = current_org_id())
  with check (is_active_admin() and org_id = current_org_id());

insert into time_categories (org_id, key, label, sort_order, is_builtin)
select o.id, v.key, v.label, v.sort_order, true
from organizations o
cross join (values
  ('rekning', 'Rekning', 1),
  ('planering', 'Planering', 2),
  ('transportbokning', 'Transportbokning', 3),
  ('dokumentation', 'Dokumentation', 4),
  ('administration', 'Administration', 5),
  ('resa', 'Resa', 6),
  ('ovrigt', 'Övrigt', 7)
) as v(key, label, sort_order)
on conflict (org_id, key) do nothing;

-- ============================================================
-- TIDSPOSTER
-- ============================================================
create table if not exists time_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  project_id uuid references projects (id) on delete set null,
  project_label text,
  task_id uuid references tasks (id) on delete set null,
  category_key text,
  entry_type text not null default 'work' check (entry_type in ('work', 'break', 'lunch')),
  start_time timestamptz not null,
  end_time timestamptz,
  total_minutes integer not null default 0 check (total_minutes >= 0),
  comment text not null default '',
  source text not null default 'clock' check (source in ('clock', 'manual')),
  edited_by uuid references profiles (id) on delete set null,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time is null or end_time > start_time)
);

create index if not exists idx_time_entries_user_start on time_entries (user_id, start_time desc);
create index if not exists idx_time_entries_project on time_entries (project_id);
create index if not exists idx_time_entries_task on time_entries (task_id);
-- Högst ett pågående pass per person.
create unique index if not exists uq_time_entries_one_open on time_entries (user_id) where end_time is null;

alter table time_entries enable row level security;

drop policy if exists "read own or managed time entries" on time_entries;
create policy "read own or managed time entries" on time_entries for select
  using (
    org_id = current_org_id()
    and (user_id = auth.uid() or current_profile_role() in ('admin', 'projektledare', 'ekonomi'))
  );

-- All skrivning går via funktionerna nedan (ingen direkt insert/update/delete).
revoke insert, update, delete on time_entries from authenticated, anon;

create table if not exists time_clock_operations (
  id uuid primary key,
  user_id uuid not null references profiles (id) on delete cascade,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table time_clock_operations enable row level security;
revoke all on time_clock_operations from authenticated, anon;

-- Ändringslogg: varje ändring/radering av en tidspost sparas (visas för admin).
create table if not exists time_entry_audit (
  id bigint generated always as identity primary key,
  entry_id uuid not null,
  org_id uuid not null,
  action text not null check (action in ('update', 'delete')),
  changed_by uuid,
  changed_at timestamptz not null default now(),
  before jsonb not null,
  after jsonb
);
alter table time_entry_audit enable row level security;
drop policy if exists "admins read time entry audit" on time_entry_audit;
create policy "admins read time entry audit" on time_entry_audit for select
  using (is_active_admin() and org_id = current_org_id());
revoke insert, update, delete on time_entry_audit from authenticated, anon;

create or replace function log_time_entry_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Automatisk stängning av ett pågående pass är en del av stämplingen, inte en ändring.
  if tg_op = 'UPDATE' and old.end_time is null then
    return new;
  end if;
  insert into time_entry_audit (entry_id, org_id, action, changed_by, before, after)
  values (
    old.id, old.org_id, lower(tg_op), auth.uid(), to_jsonb(old),
    case when tg_op = 'UPDATE' then to_jsonb(new) else null end
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_log_time_entry_change on time_entries;
create trigger trg_log_time_entry_change
  after update or delete on time_entries
  for each row execute function log_time_entry_change();

-- ============================================================
-- HJÄLPFUNKTIONER
-- ============================================================
create or replace function time_validate_job(
  p_org uuid, p_category text, p_project uuid, p_task uuid,
  out project_label text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  project_row projects;
begin
  if p_category is null or not exists (
    select 1 from time_categories where org_id = p_org and key = p_category and active
  ) then
    raise exception 'Tidskategorin är inte tillgänglig.';
  end if;
  if p_task is not null and p_project is null then
    raise exception 'En arbetsorder kräver ett projekt.';
  end if;
  if p_project is not null then
    select * into project_row from projects where id = p_project and org_id = p_org;
    if project_row.id is null then
      raise exception 'Projektet hittades inte.' using errcode = '42501';
    end if;
    project_label := project_row.project_number || ' · ' || project_row.name;
    if p_task is not null and not exists (select 1 from tasks where id = p_task and project_id = p_project) then
      raise exception 'Arbetsordern tillhör inte projektet.';
    end if;
  end if;
end;
$$;
revoke all on function time_validate_job(uuid, text, uuid, uuid) from public, anon, authenticated;

-- ============================================================
-- STÄMPELKLOCKAN (atomiska övergångar)
-- ============================================================
create or replace function time_clock_transition(
  p_id uuid,
  p_action text,
  p_expected uuid,
  p_event timestamptz,
  p_project uuid default null,
  p_task uuid default null,
  p_category text default null,
  p_comment text default '',
  p_opening_comment text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor profiles;
  current_entry time_entries;
  subject time_entries;
  next_entry time_entries;
  receipt time_clock_operations;
  closing text := btrim(coalesce(p_comment, ''));
  opening text := btrim(coalesce(p_opening_comment, ''));
  job_category text := p_category;
  job_project uuid := p_project;
  job_task uuid := p_task;
  job_label text;
  result jsonb;
begin
  select * into actor from profiles where id = auth.uid() and status = 'aktiv';
  if actor.id is null or actor.org_id is null then
    raise exception 'Stämpling nekad.' using errcode = '42501';
  end if;
  if p_id is null or p_event is null or not isfinite(p_event) or p_event > now() + interval '5 minutes'
     or p_action is null or p_action not in ('clockin', 'clockout', 'switch', 'break', 'lunch', 'resume')
     or length(closing) > 10000 or length(opening) > 10000 then
    raise exception 'Ogiltig stämpling.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('time-clock:' || actor.id::text, 0));

  select * into receipt from time_clock_operations where id = p_id;
  if receipt.id is not null then
    if receipt.user_id is distinct from actor.id then
      raise exception 'Stämpling nekad.' using errcode = '42501';
    end if;
    return receipt.result;
  end if;

  select * into current_entry from time_entries where user_id = actor.id and end_time is null for update;
  if current_entry.id is distinct from p_expected then
    raise exception 'CLOCK_STATE_CONFLICT' using errcode = '23505';
  end if;
  if current_entry.id is null and exists (select 1 from time_entries where user_id = actor.id and end_time > p_event) then
    raise exception 'CLOCK_STATE_CONFLICT' using errcode = '23505';
  end if;
  if p_action <> 'clockin' and current_entry.id is null then
    raise exception 'Ingen pågående stämpling.';
  end if;
  if p_action = 'clockin' and current_entry.id is not null then
    raise exception 'CLOCK_STATE_CONFLICT' using errcode = '23505';
  end if;
  if current_entry.id is not null and p_event <= current_entry.start_time then
    raise exception 'Tiden ligger före det pågående passet.';
  end if;
  if p_action in ('break', 'lunch') and current_entry.entry_type <> 'work' then
    raise exception 'Du är redan på rast.';
  end if;
  if p_action = 'resume' and current_entry.entry_type = 'work' then
    raise exception 'Ingen pågående rast.';
  end if;

  -- Passet som får avslutande anteckning: pågående arbetspass, eller arbetspasset före en rast.
  if current_entry.entry_type = 'work' then
    subject := current_entry;
  elsif current_entry.id is not null then
    select * into subject from time_entries
    where user_id = actor.id and entry_type = 'work' and end_time = current_entry.start_time
    order by start_time desc limit 1;
  end if;

  if p_action = 'resume' then
    job_category := current_entry.category_key;
    job_project := current_entry.project_id;
    job_task := current_entry.task_id;
  end if;
  if p_action in ('clockin', 'switch', 'resume') then
    select v.project_label into job_label from time_validate_job(actor.org_id, job_category, job_project, job_task) v;
  end if;
  if p_action in ('break', 'lunch') then
    job_category := current_entry.category_key;
    job_project := current_entry.project_id;
    job_task := current_entry.task_id;
    job_label := current_entry.project_label;
  end if;

  if p_action in ('switch', 'clockout', 'break', 'lunch') and closing <> '' and subject.id is not null then
    update time_entries
    set comment = case when btrim(comment) = '' then closing else btrim(comment) || E'\n' || closing end,
        updated_at = now()
    where id = subject.id;
  end if;
  if current_entry.id is not null then
    update time_entries
    set end_time = p_event,
        total_minutes = greatest(floor(extract(epoch from (p_event - start_time)) / 60)::integer, 0),
        updated_at = now()
    where id = current_entry.id;
  end if;

  if p_action <> 'clockout' then
    insert into time_entries (
      id, org_id, user_id, project_id, project_label, task_id, category_key,
      entry_type, start_time, comment, source
    ) values (
      p_id, actor.org_id, actor.id, job_project, job_label, job_task, job_category,
      case when p_action in ('break', 'lunch') then p_action else 'work' end,
      p_event,
      case when p_action = 'break' then 'Rast' when p_action = 'lunch' then 'Lunch' else opening end,
      'clock'
    ) returning * into next_entry;
  end if;

  result := jsonb_build_object(
    'operation', p_id,
    'closed', current_entry.id,
    'current', case when next_entry.id is null then null else to_jsonb(next_entry) end,
    'event_at', p_event
  );
  insert into time_clock_operations (id, user_id, result) values (p_id, actor.id, result);
  return result;
end;
$$;
revoke all on function time_clock_transition(uuid, text, uuid, timestamptz, uuid, uuid, text, text, text) from public, anon;
grant execute on function time_clock_transition(uuid, text, uuid, timestamptz, uuid, uuid, text, text, text) to authenticated;

-- ============================================================
-- MANUELL TID, ÄNDRING OCH RADERING
-- ============================================================
create or replace function time_add_entry(
  p_id uuid,
  p_project uuid,
  p_task uuid,
  p_category text,
  p_start timestamptz,
  p_end timestamptz,
  p_comment text default ''
)
returns time_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  actor profiles;
  existing time_entries;
  created time_entries;
  job_label text;
begin
  select * into actor from profiles where id = auth.uid() and status = 'aktiv';
  if actor.id is null or actor.org_id is null then
    raise exception 'Registrering nekad.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('time-clock:' || actor.id::text, 0));

  select * into existing from time_entries where id = p_id;
  if existing.id is not null then
    if existing.user_id is distinct from actor.id then
      raise exception 'Registrering nekad.' using errcode = '42501';
    end if;
    return existing;
  end if;

  if p_start is null or p_end is null or p_end <= p_start then
    raise exception 'Sluttiden måste vara efter starttiden.';
  end if;
  if p_end > now() + interval '5 minutes' then
    raise exception 'Tiden kan inte ligga i framtiden.';
  end if;
  if p_end - p_start > interval '24 hours' then
    raise exception 'Ett pass kan vara högst 24 timmar.';
  end if;
  if length(coalesce(p_comment, '')) > 10000 then
    raise exception 'Anteckningen är för lång.';
  end if;
  select v.project_label into job_label from time_validate_job(actor.org_id, p_category, p_project, p_task) v;
  if exists (
    select 1 from time_entries
    where user_id = actor.id
      and tstzrange(start_time, coalesce(end_time, 'infinity'), '[)') && tstzrange(p_start, p_end, '[)')
  ) then
    raise exception 'Tiden överlappar ett annat pass.' using errcode = '23P01';
  end if;

  insert into time_entries (
    id, org_id, user_id, project_id, project_label, task_id, category_key,
    entry_type, start_time, end_time, total_minutes, comment, source
  ) values (
    p_id, actor.org_id, actor.id, p_project, job_label, p_task, p_category,
    'work', p_start, p_end, floor(extract(epoch from (p_end - p_start)) / 60)::integer,
    btrim(coalesce(p_comment, '')), 'manual'
  ) returning * into created;
  return created;
end;
$$;
revoke all on function time_add_entry(uuid, uuid, uuid, text, timestamptz, timestamptz, text) from public, anon;
grant execute on function time_add_entry(uuid, uuid, uuid, text, timestamptz, timestamptz, text) to authenticated;

create or replace function time_update_entry(
  p_id uuid,
  p_project uuid,
  p_task uuid,
  p_category text,
  p_start timestamptz,
  p_end timestamptz,
  p_comment text default ''
)
returns time_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  actor profiles;
  target time_entries;
  updated time_entries;
  job_label text;
begin
  select * into actor from profiles where id = auth.uid() and status = 'aktiv';
  if actor.id is null or actor.org_id is null then
    raise exception 'Ändring nekad.' using errcode = '42501';
  end if;
  select * into target from time_entries where id = p_id and org_id = actor.org_id for update;
  if target.id is null or (target.user_id <> actor.id and actor.role <> 'admin') then
    raise exception 'Ändring nekad.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('time-clock:' || target.user_id::text, 0));
  if target.end_time is null then
    raise exception 'Ett pågående pass ändras genom att stämpla ut först.';
  end if;
  if p_start is null or p_end is null or p_end <= p_start then
    raise exception 'Sluttiden måste vara efter starttiden.';
  end if;
  if p_end > now() + interval '5 minutes' then
    raise exception 'Tiden kan inte ligga i framtiden.';
  end if;
  if p_end - p_start > interval '24 hours' then
    raise exception 'Ett pass kan vara högst 24 timmar.';
  end if;
  if length(coalesce(p_comment, '')) > 10000 then
    raise exception 'Anteckningen är för lång.';
  end if;
  if target.entry_type = 'work' then
    select v.project_label into job_label from time_validate_job(actor.org_id, p_category, p_project, p_task) v;
  end if;
  if exists (
    select 1 from time_entries
    where user_id = target.user_id and id <> target.id
      and tstzrange(start_time, coalesce(end_time, 'infinity'), '[)') && tstzrange(p_start, p_end, '[)')
  ) then
    raise exception 'Tiden överlappar ett annat pass.' using errcode = '23P01';
  end if;

  update time_entries
  set project_id = case when entry_type = 'work' then p_project else project_id end,
      project_label = case when entry_type = 'work' then job_label else project_label end,
      task_id = case when entry_type = 'work' then p_task else task_id end,
      category_key = case when entry_type = 'work' then p_category else category_key end,
      start_time = p_start,
      end_time = p_end,
      total_minutes = floor(extract(epoch from (p_end - p_start)) / 60)::integer,
      comment = btrim(coalesce(p_comment, '')),
      edited_by = actor.id,
      edited_at = now(),
      updated_at = now()
  where id = target.id
  returning * into updated;
  return updated;
end;
$$;
revoke all on function time_update_entry(uuid, uuid, uuid, text, timestamptz, timestamptz, text) from public, anon;
grant execute on function time_update_entry(uuid, uuid, uuid, text, timestamptz, timestamptz, text) to authenticated;

create or replace function time_delete_entry(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor profiles;
  target time_entries;
begin
  select * into actor from profiles where id = auth.uid() and status = 'aktiv';
  if actor.id is null then
    raise exception 'Radering nekad.' using errcode = '42501';
  end if;
  select * into target from time_entries where id = p_id and org_id = actor.org_id for update;
  if target.id is null or (target.user_id <> actor.id and actor.role <> 'admin') then
    raise exception 'Radering nekad.' using errcode = '42501';
  end if;
  if target.end_time is null then
    raise exception 'Ett pågående pass raderas inte. Stämpla ut först.';
  end if;
  delete from time_entries where id = target.id;
end;
$$;
revoke all on function time_delete_entry(uuid) from public, anon;
grant execute on function time_delete_entry(uuid) to authenticated;

-- ============================================================
-- SUMMERING (alla interna användare ser total tid per projekt/arbetsorder/kategori
-- utan att se vem som registrerat den)
-- ============================================================
create or replace function time_totals()
returns table (project_id uuid, task_id uuid, category_key text, minutes bigint)
language sql
security definer
set search_path = public
stable
as $$
  select t.project_id, t.task_id, t.category_key, sum(t.total_minutes)::bigint
  from time_entries t
  where t.org_id = current_org_id()
    and t.entry_type = 'work'
    and t.end_time is not null
    and t.project_id is not null
  group by t.project_id, t.task_id, t.category_key;
$$;
revoke all on function time_totals() from public, anon;
grant execute on function time_totals() to authenticated;

grant select on time_categories, time_entries, time_entry_audit to authenticated;

notify pgrst, 'reload schema';
