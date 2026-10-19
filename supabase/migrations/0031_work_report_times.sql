-- Start- och sluttid på rapporterat arbete. Timmar kan fortfarande anges direkt; start/slut är ett hjälpmedel som
-- sparas tillsammans med rapporten (klockslag svensk tid på rapportdatumet, slut före start = över midnatt).
-- Fakturerbar tid begränsas inte av start/slut (flera uppdrag kan pågå samtidigt).

alter table work_reports add column if not exists report_start time;
alter table work_reports add column if not exists report_end time;
alter table work_reports drop constraint if exists work_reports_times_both_or_none;
alter table work_reports add constraint work_reports_times_both_or_none check ((report_start is null) = (report_end is null));

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
  v_start time := nullif(p_report ->> 'report_start', '')::time;
  v_end time := nullif(p_report ->> 'report_end', '')::time;
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
  if (v_start is null) <> (v_end is null) then raise exception 'Ange både start- och sluttid, eller ingen av dem.'; end if;
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
    performer_name, hours, distance_km, waiting_hours, work_type, billable, comment, created_by, report_start, report_end
  ) values (
    v_report_id, actor.org_id, project_row.id, nullif(p_report ->> 'task_id', '')::uuid, v_date, v_performer_type,
    v_performer_profile, v_performer_supplier, v_performer_name, v_hours, v_km, v_wait,
    coalesce(nullif(p_report ->> 'work_type', ''), 'transport'),
    coalesce((p_report ->> 'billable')::boolean, true), btrim(coalesce(p_report ->> 'comment', '')), actor.id, v_start, v_end
  )
  on conflict (id) do update set
    report_start = excluded.report_start,
    report_end = excluded.report_end,
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
  v_start time := nullif(p_report ->> 'report_start', '')::time;
  v_end time := nullif(p_report ->> 'report_end', '')::time;
  saved work_reports;
begin
  select * into carrier from carrier_users where id = auth.uid() and status = 'aktiv';
  if carrier.id is null then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
  if v_report_id is null then raise exception 'Rapporten saknar id.'; end if;
  if not carrier_is_assigned(v_project_id) then raise exception 'Uppdraget är inte tilldelat dig.' using errcode = '42501'; end if;
  if v_date is null or v_date > current_date + 1 or v_date < date '2020-01-01' then raise exception 'Ogiltigt datum.'; end if;

  if (v_start is null) <> (v_end is null) then raise exception 'Ange både start- och sluttid, eller ingen av dem.'; end if;
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
    performer_name, hours, distance_km, waiting_hours, work_type, billable, comment, created_by, report_start, report_end
  ) values (
    v_report_id, carrier.org_id, v_project_id, v_date, 'carrier', carrier.id, carrier.supplier_id,
    carrier.full_name, v_hours, v_km, v_wait, coalesce(nullif(p_report ->> 'work_type', ''), 'transport'), true,
    btrim(coalesce(p_report ->> 'comment', '')), carrier.id, v_start, v_end
  )
  on conflict (id) do update set
    report_start = excluded.report_start,
    report_end = excluded.report_end,
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
      'report_start', r.report_start, 'report_end', r.report_end, 'hours', r.hours, 'distance_km', r.distance_km, 'waiting_hours', r.waiting_hours,
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

notify pgrst, 'reload schema';
