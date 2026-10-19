-- Skärpt löneattest: servern bygger på färska, bundna indata och kontrollerar klientens beräkning.
--
-- Problem i 0028: payroll_statement_attest tog emot färdiga summor från klienten och kontrollerade bara
-- formen. Gammal klientdata, ett buggigt klientbygge eller ett manipulerat anrop kunde ge ett felaktigt
-- löneunderlag. Lösning (en enda beräkningsmotor, ingen kopia av reglerna i SQL):
--   1. Klienten hämtar indata via payroll_inputs() (entries, frånvaro, scheman, regelmallar + fingeravtryck).
--   2. Klienten räknar med samma TypeScript-motor som visas i gränssnittet.
--   3. Servern kontrollerar fingeravtrycket mot aktuell data (stämplingar kan inte ha ändrats), räknar själv ut
--      arbetad tid, rast och frånvaro per dag och kräver exakt överensstämmelse, kontrollerar invarianter för
--      ordinarie tid/övertid och att varje dag har ett gällande schema och en GODKÄND regelmall.
--   4. Servern sparar sin egen regelkopia (inte klientens).
-- Fördelningen ordinarie/övertid inom den verifierade arbetstiden förblir klientberäknad men är begränsad av
-- invarianterna (summa = arbetad tid, ordinarie <= schema minus frånvaro, kända övertidsnycklar).

-- ============================================================
-- REGELMALLAR: validering och godkännande
-- ============================================================
alter table overtime_rule_sets add column if not exists approved_at timestamptz;
alter table overtime_rule_sets add column if not exists approved_by uuid;
alter table overtime_rule_sets add column if not exists approval_note text;

