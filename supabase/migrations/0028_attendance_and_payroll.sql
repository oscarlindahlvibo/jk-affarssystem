-- Fristående stämpelklocka (närvaro), korrigeringar, scheman och övertidsregler, attestering,
-- löneunderlag och export.
--
-- Närvarotid (attendance_*) är personalens verkliga arbetstid och lönegrundande. Den är helt
-- skild från projektbaserad tid (time_entries, 0025) och från kunddebitering (work_reports, 0027):
-- ingen av dem påverkar närvarotiden och ingen kräver att summorna är lika.

-- ============================================================
-- BEHÖRIGHETSHJÄLPARE
-- ============================================================
create or replace function is_attester()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'aktiv' and role in ('admin', 'projektledare'));
$$;

create or replace function is_payroll_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'aktiv' and role in ('admin', 'ekonomi'));
$$;

create or replace function can_view_payroll()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'aktiv' and role in ('admin', 'projektledare', 'ekonomi'));
$$;

create or replace function sthlm_date(p_ts timestamptz)
returns date
language sql
immutable
as $$
  select (p_ts at time zone 'Europe/Stockholm')::date;
$$;

-- ============================================================
-- SCHEMAN, REGLER OCH LÖNEKODER (konfigureras av JK)
-- ============================================================
create table if not exists overtime_rule_sets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  config jsonb not null check (jsonb_typeof(config) = 'object' and config ? 'version'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function valid_schedule(p_schedule jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  day_key text;
begin
  if p_schedule is null or jsonb_typeof(p_schedule) <> 'object' then return false; end if;
  foreach day_key in array array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] loop
    if not (p_schedule ? day_key) or jsonb_typeof(p_schedule -> day_key) <> 'number'
       or (p_schedule ->> day_key)::numeric < 0 or (p_schedule ->> day_key)::numeric > 1440 then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create table if not exists employee_terms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  valid_from date not null,
  employment_number text,
  employment_type text,
  weekly_hours numeric(5, 2) check (weekly_hours is null or (weekly_hours >= 0 and weekly_hours <= 168)),
  employment_rate numeric(5, 2) check (employment_rate is null or (employment_rate > 0 and employment_rate <= 100)),
  schedule jsonb not null check (valid_schedule(schedule)),
  rule_set_id uuid references overtime_rule_sets (id) on delete set null,
  external_employee_ref text,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (user_id, valid_from)
);
create index if not exists idx_employee_terms_user on employee_terms (user_id, valid_from desc);

create table if not exists payroll_code_mappings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  time_type text not null check (length(btrim(time_type)) > 0),
  external_code text not null default '',
  label text not null default '',
  updated_at timestamptz not null default now(),
  unique (org_id, time_type)
);

-- ============================================================
-- NÄRVARO (STÄMPELKLOCKA)
-- ============================================================
create table if not exists attendance_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  entry_type text not null default 'work' check (entry_type in ('work', 'break', 'lunch')),
  start_time timestamptz not null,
  end_time timestamptz,
  total_minutes integer not null default 0 check (total_minutes >= 0),
  source text not null default 'clock' check (source in ('clock', 'manual', 'correction', 'admin')),
  comment text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_by uuid,
  edited_at timestamptz,
  check (end_time is null or end_time > start_time)
);
create index if not exists idx_attendance_user_start on attendance_entries (user_id, start_time desc);
-- Högst ett pågående pass per person, även om flera enheter stämplar samtidigt.
create unique index if not exists uq_attendance_one_open on attendance_entries (user_id) where end_time is null;

