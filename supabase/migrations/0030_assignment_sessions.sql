-- Uppdrag på stämpelklockan: man startar ett uppdrag (projekt) under arbetsdagen, kan stämpla väntetid på det och
-- avslutar det med en färdigifylld rapport (timmar från klockan, väntetid, sträcka läggs in).
--
-- Detta är UNDERLAG FÖR RAPPORTERING. Det påverkar aldrig lönegrundande närvarotid (attendance_*): väntetid är
-- arbetad tid och ligger redan inom stämplingen. Flera uppdrag får pågå samtidigt, och fakturerbar tid kan därför bli
-- högre än arbetad tid. Det är avsiktligt och spärras inte.

create table if not exists assignment_sessions (
  id uuid primary key,
  org_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  task_id uuid references tasks (id) on delete set null,
  started_at timestamptz not null,
  ended_at timestamptz,
  waiting_started_at timestamptz,
  waiting_minutes integer not null default 0 check (waiting_minutes >= 0),
  report_id uuid references work_reports (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at)
);
create index if not exists idx_assignment_sessions_open on assignment_sessions (user_id) where ended_at is null;
create index if not exists idx_assignment_sessions_project on assignment_sessions (project_id);

alter table assignment_sessions enable row level security;
drop policy if exists "own or staff read sessions" on assignment_sessions;
create policy "own or staff read sessions" on assignment_sessions for select
  using (org_id = current_org_id() and (user_id = auth.uid() or can_view_payroll()));
revoke insert, update, delete on assignment_sessions from authenticated, anon;
grant select on assignment_sessions to authenticated;

create or replace function session_start(p_id uuid, p_project_id uuid, p_task_id uuid default null, p_started timestamptz default null)
returns assignment_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  actor profiles;
  project_row projects;
  existing assignment_sessions;
  saved assignment_sessions;
  v_started timestamptz := coalesce(p_started, now());
begin
  select * into actor from profiles where id = auth.uid() and status = 'aktiv';
  if actor.id is null then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
  if p_id is null then raise exception 'Ogiltigt uppdrag.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('assignment-session:' || actor.id::text, 0));

  select * into existing from assignment_sessions where id = p_id;
  if existing.id is not null then
    if existing.user_id <> actor.id then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
    return existing; -- idempotent omförsök
  end if;

  select * into project_row from projects where id = p_project_id and org_id = actor.org_id;
  if project_row.id is null then raise exception 'Projektet hittades inte.' using errcode = '42501'; end if;
  if project_row.status in ('Avbokad', 'Fakturerad') then raise exception 'Projektet är % och kan inte få nya uppdrag.', lower(project_row.status); end if;
  if p_task_id is not null and not exists (select 1 from tasks where id = p_task_id and project_id = project_row.id) then
    raise exception 'Arbetsordern tillhör inte projektet.';
  end if;
  -- Tiden får inte backdateras eller ligga i framtiden (samma regel som stämpelklockan).
  if v_started > now() + interval '5 minutes' or v_started < now() - interval '15 minutes' then raise exception 'Ogiltig starttid.'; end if;
  if exists (select 1 from assignment_sessions where user_id = actor.id and project_id = project_row.id and ended_at is null) then
    raise exception 'Uppdraget pågår redan.';
  end if;
  if (select count(*) from assignment_sessions where user_id = actor.id and ended_at is null) >= 5 then
    raise exception 'Du har redan fem pågående uppdrag. Avsluta något först.';
  end if;

  insert into assignment_sessions (id, org_id, user_id, project_id, task_id, started_at)
  values (p_id, actor.org_id, actor.id, project_row.id, p_task_id, v_started)
  returning * into saved;
  return saved;
end;
$$;
revoke all on function session_start(uuid, uuid, uuid, timestamptz) from public, anon;
grant execute on function session_start(uuid, uuid, uuid, timestamptz) to authenticated;

