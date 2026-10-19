-- Rapporterat arbete på projekt/transportorder, fakturaunderlag och externa transportörer.
--
-- Viktigt: det här är KUNDDEBITERING och transportörernas rapportering. Det är helt skilt från
-- personalens lönegrundande arbetstid (attendance_*, 0028) och påverkar den aldrig.

-- ============================================================
-- TRANSPORTÖRSANVÄNDARE (externa, begränsad åtkomst)
-- ============================================================
create table if not exists carrier_users (
  id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid not null references organizations (id) on delete cascade,
  supplier_id uuid not null references suppliers (id) on delete cascade,
  full_name text not null,
  email text not null unique,
  status text not null default 'inbjuden' check (status in ('aktiv', 'inbjuden', 'inaktiverad')),
  initials text,
  invited_at timestamptz,
  created_at timestamptz not null default now()
);
alter table carrier_users enable row level security;

create or replace function current_carrier_user()
returns carrier_users
language sql
security definer
set search_path = public
stable
as $$
  select * from carrier_users where id = auth.uid() and status = 'aktiv';
$$;

drop policy if exists "carriers read own user" on carrier_users;
drop policy if exists "admins manage carrier users" on carrier_users;
create policy "carriers read own user" on carrier_users for select using (id = auth.uid());
create policy "admins manage carrier users" on carrier_users for all
  using (is_active_admin() and org_id = current_org_id())
  with check (is_active_admin() and org_id = current_org_id());

-- ============================================================
-- RAPPORTERAT ARBETE
-- ============================================================
create table if not exists work_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  task_id uuid references tasks (id) on delete set null,
  report_date date not null,
  performer_type text not null check (performer_type in ('employee', 'carrier')),
  performer_profile_id uuid references profiles (id) on delete set null,
  performer_carrier_user_id uuid references carrier_users (id) on delete set null,
  performer_supplier_id uuid references suppliers (id) on delete set null,
  performer_name text not null,
  hours numeric(7, 2) check (hours is null or (hours >= 0 and hours <= 999)),
  distance_km numeric(8, 1) check (distance_km is null or (distance_km >= 0 and distance_km <= 99999)),
  waiting_hours numeric(7, 2) check (waiting_hours is null or (waiting_hours >= 0 and waiting_hours <= 999)),
  work_type text not null default 'transport',
  billable boolean not null default true,
  comment text not null default '',
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_by uuid,
  edited_at timestamptz,
  check (coalesce(hours, 0) > 0 or coalesce(distance_km, 0) > 0 or coalesce(waiting_hours, 0) > 0)
);
create index if not exists idx_work_reports_project on work_reports (project_id, report_date);
create index if not exists idx_work_reports_performer on work_reports (performer_profile_id);
create index if not exists idx_work_reports_carrier on work_reports (performer_carrier_user_id);

-- Intern kostnad ligger i en egen tabell så att den aldrig följer med när rapporter läses av andra.
create table if not exists work_report_costs (
  report_id uuid primary key references work_reports (id) on delete cascade,
  org_id uuid not null,
  internal_cost numeric(12, 2) not null check (internal_cost >= 0),
  updated_by uuid,
  updated_at timestamptz not null default now()
);

-- Justering av fakturerbara mängder/priser och faktureringsmarkering. Ursprunglig rapport lämnas orörd.
create table if not exists work_report_billing (
  report_id uuid primary key references work_reports (id) on delete cascade,
  org_id uuid not null,
  billable_hours numeric(7, 2) check (billable_hours is null or billable_hours >= 0),
  billable_distance_km numeric(8, 1) check (billable_distance_km is null or billable_distance_km >= 0),
  billable_waiting_hours numeric(7, 2) check (billable_waiting_hours is null or billable_waiting_hours >= 0),
  hours_rate numeric(12, 2) check (hours_rate is null or hours_rate >= 0),
  distance_rate numeric(12, 2) check (distance_rate is null or distance_rate >= 0),
  waiting_rate numeric(12, 2) check (waiting_rate is null or waiting_rate >= 0),
  adjust_reason text,
  adjusted_by uuid,
  adjusted_at timestamptz,
  invoiced_at timestamptz,
  invoiced_by uuid,
  invoice_reference text
);

