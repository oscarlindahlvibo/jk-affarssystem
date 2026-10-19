\set ON_ERROR_STOP off
\set QUIET on
-- Serververifiering av löneattest: midnattsdelning, automatiskt rastavdrag, inaktuell data, behörigheter.
select t.mk_user(u, e) from (values
  ('a1000000-0000-0000-0000-000000000001'::uuid, 'v-admin@t.test'),
  ('a1000000-0000-0000-0000-000000000002'::uuid, 'v-pl@t.test'),
  ('a1000000-0000-0000-0000-000000000003'::uuid, 'v-emp@t.test'),
  ('a1000000-0000-0000-0000-000000000004'::uuid, 'v-emp2@t.test'),
  ('a1000000-0000-0000-0000-000000000005'::uuid, 'v-inactive@t.test'),
  ('a2000000-0000-0000-0000-000000000001'::uuid, 'v-other@t.test')
) as v(u, e);
insert into organizations (id, name) values ('b1000000-0000-0000-0000-000000000001', 'Verif-org'), ('b2000000-0000-0000-0000-000000000001', 'Verif-annan');
insert into profiles (id, org_id, full_name, email, role, status) values
  ('a1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'Admin', 'v-admin@t.test', 'admin', 'aktiv'),
  ('a1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'PL', 'v-pl@t.test', 'projektledare', 'aktiv'),
  ('a1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000001', 'Emp', 'v-emp@t.test', 'lasare', 'aktiv'),
  ('a1000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000001', 'Emp2', 'v-emp2@t.test', 'lasare', 'aktiv'),
  ('a1000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000001', 'Inaktiv PL', 'v-inactive@t.test', 'projektledare', 'aktiv'),
  ('a2000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'Annan admin', 'v-other@t.test', 'admin', 'aktiv');

set role authenticated;
select t.as_user('a1000000-0000-0000-0000-000000000001');
select payroll_period_create('Oktober 2026', '2026-10-01', '2026-10-31');
select overtime_rule_set_save(null, 'Natt', '{"version":1,"dayBucketing":"split_midnight","tierScope":"day","tiers":[{"key":"overtime_1","label":"Övertid 1","upToMinutes":null}],"autoBreak":{"enabled":true,"afterMinutes":300,"deductMinutes":30,"onlyIfNoBreakRegistered":true}}'::jsonb, true);
select t.ok('regelmall med midnattsdelning och rastavdrag sparad', (select count(*) from overtime_rule_sets where name = 'Natt') = 1);
select overtime_rule_set_approve((select id from overtime_rule_sets where name = 'Natt'), 'Testavtal');
select employee_terms_save(jsonb_build_object('user_id', u, 'valid_from', '2026-01-01', 'schedule', '{"mon":480,"tue":480,"wed":480,"thu":480,"fri":480,"sat":0,"sun":0}'::jsonb, 'rule_set_id', (select id from overtime_rule_sets where name = 'Natt')))
  from unnest(array['a1000000-0000-0000-0000-000000000003'::uuid, 'a1000000-0000-0000-0000-000000000004'::uuid]) u;

-- Natt-pass 22:00 -> 06:00 lokal tid (CEST), måndag-tisdag
select t.as_user('a1000000-0000-0000-0000-000000000003');
select attendance_add_entries('[{"id":"c1000000-0000-0000-0000-000000000001","type":"work","start":"2026-10-05T20:00:00Z","end":"2026-10-06T04:00:00Z"}]'::jsonb);
select t.as_user('a1000000-0000-0000-0000-000000000002');
create temp table fp1 as select payroll_inputs((select id from payroll_periods where name = 'Oktober 2026'), 'a1000000-0000-0000-0000-000000000003') ->> 'fingerprint' as fp;
grant select on fp1 to authenticated;
select t.as_user('a1000000-0000-0000-0000-000000000003');
select attendance_add_entries('[{"id":"c1000000-0000-0000-0000-000000000002","type":"work","start":"2026-10-08T07:00:00Z","end":"2026-10-08T08:00:00Z"}]'::jsonb);
select t.as_user('a1000000-0000-0000-0000-000000000002');
select t.fails('attest på inaktuell data (ny stämpling efter beräkning) nekas', $$select payroll_statement_attest((select id from payroll_periods where name = 'Oktober 2026'), 'a1000000-0000-0000-0000-000000000003', '{"x":1}'::jsonb, '[]'::jsonb, (select fp from fp1))$$, 'ändrats');
create temp table fp2 as select payroll_inputs((select id from payroll_periods where name = 'Oktober 2026'), 'a1000000-0000-0000-0000-000000000003') ->> 'fingerprint' as fp;
grant select on fp2 to authenticated;

-- Dag 5/10: 120 min (split vid midnatt). Dag 6/10: 360 min minus 30 rastavdrag = 330. Dag 8/10: 60 min.
create temp table good_days as select jsonb_build_array(
  jsonb_build_object('date','2026-10-05','scheduledMinutes',480,'workedMinutes',120,'breakMinutes',0,'ordinaryMinutes',120,'overtime','{}'::jsonb,'absence','{}'::jsonb),
  jsonb_build_object('date','2026-10-06','scheduledMinutes',480,'workedMinutes',330,'breakMinutes',0,'ordinaryMinutes',330,'overtime','{}'::jsonb,'absence','{}'::jsonb),
  jsonb_build_object('date','2026-10-08','scheduledMinutes',480,'workedMinutes',60,'breakMinutes',0,'ordinaryMinutes',60,'overtime','{}'::jsonb,'absence','{}'::jsonb)) as d;
grant select on good_days to authenticated;
select t.fails('klient som ignorerar midnattsdelning (hela passet på startdagen) nekas', $$select payroll_statement_attest((select id from payroll_periods where name = 'Oktober 2026'), 'a1000000-0000-0000-0000-000000000003',
  '{"days":3,"scheduledMinutes":1440,"workedMinutes":510,"breakMinutes":0,"ordinaryMinutes":510,"overtime":{},"absence":{},"openEntryIds":[]}'::jsonb,
  jsonb_build_array(
   jsonb_build_object('date','2026-10-05','scheduledMinutes',480,'workedMinutes',450,'breakMinutes',0,'ordinaryMinutes',450,'overtime','{}'::jsonb,'absence','{}'::jsonb),
   jsonb_build_object('date','2026-10-08','scheduledMinutes',480,'workedMinutes',60,'breakMinutes',0,'ordinaryMinutes',60,'overtime','{}'::jsonb,'absence','{}'::jsonb)), (select fp from fp2))$$, 'stämmer inte');
select t.fails('klient som utelämnar rastavdraget (360 i stället för 330) nekas', $$select payroll_statement_attest((select id from payroll_periods where name = 'Oktober 2026'), 'a1000000-0000-0000-0000-000000000003',
  '{"days":3,"scheduledMinutes":1440,"workedMinutes":540,"breakMinutes":0,"ordinaryMinutes":540,"overtime":{},"absence":{},"openEntryIds":[]}'::jsonb,
  (select jsonb_set(d, '{1,workedMinutes}', '360'::jsonb) from good_days), (select fp from fp2))$$, 'stämmer inte');

-- Inaktiverad användare
reset role;
update profiles set status = 'inaktiverad' where id = 'a1000000-0000-0000-0000-000000000005';
set role authenticated;
select t.as_user('a1000000-0000-0000-0000-000000000005');
select t.fails('inaktiverad projektledare kan inte attestera', $$select payroll_statement_attest((select id from payroll_periods where name = 'Oktober 2026'), 'a1000000-0000-0000-0000-000000000003', '{}'::jsonb, '[]'::jsonb, (select fp from fp2))$$, 'attestera');
select t.fails('inaktiverad användare kan inte hämta löneindata', $$select payroll_inputs((select id from payroll_periods where name = 'Oktober 2026'), 'a1000000-0000-0000-0000-000000000003')$$, 'nekas');

-- Behörighet till indata
select t.as_user('a1000000-0000-0000-0000-000000000004');
select t.fails('anställd kan inte hämta kollegas löneindata', $$select payroll_inputs((select id from payroll_periods where name = 'Oktober 2026'), 'a1000000-0000-0000-0000-000000000003')$$, 'nekas');
select t.ok('anställd kan hämta egna löneindata', payroll_inputs((select id from payroll_periods where name = 'Oktober 2026'), 'a1000000-0000-0000-0000-000000000004') ? 'fingerprint');
select t.fails('anställd kan inte attestera', $$select payroll_statement_attest((select id from payroll_periods where name = 'Oktober 2026'), 'a1000000-0000-0000-0000-000000000004', '{}'::jsonb, '[]'::jsonb, 'x')$$, 'attestera');
select t.as_user('a2000000-0000-0000-0000-000000000001');
select t.fails('annan organisation kan inte hämta indata', $$select payroll_inputs((select id from payroll_periods where name = 'Oktober 2026'), 'a1000000-0000-0000-0000-000000000003')$$, 'hittades inte');
select t.fails('annan organisation kan inte attestera', $$select payroll_statement_attest((select id from payroll_periods where name = 'Oktober 2026'), 'a1000000-0000-0000-0000-000000000003', '{}'::jsonb, '[]'::jsonb, (select fp from fp2))$$, 'hittades inte');
select t.fails('verifieringsfunktionen kan inte anropas direkt', $$select payroll_verify_computation(null::payroll_periods, null, '{}'::jsonb, '[]'::jsonb, 'x')$$);
select t.fails('indatafunktionen utan behörighetskontroll kan inte anropas direkt', $$select payroll_input_payload((select id from payroll_periods limit 1), 'a1000000-0000-0000-0000-000000000003')$$);

-- Lyckad attest, godkännande återställs vid ändrade regler
select t.as_user('a1000000-0000-0000-0000-000000000002');
select t.ok('korrekt underlag (midnattsdelning + rastavdrag) attesteras', (payroll_statement_attest((select id from payroll_periods where name = 'Oktober 2026'), 'a1000000-0000-0000-0000-000000000003',
  '{"days":3,"scheduledMinutes":1440,"workedMinutes":510,"breakMinutes":0,"ordinaryMinutes":510,"overtime":{},"absence":{},"openEntryIds":[]}'::jsonb, (select d from good_days), (select fp from fp2))).status = 'attested');
select t.as_user('a1000000-0000-0000-0000-000000000001');
select overtime_rule_set_save((select id from overtime_rule_sets where name = 'Natt'), 'Natt', '{"version":1,"dayBucketing":"split_midnight","tierScope":"day","tiers":[{"key":"overtime_1","label":"Övertid 1","upToMinutes":null}],"autoBreak":{"enabled":false}}'::jsonb, true);
select t.ok('ändrade regler kräver nytt godkännande', (select approved_at is null from overtime_rule_sets where name = 'Natt'));
select overtime_rule_set_save((select id from overtime_rule_sets where name = 'Natt'), 'Natt (omdöpt)', (select config from overtime_rule_sets where name = 'Natt'), true);
select t.ok('enbart namnbyte behåller godkännandet inte (var redan återställt) men tidigare attest är orörd', (select count(*) from payroll_statements where status = 'attested') = 1);
select t.ok('attesten bär kvar den godkända regelkopian', (select (rule_snapshot -> 'ruleSets' -> 0 -> 'config' -> 'autoBreak' ->> 'enabled')::boolean from payroll_statements limit 1));

-- Anställd 2 med pågående stämpling kan inte attesteras
select t.as_user('a1000000-0000-0000-0000-000000000004');
select attendance_clock_transition('c2000000-0000-0000-0000-000000000001', 'clockin', null, '2026-10-12T06:00:00Z');
select t.as_user('a1000000-0000-0000-0000-000000000002');
select t.fails('pågående stämpling blockerar attest', $$select payroll_statement_attest((select id from payroll_periods where name = 'Oktober 2026'), 'a1000000-0000-0000-0000-000000000004', '{}'::jsonb, '[]'::jsonb, 'x')$$, 'pågående');