-- Väntetid på/av. Löper tills den stängs; stängs automatiskt när uppdraget avslutas.
create or replace function session_wait(p_id uuid, p_on boolean)
returns assignment_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  actor profiles;
  target assignment_sessions;
  saved assignment_sessions;
begin
  select * into actor from profiles where id = auth.uid() and status = 'aktiv';
  if actor.id is null then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
  select * into target from assignment_sessions where id = p_id and user_id = actor.id for update;
  if target.id is null then raise exception 'Uppdraget hittades inte.'; end if;
  if target.ended_at is not null then raise exception 'Uppdraget är redan avslutat.'; end if;
  if coalesce(p_on, false) and target.waiting_started_at is null then
    update assignment_sessions set waiting_started_at = now() where id = target.id returning * into saved;
  elsif not coalesce(p_on, false) and target.waiting_started_at is not null then
    update assignment_sessions
    set waiting_minutes = waiting_minutes + greatest(floor(extract(epoch from (now() - waiting_started_at)) / 60)::int, 0), waiting_started_at = null
    where id = target.id returning * into saved;
  else
    saved := target; -- redan i önskat läge
  end if;
  return saved;
end;
$$;
revoke all on function session_wait(uuid, boolean) from public, anon;
grant execute on function session_wait(uuid, boolean) to authenticated;

-- Avslutar uppdraget och sparar rapporten i samma transaktion. Projektet i rapporten styrs av uppdraget.
create or replace function session_finish(p_id uuid, p_ended timestamptz, p_report jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor profiles;
  target assignment_sessions;
  v_end timestamptz;
  v_wait integer;
  saved work_reports;
begin
  select * into actor from profiles where id = auth.uid() and status = 'aktiv';
  if actor.id is null then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
  select * into target from assignment_sessions where id = p_id and user_id = actor.id for update;
  if target.id is null then raise exception 'Uppdraget hittades inte.'; end if;
  if target.ended_at is not null then
    if target.report_id is not null then return jsonb_build_object('session_id', target.id, 'report_id', target.report_id); end if;
    raise exception 'Uppdraget är redan avslutat.';
  end if;
  if p_report is null or jsonb_typeof(p_report) <> 'object' then raise exception 'Ogiltig rapport.'; end if;

  v_end := least(coalesce(p_ended, now()), now() + interval '5 minutes');
  if v_end < target.started_at then v_end := target.started_at; end if;
  v_wait := target.waiting_minutes;
  if target.waiting_started_at is not null then
    v_wait := v_wait + greatest(floor(extract(epoch from (v_end - target.waiting_started_at)) / 60)::int, 0);
  end if;

  select * into saved from work_report_save(
    p_report || jsonb_build_object('project_id', target.project_id, 'performer_type', 'employee', 'performer_profile_id', actor.id)
      || case when target.task_id is not null and not (p_report ? 'task_id') then jsonb_build_object('task_id', target.task_id) else '{}'::jsonb end
  );
  update assignment_sessions set ended_at = v_end, waiting_started_at = null, waiting_minutes = v_wait, report_id = saved.id where id = target.id;
  return jsonb_build_object('session_id', target.id, 'report_id', saved.id);
end;
$$;
revoke all on function session_finish(uuid, timestamptz, jsonb) from public, anon;
grant execute on function session_finish(uuid, timestamptz, jsonb) to authenticated;

-- Avbryter ett pågående uppdrag utan rapport (t.ex. felstartat).
create or replace function session_cancel(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor profiles;
  target assignment_sessions;
begin
  select * into actor from profiles where id = auth.uid() and status = 'aktiv';
  if actor.id is null then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
  select * into target from assignment_sessions where id = p_id and user_id = actor.id for update;
  if target.id is null then return; end if;
  if target.ended_at is not null then raise exception 'Uppdraget är redan avslutat och har en rapport.'; end if;
  delete from assignment_sessions where id = target.id;
end;
$$;
revoke all on function session_cancel(uuid) from public, anon;
grant execute on function session_cancel(uuid) to authenticated;

notify pgrst, 'reload schema';