create table if not exists billing_rates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  customer_id uuid references customers (id) on delete cascade,
  project_id uuid references projects (id) on delete cascade,
  rate_type text not null check (rate_type in ('hours', 'distance', 'waiting')),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  updated_at timestamptz not null default now(),
  check ((customer_id is null) <> (project_id is null))
);
create unique index if not exists uq_billing_rates_customer on billing_rates (customer_id, rate_type) where customer_id is not null;
create unique index if not exists uq_billing_rates_project on billing_rates (project_id, rate_type) where project_id is not null;

create table if not exists billing_extra_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  description text not null check (length(btrim(description)) > 0),
  quantity numeric(10, 2) not null check (quantity > 0),
  unit text not null default 'st',
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  invoiced_at timestamptz,
  invoiced_by uuid,
  invoice_reference text,
  created_by uuid,
  created_at timestamptz not null default now()
);

-- Ändringslogg för all ändring och radering av rapporter, justeringar, priser och poster.
create table if not exists billing_audit (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  table_name text not null,
  row_id text not null,
  action text not null check (action in ('update', 'delete')),
  reason text,
  changed_by uuid,
  changed_at timestamptz not null default now(),
  before jsonb not null,
  after jsonb
);

create or replace function log_billing_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_key text;
begin
  row_key := coalesce(to_jsonb(old)->>'id', to_jsonb(old)->>'report_id');
  insert into billing_audit (org_id, table_name, row_id, action, reason, changed_by, before, after)
  values (
    (to_jsonb(old)->>'org_id')::uuid, tg_table_name, row_key, lower(tg_op),
    nullif(current_setting('app.audit_reason', true), ''), auth.uid(), to_jsonb(old),
    case when tg_op = 'UPDATE' then to_jsonb(new) else null end
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_work_reports on work_reports;
create trigger trg_audit_work_reports after update or delete on work_reports for each row execute function log_billing_change();
drop trigger if exists trg_audit_work_report_costs on work_report_costs;
create trigger trg_audit_work_report_costs after update or delete on work_report_costs for each row execute function log_billing_change();
drop trigger if exists trg_audit_work_report_billing on work_report_billing;
create trigger trg_audit_work_report_billing after update or delete on work_report_billing for each row execute function log_billing_change();
drop trigger if exists trg_audit_billing_rates on billing_rates;
create trigger trg_audit_billing_rates after update or delete on billing_rates for each row execute function log_billing_change();
drop trigger if exists trg_audit_billing_extra_lines on billing_extra_lines;
create trigger trg_audit_billing_extra_lines after update or delete on billing_extra_lines for each row execute function log_billing_change();

-- ============================================================
-- RLS
-- ============================================================
alter table work_reports enable row level security;
alter table work_report_costs enable row level security;
alter table work_report_billing enable row level security;
alter table billing_rates enable row level security;
alter table billing_extra_lines enable row level security;
alter table billing_audit enable row level security;

drop policy if exists "staff read work reports" on work_reports;
create policy "staff read work reports" on work_reports for select using (org_id = current_org_id());

drop policy if exists "finance read work report costs" on work_report_costs;
create policy "finance read work report costs" on work_report_costs for select using (org_id = current_org_id() and can_edit_finance());
drop policy if exists "finance read work report billing" on work_report_billing;
create policy "finance read work report billing" on work_report_billing for select using (org_id = current_org_id() and can_edit_finance());
drop policy if exists "finance read billing rates" on billing_rates;
create policy "finance read billing rates" on billing_rates for select using (org_id = current_org_id() and can_edit_finance());
drop policy if exists "finance read extra lines" on billing_extra_lines;
create policy "finance read extra lines" on billing_extra_lines for select using (org_id = current_org_id() and can_edit_finance());
drop policy if exists "admins read billing audit" on billing_audit;
create policy "admins read billing audit" on billing_audit for select using (org_id = current_org_id() and is_active_admin());

-- All skrivning sker via funktionerna nedan.
revoke insert, update, delete on work_reports, work_report_costs, work_report_billing, billing_rates, billing_extra_lines, billing_audit from authenticated, anon;
grant select on work_reports, work_report_costs, work_report_billing, billing_rates, billing_extra_lines, billing_audit, carrier_users to authenticated;

-- ============================================================
-- HJÄLPFUNKTIONER
-- ============================================================
create or replace function is_finance_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'aktiv' and role in ('admin', 'ekonomi'));
$$;