create table if not exists attendance_absences (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  absence_date date not null,
  kind text not null check (kind in ('absence_sick', 'absence_vab', 'absence_vacation', 'absence_leave', 'absence_other')),
  minutes integer not null check (minutes > 0 and minutes <= 1440),
  comment text not null default '',
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_attendance_absences_user on attendance_absences (user_id, absence_date);

create table if not exists attendance_clock_operations (
  id uuid primary key,
  user_id uuid not null references profiles (id) on delete cascade,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists attendance_audit (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  user_id uuid not null,
  entry_id uuid,
  action text not null check (action in ('create', 'update', 'delete')),
  reason text,
  before jsonb,
  after jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);
create index if not exists idx_attendance_audit_user on attendance_audit (user_id, changed_at desc);

create table if not exists attendance_corrections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  action text not null check (action in ('change', 'add', 'delete')),
  entry_id uuid,
  proposed_type text check (proposed_type in ('work', 'break', 'lunch')),
  proposed_start timestamptz,
  proposed_end timestamptz,
  reason text not null check (length(btrim(reason)) > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- LÖNEPERIODER, ATTESTERING OCH EXPORT
-- ============================================================
create table if not exists payroll_periods (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  check (end_date >= start_date),
  unique (org_id, start_date, end_date)
);

create table if not exists payroll_exports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  period_id uuid not null references payroll_periods (id) on delete cascade,
  format text not null,
  kind text not null check (kind in ('regular', 'correction', 'reexport')),
  statement_ids uuid[] not null,
  row_count integer not null default 0,
  checksum text,
  reason text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists payroll_statements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  period_id uuid not null references payroll_periods (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  status text not null default 'submitted' check (status in ('preliminary', 'submitted', 'attested', 'reviewed', 'exported')),
  totals jsonb,
  days jsonb,
  rule_snapshot jsonb,
  submitted_at timestamptz,
  submitted_by uuid,
  attested_at timestamptz,
  attested_by uuid,
  reviewed_at timestamptz,
  reviewed_by uuid,
  exported_at timestamptz,
  exported_by uuid,
  last_export_id uuid references payroll_exports (id) on delete set null,
  pending_adjustment boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (period_id, user_id)
);

create table if not exists payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  statement_id uuid not null references payroll_statements (id) on delete cascade,
  user_id uuid not null,
  time_type text not null,
  minutes_delta integer not null check (minutes_delta <> 0),
  reason text not null check (length(btrim(reason)) > 0),
  created_by uuid,
  created_at timestamptz not null default now(),
  export_id uuid references payroll_exports (id) on delete set null
);

create table if not exists payroll_log (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  statement_id uuid,
  period_id uuid,
  user_id uuid,
  action text not null,
  reason text,
  details jsonb,
  actor uuid,
  at timestamptz not null default now()
);

-- ============================================================
-- RLS
-- ============================================================
alter table overtime_rule_sets enable row level security;
alter table employee_terms enable row level security;
alter table payroll_code_mappings enable row level security;
alter table attendance_entries enable row level security;
alter table attendance_absences enable row level security;
alter table attendance_clock_operations enable row level security;
alter table attendance_audit enable row level security;
alter table attendance_corrections enable row level security;
alter table payroll_periods enable row level security;
alter table payroll_exports enable row level security;
alter table payroll_statements enable row level security;
alter table payroll_adjustments enable row level security;
alter table payroll_log enable row level security;

drop policy if exists "staff read rule sets" on overtime_rule_sets;
create policy "staff read rule sets" on overtime_rule_sets for select using (org_id = current_org_id());
drop policy if exists "own or payroll read terms" on employee_terms;
create policy "own or payroll read terms" on employee_terms for select
  using (org_id = current_org_id() and (user_id = auth.uid() or can_view_payroll()));
drop policy if exists "payroll read code mappings" on payroll_code_mappings;
create policy "payroll read code mappings" on payroll_code_mappings for select using (org_id = current_org_id() and can_view_payroll());

drop policy if exists "own or payroll read attendance" on attendance_entries;
create policy "own or payroll read attendance" on attendance_entries for select
  using (org_id = current_org_id() and (user_id = auth.uid() or can_view_payroll()));
drop policy if exists "own or payroll read absences" on attendance_absences;
create policy "own or payroll read absences" on attendance_absences for select
  using (org_id = current_org_id() and (user_id = auth.uid() or can_view_payroll()));
drop policy if exists "own or payroll read attendance audit" on attendance_audit;
create policy "own or payroll read attendance audit" on attendance_audit for select
  using (org_id = current_org_id() and (user_id = auth.uid() or can_view_payroll()));
drop policy if exists "own or attester read corrections" on attendance_corrections;
create policy "own or attester read corrections" on attendance_corrections for select
  using (org_id = current_org_id() and (user_id = auth.uid() or is_attester()));

drop policy if exists "staff read periods" on payroll_periods;
create policy "staff read periods" on payroll_periods for select using (org_id = current_org_id());
drop policy if exists "own or payroll read statements" on payroll_statements;
create policy "own or payroll read statements" on payroll_statements for select
  using (org_id = current_org_id() and (user_id = auth.uid() or can_view_payroll()));
drop policy if exists "payroll admin read adjustments" on payroll_adjustments;
create policy "payroll admin read adjustments" on payroll_adjustments for select using (org_id = current_org_id() and is_payroll_admin());
drop policy if exists "payroll admin read exports" on payroll_exports;
create policy "payroll admin read exports" on payroll_exports for select using (org_id = current_org_id() and is_payroll_admin());
drop policy if exists "payroll read log" on payroll_log;
create policy "payroll read log" on payroll_log for select using (org_id = current_org_id() and can_view_payroll());

revoke insert, update, delete on
  overtime_rule_sets, employee_terms, payroll_code_mappings, attendance_entries, attendance_absences,
  attendance_clock_operations, attendance_audit, attendance_corrections, payroll_periods, payroll_exports,
  payroll_statements, payroll_adjustments, payroll_log
from authenticated, anon;
revoke all on attendance_clock_operations from authenticated, anon;
grant select on
  overtime_rule_sets, employee_terms, payroll_code_mappings, attendance_entries, attendance_absences,
  attendance_audit, attendance_corrections, payroll_periods, payroll_exports, payroll_statements,
  payroll_adjustments, payroll_log
to authenticated;

-- ============================================================
-- LÅS OCH ÖPPNING AV PERIODER
-- ============================================================
-- Returnerar 'exported' om någon berörd period är exporterad, annars 'attested' om attesterad/granskad.
create or replace function attendance_lock_state(p_user uuid, p_from date, p_to date)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select case
    when bool_or(s.status = 'exported') then 'exported'
    when bool_or(s.status in ('attested', 'reviewed')) then 'attested'
    else null
  end
  from payroll_statements s
  join payroll_periods p on p.id = s.period_id
  where s.user_id = p_user and p.start_date <= p_to and p.end_date >= p_from;
$$;

-- Kontrollerar att en ändring får göras och hanterar berörda lönesammanställningar.
-- Anställd får aldrig ändra låst period. Admin/projektledare kan öppna en attesterad period igen
-- (med orsak), och admin kan rätta en exporterad period som då blir en spårbar rättelse.
create or replace function attendance_guard_change(p_actor_id uuid, p_user uuid, p_from date, p_to date, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  state text := attendance_lock_state(p_user, p_from, p_to);
  actor_role text;
  statement_row payroll_statements;
begin
  select role into actor_role from profiles where id = p_actor_id and status = 'aktiv';
  if actor_role is null then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;

  if state = 'exported' then
    if actor_role <> 'admin' then raise exception 'Perioden är exporterad. Endast admin kan göra en spårbar rättelse.' using errcode = '42501'; end if;
    if coalesce(btrim(p_reason), '') = '' then raise exception 'Ange orsak till rättelsen.'; end if;
    for statement_row in
      select s.* from payroll_statements s join payroll_periods p on p.id = s.period_id
      where s.user_id = p_user and s.status = 'exported' and p.start_date <= p_to and p.end_date >= p_from
    loop
      update payroll_statements set pending_adjustment = true, updated_at = now() where id = statement_row.id;
      insert into payroll_log (org_id, statement_id, period_id, user_id, action, reason, actor)
      values (statement_row.org_id, statement_row.id, statement_row.period_id, p_user, 'correction_after_export', p_reason, p_actor_id);
    end loop;
  elsif state = 'attested' then
    if actor_role not in ('admin', 'projektledare') then raise exception 'Perioden är attesterad och kan inte ändras.' using errcode = '42501'; end if;
    if coalesce(btrim(p_reason), '') = '' then raise exception 'Ange orsak. Attesten öppnas igen.'; end if;
    for statement_row in
      select s.* from payroll_statements s join payroll_periods p on p.id = s.period_id
      where s.user_id = p_user and s.status in ('attested', 'reviewed') and p.start_date <= p_to and p.end_date >= p_from
    loop
      update payroll_statements
      set status = 'preliminary', attested_at = null, attested_by = null, reviewed_at = null, reviewed_by = null,
          totals = null, days = null, rule_snapshot = null, updated_at = now()
      where id = statement_row.id;
      insert into payroll_log (org_id, statement_id, period_id, user_id, action, reason, actor)
      values (statement_row.org_id, statement_row.id, statement_row.period_id, p_user, 'reopened_by_change', p_reason, p_actor_id);
    end loop;
  else
    -- En inskickad men inte attesterad period går tillbaka till preliminär när tiden ändras.
    update payroll_statements s set status = 'preliminary', submitted_at = null, submitted_by = null, updated_at = now()
    from payroll_periods p
    where p.id = s.period_id and s.user_id = p_user and s.status = 'submitted' and p.start_date <= p_to and p.end_date >= p_from;
  end if;
end;
$$;
revoke all on function attendance_guard_change(uuid, uuid, date, date, text) from public, anon, authenticated;

create or replace function attendance_log(p_entry attendance_entries, p_action text, p_before jsonb, p_reason text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into attendance_audit (org_id, user_id, entry_id, action, reason, before, after, changed_by)
  values (
    p_entry.org_id, p_entry.user_id, p_entry.id, p_action, p_reason, p_before,
    case when p_action = 'delete' then null else to_jsonb(p_entry) end, auth.uid()
  );
$$;
revoke all on function attendance_log(attendance_entries, text, jsonb, text) from public, anon, authenticated;

-- ============================================================
-- STÄMPELKLOCKAN (atomiska övergångar, idempotenta)
-- ============================================================
create or replace function attendance_clock_transition(
  p_id uuid,
  p_action text,
  p_expected uuid,
  p_event timestamptz,
  p_comment text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor profiles;
  current_entry attendance_entries;
  next_entry attendance_entries;
  receipt attendance_clock_operations;
  closing text := btrim(coalesce(p_comment, ''));
  result jsonb;
begin
  select * into actor from profiles where id = auth.uid() and status = 'aktiv';
  if actor.id is null or actor.org_id is null then raise exception 'Stämpling nekad.' using errcode = '42501'; end if;
  -- Stämplingen får inte backdateras: tiden ska ligga nära serverns tid. Missad tid läggs in som manuell registrering
  -- (med orsak och logg). Tröskeln kan bara ändras av databasägaren (testhook app.max_clock_skew).
  if p_id is null or p_event is null or not isfinite(p_event) or p_event > now() + interval '5 minutes'
     or p_event < now() - coalesce(nullif(current_setting('app.max_clock_skew', true), ''), '15 minutes')::interval
     or p_action is null or p_action not in ('clockin', 'clockout', 'break', 'lunch', 'resume') or length(closing) > 10000 then
    raise exception 'Ogiltig stämpling.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('attendance-clock:' || actor.id::text, 0));

  select * into receipt from attendance_clock_operations where id = p_id;
  if receipt.id is not null then
    if receipt.user_id is distinct from actor.id then raise exception 'Stämpling nekad.' using errcode = '42501'; end if;
    return receipt.result;
  end if;

  select * into current_entry from attendance_entries where user_id = actor.id and end_time is null for update;
  if current_entry.id is distinct from p_expected then raise exception 'CLOCK_STATE_CONFLICT' using errcode = '23505'; end if;
  if current_entry.id is null and exists (select 1 from attendance_entries where user_id = actor.id and end_time > p_event) then
    raise exception 'CLOCK_STATE_CONFLICT' using errcode = '23505';
  end if;
  if p_action = 'clockin' and current_entry.id is not null then raise exception 'CLOCK_STATE_CONFLICT' using errcode = '23505'; end if;
  if p_action <> 'clockin' and current_entry.id is null then raise exception 'Ingen pågående stämpling.'; end if;
  if current_entry.id is not null and p_event <= current_entry.start_time then raise exception 'Tiden ligger före det pågående passet.'; end if;
  if p_action in ('break', 'lunch') and current_entry.entry_type <> 'work' then raise exception 'Du är redan på rast.'; end if;
  if p_action = 'resume' and current_entry.entry_type = 'work' then raise exception 'Ingen pågående rast.'; end if;

  perform attendance_guard_change(
    actor.id, actor.id,
    sthlm_date(coalesce(current_entry.start_time, p_event)), sthlm_date(p_event), null
  );

  if current_entry.id is not null then
    update attendance_entries
    set end_time = p_event,
        total_minutes = greatest(floor(extract(epoch from (p_event - start_time)) / 60)::integer, 0),
        comment = case
          when closing <> '' and p_action in ('clockout', 'break', 'lunch') and entry_type = 'work'
            then case when btrim(comment) = '' then closing else btrim(comment) || E'\n' || closing end
          else comment end,
        updated_at = now()
    where id = current_entry.id;
  end if;

  if p_action <> 'clockout' then
    insert into attendance_entries (id, org_id, user_id, entry_type, start_time, source, comment, created_by)
    values (
      p_id, actor.org_id, actor.id,
      case when p_action in ('break', 'lunch') then p_action else 'work' end,
      p_event, 'clock',
      case when p_action = 'clockin' then closing else '' end,
      actor.id
    ) returning * into next_entry;
  end if;

  result := jsonb_build_object(
    'operation', p_id,
    'closed', current_entry.id,
    'current', case when next_entry.id is null then null else to_jsonb(next_entry) end,
    'event_at', p_event
  );
  insert into attendance_clock_operations (id, user_id, result) values (p_id, actor.id, result);
  return result;
end;
$$;
revoke all on function attendance_clock_transition(uuid, text, uuid, timestamptz, text) from public, anon;
grant execute on function attendance_clock_transition(uuid, text, uuid, timestamptz, text) to authenticated;

-- ============================================================
-- MISSAD STÄMPLING, RÄTTELSER OCH KORRIGERINGSFÖRFRÅGNINGAR
-- ============================================================
create or replace function attendance_validate_span(p_user uuid, p_ignore uuid, p_start timestamptz, p_end timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_start is null or p_end is null or p_end <= p_start then raise exception 'Sluttiden måste vara efter starttiden.'; end if;
  if p_end > now() + interval '5 minutes' then raise exception 'Tiden kan inte ligga i framtiden.'; end if;
  if p_end - p_start > interval '24 hours' then raise exception 'Ett pass kan vara högst 24 timmar.'; end if;
  if exists (
    select 1 from attendance_entries
    where user_id = p_user and id is distinct from p_ignore
      and tstzrange(start_time, coalesce(end_time, 'infinity'), '[)') && tstzrange(p_start, p_end, '[)')
  ) then
    raise exception 'Tiden överlappar ett annat pass.' using errcode = '23P01';
  end if;
end;
$$;
revoke all on function attendance_validate_span(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- Lägger till flera pass atomiskt (t.ex. arbete + lunch + arbete för en missad dag).
create or replace function attendance_add_entries(p_entries jsonb, p_user uuid default null, p_reason text default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  actor profiles;
  target_user uuid;
  item jsonb;
  created attendance_entries;
  v_type text;
  v_source text;
  count_added integer := 0;
begin
  select * into actor from profiles where id = auth.uid() and status = 'aktiv';
  if actor.id is null then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
  target_user := coalesce(p_user, actor.id);
  if target_user <> actor.id then
    if actor.role not in ('admin', 'projektledare') then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
    if coalesce(btrim(p_reason), '') = '' then raise exception 'Ange orsak.'; end if;
    if not exists (select 1 from profiles where id = target_user and org_id = actor.org_id and status = 'aktiv') then raise exception 'Personen hittades inte.'; end if;
    v_source := 'admin';
  else
    v_source := 'manual';
  end if;
  if jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) = 0 or jsonb_array_length(p_entries) > 10 then
    raise exception 'Ogiltiga pass.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('attendance-clock:' || target_user::text, 0));

  for item in select value from jsonb_array_elements(p_entries) loop
    v_type := coalesce(nullif(item ->> 'type', ''), 'work');
    if v_type not in ('work', 'break', 'lunch') then raise exception 'Ogiltig typ.'; end if;
    if (item ->> 'id') is not null and exists (select 1 from attendance_entries where id = (item ->> 'id')::uuid) then
      continue; -- idempotent återförsök
    end if;
    perform attendance_validate_span(target_user, null, (item ->> 'start')::timestamptz, (item ->> 'end')::timestamptz);
    perform attendance_guard_change(actor.id, target_user, sthlm_date((item ->> 'start')::timestamptz), sthlm_date((item ->> 'end')::timestamptz), p_reason);
    insert into attendance_entries (id, org_id, user_id, entry_type, start_time, end_time, total_minutes, source, comment, created_by)
    values (
      coalesce((item ->> 'id')::uuid, gen_random_uuid()), actor.org_id, target_user, v_type,
      (item ->> 'start')::timestamptz, (item ->> 'end')::timestamptz,
      floor(extract(epoch from ((item ->> 'end')::timestamptz - (item ->> 'start')::timestamptz)) / 60)::integer,
      v_source, btrim(coalesce(item ->> 'comment', '')), actor.id
    ) returning * into created;
    perform attendance_log(created, 'create', null, coalesce(p_reason, 'Missad stämpling inlagd manuellt'));
    count_added := count_added + 1;
  end loop;
  return count_added;
end;
$$;
revoke all on function attendance_add_entries(jsonb, uuid, text) from public, anon;
grant execute on function attendance_add_entries(jsonb, uuid, text) to authenticated;

-- Ändra/ta bort pass. Egna pass i öppen period kräver orsak; andras pass kräver admin/projektledare.
create or replace function attendance_change_entry(p_id uuid, p_type text, p_start timestamptz, p_end timestamptz, p_comment text, p_reason text)
returns attendance_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  actor profiles;
  target attendance_entries;
  updated attendance_entries;
  v_before jsonb;
begin
  select * into actor from profiles where id = auth.uid() and status = 'aktiv';
  if actor.id is null then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
  select * into target from attendance_entries where id = p_id and org_id = actor.org_id for update;
  if target.id is null then raise exception 'Passet hittades inte.'; end if;
  if target.user_id <> actor.id and actor.role not in ('admin', 'projektledare') then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Ange orsak till ändringen.'; end if;
  if target.end_time is null then raise exception 'Ett pågående pass ändras genom att stämpla ut först.'; end if;
  if p_type not in ('work', 'break', 'lunch') then raise exception 'Ogiltig typ.'; end if;

  perform pg_advisory_xact_lock(hashtextextended('attendance-clock:' || target.user_id::text, 0));
  perform attendance_validate_span(target.user_id, target.id, p_start, p_end);
  perform attendance_guard_change(
    actor.id, target.user_id,
    least(sthlm_date(target.start_time), sthlm_date(p_start)), greatest(sthlm_date(target.end_time), sthlm_date(p_end)), p_reason
  );

  v_before := to_jsonb(target);
  update attendance_entries
  set entry_type = p_type, start_time = p_start, end_time = p_end,
      total_minutes = floor(extract(epoch from (p_end - p_start)) / 60)::integer,
      comment = btrim(coalesce(p_comment, '')), source = case when target.user_id = actor.id then 'correction' else 'admin' end,
      edited_by = actor.id, edited_at = now(), updated_at = now()
  where id = target.id
  returning * into updated;
  perform attendance_log(updated, 'update', v_before, p_reason);
  return updated;
end;
$$;
revoke all on function attendance_change_entry(uuid, text, timestamptz, timestamptz, text, text) from public, anon;
grant execute on function attendance_change_entry(uuid, text, timestamptz, timestamptz, text, text) to authenticated;

create or replace function attendance_delete_entry(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor profiles;
  target attendance_entries;
begin
  select * into actor from profiles where id = auth.uid() and status = 'aktiv';
  if actor.id is null then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
  select * into target from attendance_entries where id = p_id and org_id = actor.org_id for update;
  if target.id is null then raise exception 'Passet hittades inte.'; end if;
  if target.user_id <> actor.id and actor.role not in ('admin', 'projektledare') then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Ange orsak till borttagningen.'; end if;
  if target.end_time is null then raise exception 'Ett pågående pass tas inte bort. Stämpla ut först.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('attendance-clock:' || target.user_id::text, 0));
  perform attendance_guard_change(actor.id, target.user_id, sthlm_date(target.start_time), sthlm_date(target.end_time), p_reason);
  perform attendance_log(target, 'delete', to_jsonb(target), p_reason);
  delete from attendance_entries where id = target.id;
end;
$$;
revoke all on function attendance_delete_entry(uuid, text) from public, anon;
grant execute on function attendance_delete_entry(uuid, text) to authenticated;

-- En anställd föreslår en rättelse; behörig godkänner eller avslår.
create or replace function attendance_request_correction(
  p_id uuid, p_action text, p_entry_id uuid, p_type text, p_start timestamptz, p_end timestamptz, p_reason text
)
returns attendance_corrections
language plpgsql
security definer
set search_path = public
as $$
declare
  actor profiles;
  created attendance_corrections;
  existing attendance_corrections;
begin
  select * into actor from profiles where id = auth.uid() and status = 'aktiv';
  if actor.id is null then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
  select * into existing from attendance_corrections where id = p_id;
  if existing.id is not null then
    if existing.user_id <> actor.id then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
    return existing;
  end if;
  if p_action not in ('change', 'add', 'delete') then raise exception 'Ogiltig rättelse.'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Ange orsak.'; end if;
  if p_action in ('change', 'delete') and not exists (select 1 from attendance_entries where id = p_entry_id and user_id = actor.id) then
    raise exception 'Passet hittades inte.';
  end if;
  if p_action in ('change', 'add') then
    if p_type not in ('work', 'break', 'lunch') or p_start is null or p_end is null or p_end <= p_start then raise exception 'Ogiltiga tider.'; end if;
  end if;
  insert into attendance_corrections (id, org_id, user_id, action, entry_id, proposed_type, proposed_start, proposed_end, reason)
  values (p_id, actor.org_id, actor.id, p_action, p_entry_id, p_type, p_start, p_end, btrim(p_reason))
  returning * into created;
  return created;
end;
$$;
revoke all on function attendance_request_correction(uuid, text, uuid, text, timestamptz, timestamptz, text) from public, anon;
grant execute on function attendance_request_correction(uuid, text, uuid, text, timestamptz, timestamptz, text) to authenticated;

create or replace function attendance_decide_correction(p_id uuid, p_approve boolean, p_note text)
returns attendance_corrections
language plpgsql
security definer
set search_path = public
as $$
declare
  actor profiles;
  request attendance_corrections;
  decided attendance_corrections;
  v_reason text;
begin
  select * into actor from profiles where id = auth.uid() and status = 'aktiv';
  if actor.id is null or actor.role not in ('admin', 'projektledare') then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
  select * into request from attendance_corrections where id = p_id and org_id = actor.org_id for update;
  if request.id is null then raise exception 'Förfrågan hittades inte.'; end if;
  if request.status <> 'pending' then raise exception 'Förfrågan är redan hanterad.'; end if;
  if request.user_id = actor.id and actor.role <> 'admin' then raise exception 'Du kan inte godkänna din egen rättelse.' using errcode = '42501'; end if;
  v_reason := 'Rättelse godkänd: ' || request.reason;

  if p_approve then
    -- Samma regler som vid direkt ändring (inklusive periodlås) tillämpas för godkänd rättelse.
    perform pg_advisory_xact_lock(hashtextextended('attendance-clock:' || request.user_id::text, 0));
    if request.action = 'delete' then
      declare target attendance_entries;
      begin
        select * into target from attendance_entries where id = request.entry_id for update;
        if target.id is null then raise exception 'Passet finns inte längre.'; end if;
        perform attendance_guard_change(actor.id, request.user_id, sthlm_date(target.start_time), sthlm_date(coalesce(target.end_time, target.start_time)), v_reason);
        perform attendance_log(target, 'delete', to_jsonb(target), v_reason);
        delete from attendance_entries where id = target.id;
      end;
    elsif request.action = 'add' then
      declare created attendance_entries;
      begin
        perform attendance_validate_span(request.user_id, null, request.proposed_start, request.proposed_end);
        perform attendance_guard_change(actor.id, request.user_id, sthlm_date(request.proposed_start), sthlm_date(request.proposed_end), v_reason);
        insert into attendance_entries (org_id, user_id, entry_type, start_time, end_time, total_minutes, source, comment, created_by)
        values (request.org_id, request.user_id, request.proposed_type, request.proposed_start, request.proposed_end,
          floor(extract(epoch from (request.proposed_end - request.proposed_start)) / 60)::integer, 'correction', '', actor.id)
        returning * into created;
        perform attendance_log(created, 'create', null, v_reason);
      end;
    else
      declare target attendance_entries; updated attendance_entries;
      begin
        select * into target from attendance_entries where id = request.entry_id for update;
        if target.id is null or target.end_time is null then raise exception 'Passet kan inte ändras.'; end if;
        perform attendance_validate_span(request.user_id, target.id, request.proposed_start, request.proposed_end);
        perform attendance_guard_change(
          actor.id, request.user_id,
          least(sthlm_date(target.start_time), sthlm_date(request.proposed_start)),
          greatest(sthlm_date(target.end_time), sthlm_date(request.proposed_end)), v_reason
        );
        update attendance_entries
        set entry_type = request.proposed_type, start_time = request.proposed_start, end_time = request.proposed_end,
            total_minutes = floor(extract(epoch from (request.proposed_end - request.proposed_start)) / 60)::integer,
            source = 'correction', edited_by = actor.id, edited_at = now(), updated_at = now()
        where id = target.id returning * into updated;
        perform attendance_log(updated, 'update', to_jsonb(target), v_reason);
      end;
    end if;
  end if;

  update attendance_corrections
  set status = case when p_approve then 'approved' else 'rejected' end, decided_by = actor.id, decided_at = now(),
      decision_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = request.id returning * into decided;
  return decided;
end;
$$;
revoke all on function attendance_decide_correction(uuid, boolean, text) from public, anon;
grant execute on function attendance_decide_correction(uuid, boolean, text) to authenticated;

-- ============================================================
-- FRÅNVARO (registreras av ansvarig/ekonomi)
-- ============================================================
create or replace function attendance_absence_save(p_id uuid, p_user uuid, p_date date, p_kind text, p_minutes integer, p_comment text, p_reason text)
returns attendance_absences
language plpgsql
security definer
set search_path = public
as $$
declare
  actor profiles;
  saved attendance_absences;
  existing attendance_absences;
begin
  select * into actor from profiles where id = auth.uid() and status = 'aktiv';
  if actor.id is null or actor.role not in ('admin', 'projektledare', 'ekonomi') then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
  if not exists (select 1 from profiles where id = p_user and org_id = actor.org_id and status = 'aktiv') then raise exception 'Personen hittades inte.'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Ange orsak.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('attendance-clock:' || p_user::text, 0));
  -- Ett befintligt id får bara ändras inom samma organisation och person (ingen överskrivning av andras rader).
  select * into existing from attendance_absences where id = p_id for update;
  if existing.id is not null then
    if existing.org_id <> actor.org_id or existing.user_id <> p_user then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
    if actor.role = 'ekonomi' and attendance_lock_state(existing.user_id, existing.absence_date, existing.absence_date) is not null then
      raise exception 'Perioden är attesterad eller exporterad.' using errcode = '42501';
    end if;
    if actor.role <> 'ekonomi' then perform attendance_guard_change(actor.id, existing.user_id, existing.absence_date, existing.absence_date, p_reason); end if;
  end if;
  if actor.role = 'ekonomi' and attendance_lock_state(p_user, p_date, p_date) is not null then
    raise exception 'Perioden är attesterad eller exporterad.' using errcode = '42501';
  end if;
  if actor.role <> 'ekonomi' then perform attendance_guard_change(actor.id, p_user, p_date, p_date, p_reason); end if;
  insert into attendance_absences (id, org_id, user_id, absence_date, kind, minutes, comment, created_by)
  values (coalesce(p_id, gen_random_uuid()), actor.org_id, p_user, p_date, p_kind, p_minutes, btrim(coalesce(p_comment, '')), actor.id)
  on conflict (id) do update set absence_date = excluded.absence_date, kind = excluded.kind, minutes = excluded.minutes, comment = excluded.comment
  returning * into saved;
  insert into payroll_log (org_id, user_id, action, reason, details, actor)
  values (actor.org_id, p_user, 'absence_saved', p_reason, to_jsonb(saved), actor.id);
  return saved;
end;
$$;
revoke all on function attendance_absence_save(uuid, uuid, date, text, integer, text, text) from public, anon;
grant execute on function attendance_absence_save(uuid, uuid, date, text, integer, text, text) to authenticated;

create or replace function attendance_absence_delete(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor profiles;
  target attendance_absences;
begin
  select * into actor from profiles where id = auth.uid() and status = 'aktiv';
  if actor.id is null or actor.role not in ('admin', 'projektledare', 'ekonomi') then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
  select * into target from attendance_absences where id = p_id and org_id = actor.org_id;
  if target.id is null then raise exception 'Frånvaron hittades inte.'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Ange orsak.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('attendance-clock:' || target.user_id::text, 0));
  if actor.role = 'ekonomi' and attendance_lock_state(target.user_id, target.absence_date, target.absence_date) is not null then
    raise exception 'Perioden är attesterad eller exporterad.' using errcode = '42501';
  end if;
  if actor.role <> 'ekonomi' then perform attendance_guard_change(actor.id, target.user_id, target.absence_date, target.absence_date, p_reason); end if;
  insert into payroll_log (org_id, user_id, action, reason, details, actor)
  values (actor.org_id, target.user_id, 'absence_deleted', p_reason, to_jsonb(target), actor.id);
  delete from attendance_absences where id = target.id;
end;
$$;
revoke all on function attendance_absence_delete(uuid, text) from public, anon;
grant execute on function attendance_absence_delete(uuid, text) to authenticated;

-- ============================================================
-- SCHEMAN, REGLER, LÖNEKODER (admin/ekonomi)
-- ============================================================
create or replace function employee_terms_save(p_terms jsonb)
returns employee_terms
language plpgsql
security definer
set search_path = public
as $$
declare
  actor profiles;
  saved employee_terms;
  v_user uuid := (p_terms ->> 'user_id')::uuid;
begin
  select * into actor from profiles where id = auth.uid() and status = 'aktiv';
  if actor.id is null or actor.role not in ('admin', 'ekonomi') then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
  if not exists (select 1 from profiles where id = v_user and org_id = actor.org_id) then raise exception 'Personen hittades inte.'; end if;
  if not valid_schedule(p_terms -> 'schedule') then raise exception 'Ogiltigt arbetstidsschema.'; end if;
  if nullif(p_terms ->> 'rule_set_id', '') is not null and not exists (
    select 1 from overtime_rule_sets where id = (p_terms ->> 'rule_set_id')::uuid and org_id = actor.org_id
  ) then
    raise exception 'Regeluppsättningen hittades inte.';
  end if;
  insert into employee_terms (
    org_id, user_id, valid_from, employment_number, employment_type, weekly_hours, employment_rate, schedule,
    rule_set_id, external_employee_ref, note, created_by
  ) values (
    actor.org_id, v_user, (p_terms ->> 'valid_from')::date, nullif(btrim(p_terms ->> 'employment_number'), ''),
    nullif(btrim(p_terms ->> 'employment_type'), ''), nullif(p_terms ->> 'weekly_hours', '')::numeric,
    nullif(p_terms ->> 'employment_rate', '')::numeric, p_terms -> 'schedule', nullif(p_terms ->> 'rule_set_id', '')::uuid,
    nullif(btrim(p_terms ->> 'external_employee_ref'), ''), nullif(btrim(p_terms ->> 'note'), ''), actor.id
  )
  on conflict (user_id, valid_from) do update set
    employment_number = excluded.employment_number, employment_type = excluded.employment_type,
    weekly_hours = excluded.weekly_hours, employment_rate = excluded.employment_rate, schedule = excluded.schedule,
    rule_set_id = excluded.rule_set_id, external_employee_ref = excluded.external_employee_ref, note = excluded.note
  returning * into saved;
  insert into payroll_log (org_id, user_id, action, details, actor) values (actor.org_id, v_user, 'terms_saved', to_jsonb(saved), actor.id);
  return saved;
end;
$$;
revoke all on function employee_terms_save(jsonb) from public, anon;
grant execute on function employee_terms_save(jsonb) to authenticated;

create or replace function overtime_rule_set_save(p_id uuid, p_name text, p_config jsonb, p_active boolean)
returns overtime_rule_sets
language plpgsql
security definer
set search_path = public
as $$
declare
  actor profiles;
  saved overtime_rule_sets;
begin
  select * into actor from profiles where id = auth.uid() and status = 'aktiv';
  if actor.id is null or actor.role not in ('admin', 'ekonomi') then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
  if jsonb_typeof(p_config) <> 'object' or not (p_config ? 'version') then raise exception 'Ogiltig regelkonfiguration.'; end if;
  insert into overtime_rule_sets (id, org_id, name, config, active)
  values (coalesce(p_id, gen_random_uuid()), actor.org_id, btrim(p_name), p_config, coalesce(p_active, true))
  on conflict (id) do update set name = excluded.name, config = excluded.config, active = excluded.active, updated_at = now()
  where overtime_rule_sets.org_id = actor.org_id
  returning * into saved;
  if saved.id is null then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
  insert into payroll_log (org_id, action, details, actor) values (actor.org_id, 'rule_set_saved', to_jsonb(saved), actor.id);
  return saved;
end;
$$;
revoke all on function overtime_rule_set_save(uuid, text, jsonb, boolean) from public, anon;
grant execute on function overtime_rule_set_save(uuid, text, jsonb, boolean) to authenticated;

create or replace function payroll_code_mapping_save(p_time_type text, p_external_code text, p_label text)
returns payroll_code_mappings
language plpgsql
security definer
set search_path = public
as $$
declare
  actor profiles;
  saved payroll_code_mappings;
begin
  select * into actor from profiles where id = auth.uid() and status = 'aktiv';
  if actor.id is null or actor.role not in ('admin', 'ekonomi') then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
  insert into payroll_code_mappings (org_id, time_type, external_code, label)
  values (actor.org_id, btrim(p_time_type), btrim(coalesce(p_external_code, '')), btrim(coalesce(p_label, '')))
  on conflict (org_id, time_type) do update set external_code = excluded.external_code, label = excluded.label, updated_at = now()
  returning * into saved;
  insert into payroll_log (org_id, action, details, actor) values (actor.org_id, 'code_mapping_saved', to_jsonb(saved), actor.id);
  return saved;
end;
$$;
revoke all on function payroll_code_mapping_save(text, text, text) from public, anon;
grant execute on function payroll_code_mapping_save(text, text, text) to authenticated;

-- ============================================================
-- LÖNEPERIODER OCH ATTESTERING
-- ============================================================
create or replace function payroll_period_create(p_name text, p_start date, p_end date)
returns payroll_periods
language plpgsql
security definer
set search_path = public
as $$
declare
  actor profiles;
  saved payroll_periods;
begin
  select * into actor from profiles where id = auth.uid() and status = 'aktiv';
  if actor.id is null or actor.role not in ('admin', 'ekonomi') then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
  if p_end < p_start then raise exception 'Slutdatum måste vara efter startdatum.'; end if;
  if exists (select 1 from payroll_periods where org_id = actor.org_id and start_date <= p_end and end_date >= p_start) then
    raise exception 'Perioden överlappar en befintlig löneperiod.';
  end if;
  insert into payroll_periods (org_id, name, start_date, end_date, created_by)
  values (actor.org_id, btrim(p_name), p_start, p_end, actor.id) returning * into saved;
  return saved;
end;
$$;
revoke all on function payroll_period_create(text, date, date) from public, anon;
grant execute on function payroll_period_create(text, date, date) to authenticated;

create or replace function payroll_statement_submit(p_period_id uuid)
returns payroll_statements
language plpgsql
security definer
set search_path = public
as $$
declare
  actor profiles;
  period payroll_periods;
  saved payroll_statements;
  existing payroll_statements;
begin
  select * into actor from profiles where id = auth.uid() and status = 'aktiv';
  if actor.id is null then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
  select * into period from payroll_periods where id = p_period_id and org_id = actor.org_id;
  if period.id is null then raise exception 'Löneperioden hittades inte.'; end if;
  if exists (select 1 from attendance_entries where user_id = actor.id and end_time is null
             and sthlm_date(start_time) between period.start_date and period.end_date) then
    raise exception 'Du har en pågående stämpling i perioden. Stämpla ut först.';
  end if;
  select * into existing from payroll_statements where period_id = p_period_id and user_id = actor.id;
  if existing.id is not null and existing.status in ('attested', 'reviewed', 'exported') then
    raise exception 'Perioden är redan attesterad.';
  end if;
  insert into payroll_statements (org_id, period_id, user_id, status, submitted_at, submitted_by)
  values (actor.org_id, p_period_id, actor.id, 'submitted', now(), actor.id)
  on conflict (period_id, user_id) do update set status = 'submitted', submitted_at = now(), submitted_by = actor.id, updated_at = now()
  returning * into saved;
  return saved;
end;
$$;
revoke all on function payroll_statement_submit(uuid) from public, anon;
grant execute on function payroll_statement_submit(uuid) to authenticated;

create or replace function payroll_statement_attest(p_period_id uuid, p_user_id uuid, p_totals jsonb, p_days jsonb, p_rule_snapshot jsonb)
returns payroll_statements
language plpgsql
security definer
set search_path = public
as $$
declare
  actor profiles;
  period payroll_periods;
  existing payroll_statements;
  saved payroll_statements;
begin
  select * into actor from profiles where id = auth.uid() and status = 'aktiv';
  if actor.id is null or actor.role not in ('admin', 'projektledare') then raise exception 'Endast admin eller projektledare kan attestera.' using errcode = '42501'; end if;
  if p_user_id = actor.id and actor.role <> 'admin' then raise exception 'Du kan inte attestera din egen tid.' using errcode = '42501'; end if;
  select * into period from payroll_periods where id = p_period_id and org_id = actor.org_id;
  if period.id is null then raise exception 'Löneperioden hittades inte.'; end if;
  if not exists (select 1 from profiles where id = p_user_id and org_id = actor.org_id) then raise exception 'Personen hittades inte.'; end if;
  if p_totals is null or jsonb_typeof(p_totals) <> 'object' or not (p_totals ? 'workedMinutes') or jsonb_typeof(p_days) <> 'array' then
    raise exception 'Ogiltigt löneunderlag.';
  end if;
  if exists (select 1 from attendance_entries where user_id = p_user_id and end_time is null
             and sthlm_date(start_time) between period.start_date and period.end_date) then
    raise exception 'Personen har en pågående stämpling i perioden.';
  end if;
  select * into existing from payroll_statements where period_id = p_period_id and user_id = p_user_id;
  if existing.id is not null and existing.status in ('attested', 'reviewed', 'exported') then
    raise exception 'Perioden är redan attesterad.';
  end if;
  insert into payroll_statements (org_id, period_id, user_id, status, totals, days, rule_snapshot, attested_at, attested_by)
  values (actor.org_id, p_period_id, p_user_id, 'attested', p_totals, p_days, p_rule_snapshot, now(), actor.id)
  on conflict (period_id, user_id) do update set
    status = 'attested', totals = excluded.totals, days = excluded.days, rule_snapshot = excluded.rule_snapshot,
    attested_at = now(), attested_by = actor.id, updated_at = now()
  returning * into saved;
  insert into payroll_log (org_id, statement_id, period_id, user_id, action, actor) values (actor.org_id, saved.id, p_period_id, p_user_id, 'attested', actor.id);
  return saved;
end;
$$;
revoke all on function payroll_statement_attest(uuid, uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function payroll_statement_attest(uuid, uuid, jsonb, jsonb, jsonb) to authenticated;

create or replace function payroll_statement_unattest(p_statement_id uuid, p_reason text)
returns payroll_statements
language plpgsql
security definer
set search_path = public
as $$
declare
  actor profiles;
  target payroll_statements;
  saved payroll_statements;
begin
  select * into actor from profiles where id = auth.uid() and status = 'aktiv';
  if actor.id is null or actor.role not in ('admin', 'projektledare') then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
  select * into target from payroll_statements where id = p_statement_id and org_id = actor.org_id for update;
  if target.id is null then raise exception 'Sammanställningen hittades inte.'; end if;
  if target.status not in ('attested', 'reviewed') then raise exception 'Endast attesterade sammanställningar kan öppnas igen. Exporterade rättas via spårbar rättelse.'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Ange orsak.'; end if;
  update payroll_statements
  set status = 'preliminary', attested_at = null, attested_by = null, reviewed_at = null, reviewed_by = null,
      totals = null, days = null, rule_snapshot = null, updated_at = now()
  where id = target.id returning * into saved;
  insert into payroll_log (org_id, statement_id, period_id, user_id, action, reason, actor)
  values (actor.org_id, target.id, target.period_id, target.user_id, 'unattested', p_reason, actor.id);
  return saved;
end;
$$;
revoke all on function payroll_statement_unattest(uuid, text) from public, anon;
grant execute on function payroll_statement_unattest(uuid, text) to authenticated;

create or replace function payroll_statement_review(p_statement_id uuid)
returns payroll_statements
language plpgsql
security definer
set search_path = public
as $$
declare
  actor profiles;
  target payroll_statements;
  saved payroll_statements;
begin
  select * into actor from profiles where id = auth.uid() and status = 'aktiv';
  if actor.id is null or actor.role not in ('admin', 'ekonomi') then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
  select * into target from payroll_statements where id = p_statement_id and org_id = actor.org_id for update;
  if target.id is null then raise exception 'Sammanställningen hittades inte.'; end if;
  if target.status <> 'attested' then raise exception 'Endast attesterade sammanställningar kan granskas.'; end if;
  update payroll_statements set status = 'reviewed', reviewed_at = now(), reviewed_by = actor.id, updated_at = now()
  where id = target.id returning * into saved;
  insert into payroll_log (org_id, statement_id, period_id, user_id, action, actor)
  values (actor.org_id, target.id, target.period_id, target.user_id, 'reviewed', actor.id);
  return saved;
end;
$$;
revoke all on function payroll_statement_review(uuid) from public, anon;
grant execute on function payroll_statement_review(uuid) to authenticated;

-- Registrerar en rättelse efter export: skillnaden mot tidigare underlag sparas som rättelserader.
create or replace function payroll_record_adjustment(p_statement_id uuid, p_new_totals jsonb, p_new_days jsonb, p_reason text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  actor profiles;
  target payroll_statements;
  type_key text;
  old_minutes integer;
  new_minutes integer;
  inserted integer := 0;
  old_values jsonb;
  new_values jsonb;
begin
  select * into actor from profiles where id = auth.uid() and status = 'aktiv';
  if actor.id is null or actor.role not in ('admin', 'ekonomi') then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
  select * into target from payroll_statements where id = p_statement_id and org_id = actor.org_id for update;
  if target.id is null then raise exception 'Sammanställningen hittades inte.'; end if;
  if target.status <> 'exported' then raise exception 'Rättelser registreras bara för exporterade sammanställningar.'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Ange orsak.'; end if;
  if p_new_totals is null or jsonb_typeof(p_new_totals) <> 'object' then raise exception 'Ogiltigt löneunderlag.'; end if;

  -- Jämför ordinarie, övertid per nivå och frånvaro per typ.
  old_values := jsonb_build_object('ordinary', coalesce((target.totals ->> 'ordinaryMinutes')::int, 0))
    || coalesce(target.totals -> 'overtime', '{}'::jsonb) || coalesce(target.totals -> 'absence', '{}'::jsonb);
  new_values := jsonb_build_object('ordinary', coalesce((p_new_totals ->> 'ordinaryMinutes')::int, 0))
    || coalesce(p_new_totals -> 'overtime', '{}'::jsonb) || coalesce(p_new_totals -> 'absence', '{}'::jsonb);

  for type_key in select k from (select jsonb_object_keys(old_values) k union select jsonb_object_keys(new_values)) keys loop
    old_minutes := coalesce((old_values ->> type_key)::int, 0);
    new_minutes := coalesce((new_values ->> type_key)::int, 0);
    if new_minutes <> old_minutes then
      insert into payroll_adjustments (org_id, statement_id, user_id, time_type, minutes_delta, reason, created_by)
      values (actor.org_id, target.id, target.user_id, type_key, new_minutes - old_minutes, btrim(p_reason), actor.id);
      inserted := inserted + 1;
    end if;
  end loop;

  update payroll_statements set totals = p_new_totals, days = p_new_days, pending_adjustment = false, updated_at = now() where id = target.id;
  insert into payroll_log (org_id, statement_id, period_id, user_id, action, reason, details, actor)
  values (actor.org_id, target.id, target.period_id, target.user_id, 'adjustment_recorded', p_reason, jsonb_build_object('rows', inserted), actor.id);
  return inserted;
end;
$$;
revoke all on function payroll_record_adjustment(uuid, jsonb, jsonb, text) from public, anon;
grant execute on function payroll_record_adjustment(uuid, jsonb, jsonb, text) to authenticated;

-- Export: registrerar exporten och låser statusen. Dubbel export kräver uttryckligt bekräftande med orsak.
create or replace function payroll_export_create(
  p_period_id uuid, p_statement_ids uuid[], p_format text, p_checksum text, p_row_count integer, p_force boolean, p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor profiles;
  period payroll_periods;
  statement_row payroll_statements;
  v_export_id uuid := gen_random_uuid();
  export_kind text := 'regular';
  already_exported text := '';
  has_unexported_adjustments boolean;
begin
  select * into actor from profiles where id = auth.uid() and status = 'aktiv';
  if actor.id is null or actor.role not in ('admin', 'ekonomi') then raise exception 'Endast admin eller ekonomi kan exportera.' using errcode = '42501'; end if;
  select * into period from payroll_periods where id = p_period_id and org_id = actor.org_id;
  if period.id is null then raise exception 'Löneperioden hittades inte.'; end if;
  if coalesce(array_length(p_statement_ids, 1), 0) = 0 then raise exception 'Inga sammanställningar valda.'; end if;

  for statement_row in select * from payroll_statements where id = any (p_statement_ids) and org_id = actor.org_id and period_id = p_period_id for update loop
    select exists (select 1 from payroll_adjustments where statement_id = statement_row.id and export_id is null) into has_unexported_adjustments;
    if statement_row.status = 'reviewed' then
      null;
    elsif statement_row.status = 'exported' and has_unexported_adjustments then
      export_kind := case when export_kind = 'regular' then 'correction' else export_kind end;
    elsif statement_row.status = 'exported' then
      already_exported := already_exported || statement_row.user_id::text || ' ';
    else
      raise exception 'Alla sammanställningar måste vara granskade innan export (% är %).', statement_row.user_id, statement_row.status;
    end if;
    if statement_row.pending_adjustment then raise exception 'En rättelse väntar på att registreras för personen % innan ny export.', statement_row.user_id; end if;
  end loop;
  if (select count(*) from payroll_statements where id = any (p_statement_ids) and org_id = actor.org_id and period_id = p_period_id) <> array_length(p_statement_ids, 1) then
    raise exception 'Någon sammanställning hittades inte i perioden.';
  end if;

  if already_exported <> '' then
    if not coalesce(p_force, false) or coalesce(btrim(p_reason), '') = '' then
      raise exception 'Redan exporterat för: %. Bekräfta ny export med orsak.', already_exported;
    end if;
    export_kind := 'reexport';
  end if;

  insert into payroll_exports (id, org_id, period_id, format, kind, statement_ids, row_count, checksum, reason, created_by)
  values (v_export_id, actor.org_id, p_period_id, p_format, export_kind, p_statement_ids, coalesce(p_row_count, 0), p_checksum, nullif(btrim(coalesce(p_reason, '')), ''), actor.id);

  update payroll_statements
  set status = 'exported', exported_at = coalesce(exported_at, now()), exported_by = coalesce(exported_by, actor.id), last_export_id = v_export_id, updated_at = now()
  where id = any (p_statement_ids) and org_id = actor.org_id and status in ('reviewed', 'exported');
  update payroll_adjustments set export_id = v_export_id
  where statement_id = any (p_statement_ids) and payroll_adjustments.export_id is null;

  insert into payroll_log (org_id, period_id, action, reason, details, actor)
  values (actor.org_id, p_period_id, 'exported', p_reason, jsonb_build_object('export_id', v_export_id, 'kind', export_kind, 'format', p_format, 'statements', p_statement_ids), actor.id);
  return v_export_id;
end;
$$;
revoke all on function payroll_export_create(uuid, uuid[], text, text, integer, boolean, text) from public, anon;
grant execute on function payroll_export_create(uuid, uuid[], text, text, integer, boolean, text) to authenticated;

notify pgrst, 'reload schema';