create or replace function valid_rule_config(p_config jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  tier jsonb;
  previous numeric := 0;
  idx integer := 0;
  total integer;
  seen text[] := '{}';
begin
  if p_config is null or jsonb_typeof(p_config) <> 'object' or coalesce(p_config ->> 'version', '') <> '1' then return false; end if;
  if p_config ? 'dayBucketing' and (p_config ->> 'dayBucketing') not in ('start_day', 'split_midnight') then return false; end if;
  if p_config ? 'tierScope' and (p_config ->> 'tierScope') not in ('day', 'week') then return false; end if;
  if jsonb_typeof(p_config -> 'tiers') <> 'array' or jsonb_array_length(p_config -> 'tiers') = 0 then return false; end if;
  total := jsonb_array_length(p_config -> 'tiers');
  for tier in select * from jsonb_array_elements(p_config -> 'tiers') loop
    idx := idx + 1;
    if jsonb_typeof(tier) <> 'object' or coalesce(btrim(tier ->> 'key'), '') = '' then return false; end if;
    if (tier ->> 'key') = any (seen) then return false; end if;
    seen := seen || (tier ->> 'key');
    if tier ? 'upToMinutes' and jsonb_typeof(tier -> 'upToMinutes') = 'number' then
      if (tier ->> 'upToMinutes')::numeric <= previous or (tier ->> 'upToMinutes')::numeric > 100000 then return false; end if;
      previous := (tier ->> 'upToMinutes')::numeric;
    elsif idx < total then
      return false;
    end if;
  end loop;
  if p_config ? 'weeklyOrdinaryLimitMinutes' and jsonb_typeof(p_config -> 'weeklyOrdinaryLimitMinutes') = 'number'
     and (p_config ->> 'weeklyOrdinaryLimitMinutes')::numeric <= 0 then return false; end if;
  return true;
end;
$$;

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
  if coalesce(btrim(p_name), '') = '' then raise exception 'Ange namn på regelmallen.'; end if;
  if not valid_rule_config(p_config) then raise exception 'Ogiltig regelkonfiguration (version, minst en övertidsnivå, stigande gränser).'; end if;
  insert into overtime_rule_sets (id, org_id, name, config, active)
  values (coalesce(p_id, gen_random_uuid()), actor.org_id, btrim(p_name), p_config, coalesce(p_active, true))
  on conflict (id) do update set
    name = excluded.name, config = excluded.config, active = excluded.active, updated_at = now(),
    -- Ändrade regler måste godkännas på nytt.
    approved_at = case when overtime_rule_sets.config is distinct from excluded.config then null else overtime_rule_sets.approved_at end,
    approved_by = case when overtime_rule_sets.config is distinct from excluded.config then null else overtime_rule_sets.approved_by end,
    approval_note = case when overtime_rule_sets.config is distinct from excluded.config then null else overtime_rule_sets.approval_note end
  where overtime_rule_sets.org_id = actor.org_id
  returning * into saved;
  if saved.id is null then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
  insert into payroll_log (org_id, action, details, actor) values (actor.org_id, 'rule_set_saved', to_jsonb(saved), actor.id);
  return saved;
end;
$$;
revoke all on function overtime_rule_set_save(uuid, text, jsonb, boolean) from public, anon;
grant execute on function overtime_rule_set_save(uuid, text, jsonb, boolean) to authenticated;

-- Endast admin kan intyga att regelmallen motsvarar JK:s bekräftade avtal/regler.
create or replace function overtime_rule_set_approve(p_id uuid, p_note text)
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
  if actor.id is null or actor.role <> 'admin' then raise exception 'Endast admin kan godkänna en regelmall.' using errcode = '42501'; end if;
  if coalesce(btrim(p_note), '') = '' then raise exception 'Ange vad godkännandet grundar sig på (t.ex. avtal och datum).'; end if;
  update overtime_rule_sets set approved_at = now(), approved_by = actor.id, approval_note = btrim(p_note), updated_at = now()
  where id = p_id and org_id = actor.org_id and valid_rule_config(config)
  returning * into saved;
  if saved.id is null then raise exception 'Regelmallen hittades inte eller är ogiltig.'; end if;
  insert into payroll_log (org_id, action, reason, details, actor) values (actor.org_id, 'rule_set_approved', btrim(p_note), jsonb_build_object('rule_set_id', saved.id), actor.id);
  return saved;
end;
$$;
revoke all on function overtime_rule_set_approve(uuid, text) from public, anon;
grant execute on function overtime_rule_set_approve(uuid, text) to authenticated;

alter table payroll_statements add column if not exists input_fingerprint text;

-- ============================================================
-- INDATA OCH FINGERAVTRYCK
-- ============================================================
create or replace function payroll_input_payload(p_period_id uuid, p_user_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with period as (select * from payroll_periods where id = p_period_id),
  entries as (
    select coalesce(jsonb_agg(to_jsonb(e) order by e.id), '[]'::jsonb) as j
    from attendance_entries e, period p
    where e.user_id = p_user_id and sthlm_date(e.start_time) between p.start_date - 7 and p.end_date + 1
  ),
  absences as (
    select coalesce(jsonb_agg(to_jsonb(a) order by a.id), '[]'::jsonb) as j
    from attendance_absences a, period p
    where a.user_id = p_user_id and a.absence_date between p.start_date - 7 and p.end_date
  ),
  terms as (
    select coalesce(jsonb_agg(to_jsonb(t) order by t.valid_from), '[]'::jsonb) as j from employee_terms t where t.user_id = p_user_id
  ),
  rules as (
    select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]'::jsonb) as j from overtime_rule_sets r
    where r.id in (select rule_set_id from employee_terms where user_id = p_user_id and rule_set_id is not null)
  )
  select jsonb_build_object('entries', entries.j, 'absences', absences.j, 'terms', terms.j, 'ruleSets', rules.j)
  from entries, absences, terms, rules;
$$;
revoke all on function payroll_input_payload(uuid, uuid) from public, anon, authenticated;

-- Klientens enda källa för löneberäkning vid attest/rättelse: färska rader plus fingeravtryck.
create or replace function payroll_inputs(p_period_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  actor profiles;
  period payroll_periods;
  payload jsonb;
begin
  select * into actor from profiles where id = auth.uid() and status = 'aktiv';
  if actor.id is null then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
  select * into period from payroll_periods where id = p_period_id and org_id = actor.org_id;
  if period.id is null then raise exception 'Löneperioden hittades inte.'; end if;
  if p_user_id <> actor.id and actor.role not in ('admin', 'projektledare', 'ekonomi') then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
  if not exists (select 1 from profiles where id = p_user_id and org_id = actor.org_id) then raise exception 'Personen hittades inte.'; end if;
  payload := payroll_input_payload(p_period_id, p_user_id);
  return payload || jsonb_build_object('fingerprint', md5(payload::text));
end;
$$;
revoke all on function payroll_inputs(uuid, uuid) from public, anon;
grant execute on function payroll_inputs(uuid, uuid) to authenticated;

-- ============================================================
-- VERIFIERING AV KLIENTENS BERÄKNING
-- ============================================================
create or replace function jsonb_nonzero(p_obj jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from jsonb_each(coalesce(case when jsonb_typeof(p_obj) = 'object' then p_obj end, '{}'::jsonb))
  where jsonb_typeof(value) = 'number' and (value #>> '{}')::numeric <> 0;
$$;

create or replace function jsonb_sum_objects(p_objs jsonb[])
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_object_agg(key, total), '{}'::jsonb)
  from (
    select key, sum((value #>> '{}')::numeric) as total
    from unnest(p_objs) o, jsonb_each(coalesce(o, '{}'::jsonb))
    group by key
  ) s
  where total <> 0;
$$;

create or replace function payroll_verify_computation(p_period payroll_periods, p_user uuid, p_totals jsonb, p_days jsonb, p_fingerprint text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  payload jsonb := payroll_input_payload(p_period.id, p_user);
  terms employee_terms;
  rule_row overtime_rule_sets;
  rules jsonb;
  bucketing text;
  weekday_key text;
  day_el jsonb;
  d date;
  seen date[] := '{}';
  sql_work integer;
  sql_break integer;
  deduction integer;
  expected_absence jsonb;
  absence_sum numeric;
  overtime_sum numeric;
  scheduled numeric;
  ordinary numeric;
  worked numeric;
  v_key text;
  allowed_keys text[];
  used_rules jsonb := '[]'::jsonb;
  used_terms jsonb := '[]'::jsonb;
  sum_worked numeric := 0; sum_break numeric := 0; sum_ordinary numeric := 0; sum_scheduled numeric := 0; sum_days integer := 0;
  sum_overtime jsonb[] := '{}'; sum_absence jsonb[] := '{}';
  all_data_days date[];
  sql_days jsonb;
begin
  if p_fingerprint is null or md5(payload::text) <> p_fingerprint then
    raise exception 'Underlaget har ändrats sedan beräkningen gjordes (stämplingar, frånvaro eller inställningar). Ladda om och försök igen.' using errcode = '40001';
  end if;
  if p_totals is null or jsonb_typeof(p_totals) <> 'object' or p_days is null or jsonb_typeof(p_days) <> 'array' then raise exception 'Ogiltigt löneunderlag.'; end if;
  if jsonb_array_length(coalesce(p_totals -> 'openEntryIds', '[]'::jsonb)) > 0 then raise exception 'Underlaget innehåller pågående stämplingar.'; end if;

  -- Dagtyp-oberoende bucketing gäller hela perioden (samma val som klientmotorn).
  select * into terms from employee_terms where user_id = p_user and valid_from <= p_period.end_date order by valid_from desc limit 1;
  if terms.id is null then select * into terms from employee_terms where user_id = p_user and valid_from <= p_period.start_date order by valid_from desc limit 1; end if;
  select * into rule_row from overtime_rule_sets where id = terms.rule_set_id;
  bucketing := coalesce(rule_row.config ->> 'dayBucketing', 'start_day');

  -- Serverns egen dagsummering av stämplad tid (dag -> {work, brk}).
  if bucketing = 'split_midnight' then
    select coalesce(jsonb_object_agg(x.day::text, jsonb_build_object('work', x.work, 'brk', x.brk)), '{}'::jsonb) into sql_days
    from (
      select s.day, sum(case when s.entry_type = 'work' then s.minutes else 0 end)::int as work, sum(case when s.entry_type <> 'work' then s.minutes else 0 end)::int as brk
      from (
        select g.day::date as day, e.entry_type,
               floor(extract(epoch from (least(e.end_time, ((g.day::date + 1)::timestamp at time zone 'Europe/Stockholm'))
                                         - greatest(e.start_time, (g.day::date::timestamp at time zone 'Europe/Stockholm')))) / 60)::int as minutes
        from attendance_entries e
        cross join lateral generate_series(sthlm_date(e.start_time)::timestamp, sthlm_date(e.end_time)::timestamp, interval '1 day') g(day)
        where e.user_id = p_user and e.end_time is not null
          and sthlm_date(e.start_time) between p_period.start_date - 7 and p_period.end_date + 1
      ) s
      where s.minutes > 0 and s.day between p_period.start_date and p_period.end_date
      group by s.day
    ) x;
  else
    select coalesce(jsonb_object_agg(x.day::text, jsonb_build_object('work', x.work, 'brk', x.brk)), '{}'::jsonb) into sql_days
    from (
      select sthlm_date(e.start_time) as day,
             sum(case when e.entry_type = 'work' then e.total_minutes else 0 end)::int as work,
             sum(case when e.entry_type <> 'work' then e.total_minutes else 0 end)::int as brk
      from attendance_entries e
      where e.user_id = p_user and e.end_time is not null and e.total_minutes > 0
        and sthlm_date(e.start_time) between p_period.start_date and p_period.end_date
      group by sthlm_date(e.start_time)
    ) x;
  end if;

  select coalesce(array_agg(distinct dd), '{}') into all_data_days from (
    select k::date as dd from jsonb_object_keys(sql_days) k
    union select absence_date from attendance_absences where user_id = p_user and absence_date between p_period.start_date and p_period.end_date and minutes > 0
  ) x;

  for day_el in select * from jsonb_array_elements(p_days) loop
    d := (day_el ->> 'date')::date;
    if d < p_period.start_date or d > p_period.end_date then raise exception 'Dag % ligger utanför perioden.', d; end if;
    if d = any (seen) then raise exception 'Dag % förekommer flera gånger.', d; end if;
    seen := seen || d;

    sql_work := coalesce((sql_days -> d::text ->> 'work')::int, 0);
    sql_break := coalesce((sql_days -> d::text ->> 'brk')::int, 0);
    select coalesce(jsonb_object_agg(kind, m), '{}'::jsonb) into expected_absence
    from (select kind, sum(minutes) as m from attendance_absences where user_id = p_user and absence_date = d group by kind) a;

    if not (day_el ? 'workedMinutes' and day_el ? 'ordinaryMinutes' and day_el ? 'breakMinutes') then raise exception 'Ogiltigt löneunderlag (dag % saknar värden).', d; end if;
    worked := (day_el ->> 'workedMinutes')::numeric;
    ordinary := (day_el ->> 'ordinaryMinutes')::numeric;
    scheduled := coalesce((day_el ->> 'scheduledMinutes')::numeric, 0);
    absence_sum := coalesce((select sum((value #>> '{}')::numeric) from jsonb_each(coalesce(day_el -> 'absence', '{}'::jsonb))), 0);
    overtime_sum := coalesce((select sum((value #>> '{}')::numeric) from jsonb_each(coalesce(day_el -> 'overtime', '{}'::jsonb))), 0);

    select * into terms from employee_terms where user_id = p_user and valid_from <= d order by valid_from desc limit 1;
    if terms.id is null then
      if sql_work > 0 or sql_break > 0 or expected_absence <> '{}'::jsonb then raise exception 'Schema och regler saknas för %. Ställ in dem under Inställningar → Lön.', d; end if;
    else
      select * into rule_row from overtime_rule_sets where id = terms.rule_set_id;
      if rule_row.id is null then
        if sql_work > 0 or expected_absence <> '{}'::jsonb then raise exception 'Regelmall saknas för %.', d; end if;
      else
        if (sql_work > 0 or expected_absence <> '{}'::jsonb) and rule_row.approved_at is null then
          raise exception 'Regelmallen "%" är inte godkänd av admin. Löneunderlag kan inte attesteras förrän reglerna bekräftats.', rule_row.name;
        end if;
        if not valid_rule_config(rule_row.config) then raise exception 'Regelmallen "%" är ogiltig.', rule_row.name; end if;
        rules := rule_row.config;
        if not used_rules @> jsonb_build_array(to_jsonb(rule_row)) then used_rules := used_rules || to_jsonb(rule_row); end if;
        if not used_terms @> jsonb_build_array(to_jsonb(terms)) then used_terms := used_terms || to_jsonb(terms); end if;
        deduction := 0;
        if coalesce((rules #>> '{autoBreak,enabled}')::boolean, false) and sql_work >= coalesce((rules #>> '{autoBreak,afterMinutes}')::numeric, 300)
           and (not coalesce((rules #>> '{autoBreak,onlyIfNoBreakRegistered}')::boolean, true) or sql_break = 0) then
          deduction := least(coalesce((rules #>> '{autoBreak,deductMinutes}')::numeric, 30)::int, sql_work);
        end if;
        sql_work := sql_work - deduction;
        weekday_key := (array['mon','tue','wed','thu','fri','sat','sun'])[extract(isodow from d)::int];
        if ordinary > greatest(coalesce((terms.schedule ->> weekday_key)::numeric, 0) - absence_sum, 0) then
          raise exception 'Ordinarie tid % min för % överstiger schemat.', ordinary, d;
        end if;
        if scheduled > coalesce((terms.schedule ->> weekday_key)::numeric, 0) then raise exception 'Schematid för % stämmer inte med schemat.', d; end if;
        allowed_keys := array(select t ->> 'key' from jsonb_array_elements(rules -> 'tiers') t)
          || array(select value #>> '{}' from jsonb_each(coalesce(rules -> 'dayTypeTierKey', '{}'::jsonb)) where jsonb_typeof(value) = 'string');
        for v_key in select jsonb_object_keys(coalesce(day_el -> 'overtime', '{}'::jsonb)) loop
          if not v_key = any (allowed_keys) then raise exception 'Okänd övertidstyp "%" för %.', v_key, d; end if;
        end loop;
      end if;
    end if;

    if worked is distinct from sql_work then raise exception 'Arbetad tid för % stämmer inte med stämplingarna (klient % min, server % min).', d, worked, sql_work; end if;
    if (day_el ->> 'breakMinutes')::numeric is distinct from sql_break then raise exception 'Rast för % stämmer inte med stämplingarna.', d; end if;
    if jsonb_nonzero(day_el -> 'absence') <> jsonb_nonzero(expected_absence) then raise exception 'Frånvaro för % stämmer inte med registrerad frånvaro.', d; end if;
    if ordinary < 0 or worked < 0 or exists (select 1 from jsonb_each(coalesce(day_el -> 'overtime', '{}'::jsonb)) where (value #>> '{}')::numeric < 0) then raise exception 'Negativa värden för %.', d; end if;
    if ordinary + overtime_sum is distinct from worked then raise exception 'Ordinarie tid och övertid för % summerar inte till arbetad tid.', d; end if;

    sum_worked := sum_worked + worked; sum_break := sum_break + (day_el ->> 'breakMinutes')::numeric; sum_ordinary := sum_ordinary + ordinary;
    sum_scheduled := sum_scheduled + scheduled;
    sum_days := sum_days + case when worked > 0 or absence_sum > 0 then 1 else 0 end;
    sum_overtime := sum_overtime || coalesce(day_el -> 'overtime', '{}'::jsonb);
    sum_absence := sum_absence || coalesce(day_el -> 'absence', '{}'::jsonb);
  end loop;

  if exists (select 1 from unnest(all_data_days) x where not x = any (seen)) then
    raise exception 'Underlaget saknar dagar där det finns stämplad tid eller frånvaro.';
  end if;
  if (p_totals ->> 'workedMinutes')::numeric is distinct from sum_worked or (p_totals ->> 'breakMinutes')::numeric is distinct from sum_break
     or (p_totals ->> 'ordinaryMinutes')::numeric is distinct from sum_ordinary or coalesce((p_totals ->> 'scheduledMinutes')::numeric, 0) is distinct from sum_scheduled
     or coalesce((p_totals ->> 'days')::int, 0) is distinct from sum_days
     or jsonb_nonzero(p_totals -> 'overtime') is distinct from jsonb_sum_objects(sum_overtime)
     or jsonb_nonzero(p_totals -> 'absence') is distinct from jsonb_sum_objects(sum_absence) then
    raise exception 'Summorna stämmer inte med dagarna i underlaget.';
  end if;

  return jsonb_build_object('verifiedAt', now(), 'fingerprint', p_fingerprint, 'terms', used_terms, 'ruleSets', used_rules);
end;
$$;
revoke all on function payroll_verify_computation(payroll_periods, uuid, jsonb, jsonb, text) from public, anon, authenticated;

-- ============================================================
-- ATTEST OCH RÄTTELSE MED SERVERVERIFIERING
-- ============================================================
drop function if exists payroll_statement_attest(uuid, uuid, jsonb, jsonb, jsonb);
create or replace function payroll_statement_attest(p_period_id uuid, p_user_id uuid, p_totals jsonb, p_days jsonb, p_fingerprint text)
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
  snapshot jsonb;
begin
  select * into actor from profiles where id = auth.uid() and status = 'aktiv';
  if actor.id is null or actor.role not in ('admin', 'projektledare') then raise exception 'Endast admin eller projektledare kan attestera.' using errcode = '42501'; end if;
  if p_user_id = actor.id and actor.role <> 'admin' then raise exception 'Du kan inte attestera din egen tid.' using errcode = '42501'; end if;
  select * into period from payroll_periods where id = p_period_id and org_id = actor.org_id;
  if period.id is null then raise exception 'Löneperioden hittades inte.'; end if;
  if not exists (select 1 from profiles where id = p_user_id and org_id = actor.org_id) then raise exception 'Personen hittades inte.'; end if;

  -- Samma lås som stämpling/ändring av tid: ingen kan ändra personens tid medan underlaget verifieras.
  perform pg_advisory_xact_lock(hashtextextended('attendance-clock:' || p_user_id::text, 0));
  if exists (select 1 from attendance_entries where user_id = p_user_id and end_time is null
             and sthlm_date(start_time) between period.start_date and period.end_date) then
    raise exception 'Personen har en pågående stämpling i perioden.';
  end if;
  select * into existing from payroll_statements where period_id = p_period_id and user_id = p_user_id for update;
  if existing.id is not null and existing.status in ('attested', 'reviewed', 'exported') then
    raise exception 'Perioden är redan attesterad.';
  end if;

  snapshot := payroll_verify_computation(period, p_user_id, p_totals, p_days, p_fingerprint);

  insert into payroll_statements (org_id, period_id, user_id, status, totals, days, rule_snapshot, input_fingerprint, attested_at, attested_by)
  values (actor.org_id, p_period_id, p_user_id, 'attested', p_totals, p_days, snapshot, p_fingerprint, now(), actor.id)
  on conflict (period_id, user_id) do update set
    status = 'attested', totals = excluded.totals, days = excluded.days, rule_snapshot = excluded.rule_snapshot,
    input_fingerprint = excluded.input_fingerprint, attested_at = now(), attested_by = actor.id, updated_at = now()
  returning * into saved;
  insert into payroll_log (org_id, statement_id, period_id, user_id, action, details, actor)
  values (actor.org_id, saved.id, p_period_id, p_user_id, 'attested', jsonb_build_object('fingerprint', p_fingerprint), actor.id);
  return saved;
end;
$$;
revoke all on function payroll_statement_attest(uuid, uuid, jsonb, jsonb, text) from public, anon;
grant execute on function payroll_statement_attest(uuid, uuid, jsonb, jsonb, text) to authenticated;

drop function if exists payroll_record_adjustment(uuid, jsonb, jsonb, text);
create or replace function payroll_record_adjustment(p_statement_id uuid, p_new_totals jsonb, p_new_days jsonb, p_reason text, p_fingerprint text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  actor profiles;
  target payroll_statements;
  period payroll_periods;
  type_key text;
  old_minutes integer;
  new_minutes integer;
  inserted integer := 0;
  old_values jsonb;
  new_values jsonb;
  snapshot jsonb;
begin
  select * into actor from profiles where id = auth.uid() and status = 'aktiv';
  if actor.id is null or actor.role not in ('admin', 'ekonomi') then raise exception 'Åtgärden nekas.' using errcode = '42501'; end if;
  select * into target from payroll_statements where id = p_statement_id and org_id = actor.org_id for update;
  if target.id is null then raise exception 'Sammanställningen hittades inte.'; end if;
  if target.status <> 'exported' then raise exception 'Rättelser registreras bara för exporterade sammanställningar.'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Ange orsak.'; end if;
  select * into period from payroll_periods where id = target.period_id;
  perform pg_advisory_xact_lock(hashtextextended('attendance-clock:' || target.user_id::text, 0));
  snapshot := payroll_verify_computation(period, target.user_id, p_new_totals, p_new_days, p_fingerprint);

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

  update payroll_statements
  set totals = p_new_totals, days = p_new_days, rule_snapshot = snapshot, input_fingerprint = p_fingerprint, pending_adjustment = false, updated_at = now()
  where id = target.id;
  insert into payroll_log (org_id, statement_id, period_id, user_id, action, reason, details, actor)
  values (actor.org_id, target.id, target.period_id, target.user_id, 'adjustment_recorded', p_reason, jsonb_build_object('rows', inserted), actor.id);
  return inserted;
end;
$$;
revoke all on function payroll_record_adjustment(uuid, jsonb, jsonb, text, text) from public, anon;
grant execute on function payroll_record_adjustment(uuid, jsonb, jsonb, text, text) to authenticated;

-- Export kräver verifierat underlag.
create or replace function payroll_export_guard()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('reviewed', 'exported') and (new.totals is null or new.rule_snapshot is null) then
    raise exception 'Sammanställningen saknar verifierat underlag.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_payroll_export_guard on payroll_statements;
create trigger trg_payroll_export_guard before insert or update on payroll_statements
  for each row execute function payroll_export_guard();

notify pgrst, 'reload schema';