create or replace function work_report_is_invoiced(p_report_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from work_report_billing where report_id = p_report_id and invoiced_at is not null);
$$;

create or replace function parse_report_number(p_value jsonb, p_key text, p_max numeric)
returns numeric
language plpgsql
immutable
as $$
declare
  raw text := p_value ->> p_key;
  parsed numeric;
begin
  if raw is null or btrim(raw) = '' then return null; end if;
  parsed := raw::numeric;
  if parsed < 0 or parsed > p_max then
    raise exception 'Ogiltigt värde för %.', p_key;
  end if;
  return parsed;
end;
$$;

-- ============================================================
-- INTERN PERSONAL: SPARA / RADERA RAPPORT
-- ============================================================
create or replace function work_report_save(p_report jsonb)
returns work_reports
language plpgsql
security definer
set search_path = public
as $$
declare
  actor profiles;
  is_manager boolean;
  existing work_reports;
  saved work_reports;
  project_row projects;
  v_report_id uuid := nullif(p_report ->> 'id', '')::uuid;
  v_performer_type text := coalesce(nullif(p_report ->> 'performer_type', ''), 'employee');
  v_performer_profile uuid := nullif(p_report ->> 'performer_profile_id', '')::uuid;
  v_performer_supplier uuid := nullif(p_report ->> 'performer_supplier_id', '')::uuid;
  v_performer_name text;
  v_hours numeric;
  v_km numeric;
  v_wait numeric;
  v_date date := (p_report ->> 'report_date')::date;
  v_cost numeric;
  has_cost boolean := p_report ? 'internal_cost';
begin
  select * into actor from profiles where id = auth.uid() and status = 'aktiv';
  if actor.id is null then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
  is_manager := actor.role in ('admin', 'projektledare', 'ekonomi');

  if v_report_id is null then raise exception 'Rapporten saknar id.'; end if;
  select * into project_row from projects where id = (p_report ->> 'project_id')::uuid and org_id = actor.org_id;
  if project_row.id is null then raise exception 'Projektet hittades inte.' using errcode = '42501'; end if;
  if v_date is null or v_date > current_date + 1 or v_date < date '2020-01-01' then raise exception 'Ogiltigt datum.'; end if;
  if v_performer_type not in ('employee', 'carrier') then raise exception 'Ogiltig utförare.'; end if;

  v_hours := parse_report_number(p_report, 'hours', 999);
  v_km := parse_report_number(p_report, 'distance_km', 99999);
  v_wait := parse_report_number(p_report, 'waiting_hours', 999);
  if coalesce(v_hours, 0) <= 0 and coalesce(v_km, 0) <= 0 and coalesce(v_wait, 0) <= 0 then
    raise exception 'Ange minst tid, körsträcka eller väntetid.';
  end if;

  if nullif(p_report ->> 'task_id', '') is not null and not exists (
    select 1 from tasks where id = (p_report ->> 'task_id')::uuid and project_id = project_row.id
  ) then
    raise exception 'Arbetsordern tillhör inte projektet.';
  end if;

  -- Raden låses så att en samtidig faktureringsmarkering inte kan passera kontrollen nedan.
  select * into existing from work_reports where id = v_report_id for update;
  if existing.id is not null then
    if existing.org_id <> actor.org_id then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
    if existing.project_id <> project_row.id then raise exception 'Rapporten tillhör ett annat projekt och kan inte flyttas.'; end if;
    if not is_manager and existing.created_by <> actor.id then raise exception 'Du kan bara ändra egna rapporter.' using errcode = '42501'; end if;
    if work_report_is_invoiced(existing.id) then raise exception 'Rapporten är fakturerad och kan inte ändras.'; end if;
  end if;

  if v_performer_type = 'employee' then
    v_performer_profile := coalesce(v_performer_profile, actor.id);
    if not is_manager and v_performer_profile <> actor.id then
      raise exception 'Du kan bara rapportera eget arbete.' using errcode = '42501';
    end if;
    select p.full_name into v_performer_name from profiles p where p.id = v_performer_profile and p.org_id = actor.org_id and p.status = 'aktiv';
    if v_performer_name is null then raise exception 'Utföraren hittades inte.'; end if;
    v_performer_supplier := null;
  else
    if not is_manager then raise exception 'Endast ansvarig kan rapportera för extern transportör.' using errcode = '42501'; end if;
    select s.company_name into v_performer_name from suppliers s where s.id = v_performer_supplier and s.org_id = actor.org_id;
    if v_performer_name is null then raise exception 'Transportören hittades inte.'; end if;
    v_performer_profile := null;
  end if;

  insert into work_reports (
    id, org_id, project_id, task_id, report_date, performer_type, performer_profile_id, performer_supplier_id,
    performer_name, hours, distance_km, waiting_hours, work_type, billable, comment, created_by
  ) values (
    v_report_id, actor.org_id, project_row.id, nullif(p_report ->> 'task_id', '')::uuid, v_date, v_performer_type,
    v_performer_profile, v_performer_supplier, v_performer_name, v_hours, v_km, v_wait,
    coalesce(nullif(p_report ->> 'work_type', ''), 'transport'),
    coalesce((p_report ->> 'billable')::boolean, true), btrim(coalesce(p_report ->> 'comment', '')), actor.id
  )
  on conflict (id) do update set
    task_id = excluded.task_id,
    report_date = excluded.report_date,
    performer_type = excluded.performer_type,
    performer_profile_id = excluded.performer_profile_id,
    performer_supplier_id = excluded.performer_supplier_id,
    performer_name = excluded.performer_name,
    hours = excluded.hours,
    distance_km = excluded.distance_km,
    waiting_hours = excluded.waiting_hours,
    work_type = excluded.work_type,
    billable = excluded.billable,
    comment = excluded.comment,
    edited_by = actor.id,
    edited_at = now(),
    updated_at = now()
  returning * into saved;

  if has_cost and can_edit_finance() then
    v_cost := parse_report_number(p_report, 'internal_cost', 99999999);
    if v_cost is null then
      delete from work_report_costs c where c.report_id = saved.id;
    else
      insert into work_report_costs (report_id, org_id, internal_cost, updated_by)
      values (saved.id, saved.org_id, v_cost, actor.id)
      on conflict (report_id) do update set internal_cost = excluded.internal_cost, updated_by = actor.id, updated_at = now();
    end if;
  end if;
  return saved;
end;
$$;
revoke all on function work_report_save(jsonb) from public, anon;
grant execute on function work_report_save(jsonb) to authenticated;

create or replace function work_report_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor profiles;
  target work_reports;
begin
  select * into actor from profiles where id = auth.uid() and status = 'aktiv';
  if actor.id is null then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
  select * into target from work_reports where id = p_id and org_id = actor.org_id for update;
  if target.id is null then raise exception 'Rapporten hittades inte.'; end if;
  if actor.role not in ('admin', 'projektledare', 'ekonomi') and target.created_by <> actor.id then
    raise exception 'Du kan bara ta bort egna rapporter.' using errcode = '42501';
  end if;
  if work_report_is_invoiced(target.id) then raise exception 'Rapporten är fakturerad och kan inte tas bort.'; end if;
  delete from work_reports where id = target.id;
end;
$$;
revoke all on function work_report_delete(uuid) from public, anon;
grant execute on function work_report_delete(uuid) to authenticated;

-- ============================================================
-- EKONOMI: JUSTERA FAKTURERBART, PRISER, MARKERA FAKTURERAT
-- ============================================================
create or replace function work_report_adjust_billing(p_report_id uuid, p_patch jsonb)
returns work_report_billing
language plpgsql
security definer
set search_path = public
as $$
declare
  actor profiles;
  target work_reports;
  result work_report_billing;
begin
  select * into actor from profiles where id = auth.uid() and status = 'aktiv';
  if actor.id is null or not can_edit_finance() then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
  select * into target from work_reports where id = p_report_id and org_id = actor.org_id for update;
  if target.id is null then raise exception 'Rapporten hittades inte.'; end if;
  if work_report_is_invoiced(target.id) then raise exception 'Rapporten är fakturerad. Ta bort faktureringsmarkeringen först.'; end if;

  insert into work_report_billing (
    report_id, org_id, billable_hours, billable_distance_km, billable_waiting_hours,
    hours_rate, distance_rate, waiting_rate, adjust_reason, adjusted_by, adjusted_at
  ) values (
    target.id, target.org_id,
    parse_report_number(p_patch, 'billable_hours', 999), parse_report_number(p_patch, 'billable_distance_km', 99999),
    parse_report_number(p_patch, 'billable_waiting_hours', 999), parse_report_number(p_patch, 'hours_rate', 99999999),
    parse_report_number(p_patch, 'distance_rate', 99999999), parse_report_number(p_patch, 'waiting_rate', 99999999),
    nullif(btrim(coalesce(p_patch ->> 'adjust_reason', '')), ''), actor.id, now()
  )
  on conflict (report_id) do update set
    billable_hours = excluded.billable_hours,
    billable_distance_km = excluded.billable_distance_km,
    billable_waiting_hours = excluded.billable_waiting_hours,
    hours_rate = excluded.hours_rate,
    distance_rate = excluded.distance_rate,
    waiting_rate = excluded.waiting_rate,
    adjust_reason = excluded.adjust_reason,
    adjusted_by = actor.id,
    adjusted_at = now()
  returning * into result;
  return result;
end;
$$;
revoke all on function work_report_adjust_billing(uuid, jsonb) from public, anon;
grant execute on function work_report_adjust_billing(uuid, jsonb) to authenticated;

create or replace function billing_mark_invoiced(p_report_ids uuid[], p_extra_ids uuid[], p_reference text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor profiles;
  already text;
begin
  select * into actor from profiles where id = auth.uid() and status = 'aktiv';
  if actor.id is null or not can_edit_finance() then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
  if coalesce(btrim(p_reference), '') = '' then raise exception 'Ange fakturanummer eller referens.'; end if;
  if (select count(*) from work_reports where id = any (coalesce(p_report_ids, '{}')) and org_id = actor.org_id) <> coalesce(array_length(p_report_ids, 1), 0)
     or (select count(*) from billing_extra_lines where id = any (coalesce(p_extra_ids, '{}')) and org_id = actor.org_id) <> coalesce(array_length(p_extra_ids, 1), 0) then
    raise exception 'Någon av posterna hittades inte.';
  end if;

  -- Lås rapporterna/posterna så att två samtidiga faktureringar inte kan båda passera kontrollen (dubbeldebitering).
  perform 1 from work_reports where id = any (coalesce(p_report_ids, '{}')) and org_id = actor.org_id order by id for update;
  perform 1 from billing_extra_lines where id = any (coalesce(p_extra_ids, '{}')) and org_id = actor.org_id order by id for update;

  select string_agg(report_id::text, ', ') into already
  from work_report_billing where report_id = any (coalesce(p_report_ids, '{}')) and invoiced_at is not null;
  if already is not null then raise exception 'Redan fakturerat: %', already; end if;
  select string_agg(id::text, ', ') into already
  from billing_extra_lines where id = any (coalesce(p_extra_ids, '{}')) and invoiced_at is not null;
  if already is not null then raise exception 'Redan fakturerat: %', already; end if;

  insert into work_report_billing (report_id, org_id, invoiced_at, invoiced_by, invoice_reference)
  select r.id, r.org_id, now(), actor.id, btrim(p_reference)
  from work_reports r where r.id = any (coalesce(p_report_ids, '{}'))
  on conflict (report_id) do update set invoiced_at = now(), invoiced_by = actor.id, invoice_reference = btrim(p_reference);

  update billing_extra_lines set invoiced_at = now(), invoiced_by = actor.id, invoice_reference = btrim(p_reference)
  where id = any (coalesce(p_extra_ids, '{}'));
end;
$$;
revoke all on function billing_mark_invoiced(uuid[], uuid[], text) from public, anon;
grant execute on function billing_mark_invoiced(uuid[], uuid[], text) to authenticated;

create or replace function billing_clear_invoiced(p_report_ids uuid[], p_extra_ids uuid[], p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor profiles;
begin
  select * into actor from profiles where id = auth.uid() and status = 'aktiv';
  if actor.id is null or not is_finance_admin() then raise exception 'Endast admin eller ekonomi kan ta bort faktureringsmarkering.' using errcode = '42501'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Ange orsak.'; end if;
  perform set_config('app.audit_reason', btrim(p_reason), true);
  update work_report_billing set invoiced_at = null, invoiced_by = null, invoice_reference = null
  where report_id = any (coalesce(p_report_ids, '{}')) and org_id = actor.org_id and invoiced_at is not null;
  update billing_extra_lines set invoiced_at = null, invoiced_by = null, invoice_reference = null
  where id = any (coalesce(p_extra_ids, '{}')) and org_id = actor.org_id and invoiced_at is not null;
end;
$$;
revoke all on function billing_clear_invoiced(uuid[], uuid[], text) from public, anon;
grant execute on function billing_clear_invoiced(uuid[], uuid[], text) to authenticated;

create or replace function billing_rate_set(p_customer_id uuid, p_project_id uuid, p_rate_type text, p_price numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor profiles;
begin
  select * into actor from profiles where id = auth.uid() and status = 'aktiv';
  if actor.id is null or not can_edit_finance() then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
  if (p_customer_id is null) = (p_project_id is null) then raise exception 'Ange antingen kund eller projekt.'; end if;
  if p_rate_type not in ('hours', 'distance', 'waiting') then raise exception 'Ogiltig pristyp.'; end if;
  if p_customer_id is not null and not exists (select 1 from customers where id = p_customer_id and org_id = actor.org_id) then raise exception 'Kunden hittades inte.'; end if;
  if p_project_id is not null and not exists (select 1 from projects where id = p_project_id and org_id = actor.org_id) then raise exception 'Projektet hittades inte.'; end if;

  if p_price is null then
    delete from billing_rates where rate_type = p_rate_type and org_id = actor.org_id
      and customer_id is not distinct from p_customer_id and project_id is not distinct from p_project_id;
    return;
  end if;
  if p_price < 0 then raise exception 'Priset kan inte vara negativt.'; end if;
  if p_customer_id is not null then
    insert into billing_rates (org_id, customer_id, rate_type, unit_price) values (actor.org_id, p_customer_id, p_rate_type, p_price)
    on conflict (customer_id, rate_type) where customer_id is not null do update set unit_price = excluded.unit_price, updated_at = now();
  else
    insert into billing_rates (org_id, project_id, rate_type, unit_price) values (actor.org_id, p_project_id, p_rate_type, p_price)
    on conflict (project_id, rate_type) where project_id is not null do update set unit_price = excluded.unit_price, updated_at = now();
  end if;
end;
$$;
revoke all on function billing_rate_set(uuid, uuid, text, numeric) from public, anon;
grant execute on function billing_rate_set(uuid, uuid, text, numeric) to authenticated;

create or replace function billing_extra_line_save(p_line jsonb)
returns billing_extra_lines
language plpgsql
security definer
set search_path = public
as $$
declare
  actor profiles;
  existing billing_extra_lines;
  saved billing_extra_lines;
  line_id uuid := nullif(p_line ->> 'id', '')::uuid;
begin
  select * into actor from profiles where id = auth.uid() and status = 'aktiv';
  if actor.id is null or not can_edit_finance() then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
  if not exists (select 1 from projects where id = (p_line ->> 'project_id')::uuid and org_id = actor.org_id) then raise exception 'Projektet hittades inte.'; end if;
  select * into existing from billing_extra_lines where id = line_id for update;
  if existing.id is not null then
    if existing.org_id <> actor.org_id then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
    if existing.invoiced_at is not null then raise exception 'Posten är fakturerad och kan inte ändras.'; end if;
  end if;
  insert into billing_extra_lines (id, org_id, project_id, description, quantity, unit, unit_price, created_by)
  values (
    coalesce(line_id, gen_random_uuid()), actor.org_id, (p_line ->> 'project_id')::uuid, btrim(p_line ->> 'description'),
    (p_line ->> 'quantity')::numeric, coalesce(nullif(p_line ->> 'unit', ''), 'st'), (p_line ->> 'unit_price')::numeric, actor.id
  )
  on conflict (id) do update set description = excluded.description, quantity = excluded.quantity, unit = excluded.unit, unit_price = excluded.unit_price
  returning * into saved;
  return saved;
end;
$$;
revoke all on function billing_extra_line_save(jsonb) from public, anon;
grant execute on function billing_extra_line_save(jsonb) to authenticated;

create or replace function billing_extra_line_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor profiles;
  existing billing_extra_lines;
begin
  select * into actor from profiles where id = auth.uid() and status = 'aktiv';
  if actor.id is null or not can_edit_finance() then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
  select * into existing from billing_extra_lines where id = p_id and org_id = actor.org_id for update;
  if existing.id is null then raise exception 'Posten hittades inte.'; end if;
  if existing.invoiced_at is not null then raise exception 'Posten är fakturerad och kan inte tas bort.'; end if;
  delete from billing_extra_lines where id = existing.id;
end;
$$;
revoke all on function billing_extra_line_delete(uuid) from public, anon;
grant execute on function billing_extra_line_delete(uuid) to authenticated;

-- ============================================================
-- EXTERN TRANSPORTÖR: ENDAST TILLDELADE UPPDRAG OCH EGNA RAPPORTER
-- Transportörer har ingen direkt åtkomst till projekt-/ekonomitabellerna (ingen RLS-policy),
-- utan går uteslutande via funktionerna nedan som returnerar ett begränsat urval.
-- ============================================================
create or replace function carrier_is_assigned(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from carrier_users c
    join project_suppliers ps on ps.supplier_id = c.supplier_id
    join projects p on p.id = ps.project_id and p.org_id = c.org_id
    where c.id = auth.uid() and c.status = 'aktiv' and ps.project_id = p_project_id
      and p.status not in ('Avbokad', 'Fakturerad')
  );
$$;

create or replace function carrier_assignments()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  carrier carrier_users;
begin
  select * into carrier from carrier_users where id = auth.uid() and status = 'aktiv';
  if carrier.id is null then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id,
      'project_number', p.project_number,
      'name', p.name,
      'status', p.status,
      'planned_loading_date', p.planned_loading_date,
      'planned_loading_time', p.planned_loading_time,
      'planned_delivery_date', p.planned_delivery_date,
      'planned_delivery_time', p.planned_delivery_time,
      'special_requirements', p.special_requirements,
      'carrier_order_number', p.carrier_order_number,
      'locations', coalesce((
        select jsonb_agg(jsonb_build_object(
          'type', l.type, 'name', l.name, 'address', l.address, 'company_name', l.company_name,
          'contact_name', l.contact_name, 'contact_phone', l.contact_phone
        ) order by l.order_index) from locations l where l.project_id = p.id
      ), '[]'::jsonb),
      'cargo', coalesce((
        select jsonb_agg(jsonb_build_object(
          'description', c.description, 'length_m', c.length_m, 'width_m', c.width_m,
          'height_m', c.height_m, 'weight_ton', c.weight_ton, 'quantity', c.quantity
        )) from cargo_items c where c.project_id = p.id
      ), '[]'::jsonb)
    ) order by p.planned_loading_date desc nulls last, p.project_number desc)
    from projects p
    join project_suppliers ps on ps.project_id = p.id
    where ps.supplier_id = carrier.supplier_id and p.org_id = carrier.org_id
      and p.status not in ('Avbokad', 'Fakturerad')
  ), '[]'::jsonb);
end;
$$;
revoke all on function carrier_assignments() from public, anon;
grant execute on function carrier_assignments() to authenticated;

create or replace function carrier_work_reports(p_project_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  carrier carrier_users;
begin
  select * into carrier from carrier_users where id = auth.uid() and status = 'aktiv';
  if carrier.id is null then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'project_id', r.project_id, 'task_id', r.task_id, 'report_date', r.report_date,
      'hours', r.hours, 'distance_km', r.distance_km, 'waiting_hours', r.waiting_hours,
      'work_type', r.work_type, 'comment', r.comment, 'created_at', r.created_at,
      'locked', coalesce(b.invoiced_at is not null or b.adjusted_at is not null, false)
    ) order by r.report_date desc, r.created_at desc)
    from work_reports r
    left join work_report_billing b on b.report_id = r.id
    where r.performer_carrier_user_id = carrier.id and (p_project_id is null or r.project_id = p_project_id)
  ), '[]'::jsonb);
end;
$$;
revoke all on function carrier_work_reports(uuid) from public, anon;
grant execute on function carrier_work_reports(uuid) to authenticated;

create or replace function carrier_work_report_save(p_report jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  carrier carrier_users;
  existing work_reports;
  billing work_report_billing;
  v_report_id uuid := nullif(p_report ->> 'id', '')::uuid;
  v_project_id uuid := nullif(p_report ->> 'project_id', '')::uuid;
  v_hours numeric;
  v_km numeric;
  v_wait numeric;
  v_date date := (p_report ->> 'report_date')::date;
  saved work_reports;
begin
  select * into carrier from carrier_users where id = auth.uid() and status = 'aktiv';
  if carrier.id is null then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
  if v_report_id is null then raise exception 'Rapporten saknar id.'; end if;
  if not carrier_is_assigned(v_project_id) then raise exception 'Uppdraget är inte tilldelat dig.' using errcode = '42501'; end if;
  if v_date is null or v_date > current_date + 1 or v_date < date '2020-01-01' then raise exception 'Ogiltigt datum.'; end if;

  v_hours := parse_report_number(p_report, 'hours', 999);
  v_km := parse_report_number(p_report, 'distance_km', 99999);
  v_wait := parse_report_number(p_report, 'waiting_hours', 999);
  if coalesce(v_hours, 0) <= 0 and coalesce(v_km, 0) <= 0 and coalesce(v_wait, 0) <= 0 then
    raise exception 'Ange minst tid, körsträcka eller väntetid.';
  end if;

  select * into existing from work_reports where id = v_report_id for update;
  if existing.id is not null then
    if existing.performer_carrier_user_id is distinct from carrier.id then raise exception 'Du kan bara ändra egna rapporter.' using errcode = '42501'; end if;
    if existing.project_id <> v_project_id then raise exception 'Rapporten tillhör ett annat uppdrag.' using errcode = '42501'; end if;
    select * into billing from work_report_billing b where b.report_id = existing.id;
    if billing.report_id is not null and (billing.invoiced_at is not null or billing.adjusted_at is not null) then
      raise exception 'Rapporten är behandlad av JK och kan inte ändras. Kontakta JK.';
    end if;
  end if;

  insert into work_reports (
    id, org_id, project_id, report_date, performer_type, performer_carrier_user_id, performer_supplier_id,
    performer_name, hours, distance_km, waiting_hours, work_type, billable, comment, created_by
  ) values (
    v_report_id, carrier.org_id, v_project_id, v_date, 'carrier', carrier.id, carrier.supplier_id,
    carrier.full_name, v_hours, v_km, v_wait, coalesce(nullif(p_report ->> 'work_type', ''), 'transport'), true,
    btrim(coalesce(p_report ->> 'comment', '')), carrier.id
  )
  on conflict (id) do update set
    report_date = excluded.report_date,
    hours = excluded.hours,
    distance_km = excluded.distance_km,
    waiting_hours = excluded.waiting_hours,
    work_type = excluded.work_type,
    comment = excluded.comment,
    edited_by = carrier.id,
    edited_at = now(),
    updated_at = now()
  returning * into saved;
  return jsonb_build_object('id', saved.id);
end;
$$;
revoke all on function carrier_work_report_save(jsonb) from public, anon;
grant execute on function carrier_work_report_save(jsonb) to authenticated;

create or replace function carrier_work_report_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  carrier carrier_users;
  existing work_reports;
  billing work_report_billing;
begin
  select * into carrier from carrier_users where id = auth.uid() and status = 'aktiv';
  if carrier.id is null then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
  select * into existing from work_reports where id = p_id and performer_carrier_user_id = carrier.id for update;
  if existing.id is null then raise exception 'Rapporten hittades inte.'; end if;
  select * into billing from work_report_billing b where b.report_id = existing.id;
  if billing.report_id is not null and (billing.invoiced_at is not null or billing.adjusted_at is not null) then
    raise exception 'Rapporten är behandlad av JK och kan inte tas bort. Kontakta JK.';
  end if;
  delete from work_reports where id = existing.id;
end;
$$;
revoke all on function carrier_work_report_delete(uuid) from public, anon;
grant execute on function carrier_work_report_delete(uuid) to authenticated;

notify pgrst, 'reload schema';
