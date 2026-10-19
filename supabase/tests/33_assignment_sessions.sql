\set ON_ERROR_STOP off
\set QUIET on
-- Uppdrag på stämpelklockan: start, väntetid, avslut med rapport, flera samtidiga uppdrag, behörighet.
select t.mk_user(u, e) from (values
  ('e1000000-0000-0000-0000-0000000000a1'::uuid, 's-emp@t.test'),
  ('e1000000-0000-0000-0000-0000000000a2'::uuid, 's-emp2@t.test'),
  ('e1000000-0000-0000-0000-0000000000a3'::uuid, 's-pl@t.test'),
  ('e2000000-0000-0000-0000-0000000000a1'::uuid, 's-other@t.test')
) as v(u, e);
insert into organizations (id, name) values ('e3000000-0000-0000-0000-000000000001', 'Uppdrag-org'), ('e3000000-0000-0000-0000-000000000002', 'Annan uppdrag-org');
insert into profiles (id, org_id, full_name, email, role, status) values
  ('e1000000-0000-0000-0000-0000000000a1', 'e3000000-0000-0000-0000-000000000001', 'Anna', 's-emp@t.test', 'lasare', 'aktiv'),
  ('e1000000-0000-0000-0000-0000000000a2', 'e3000000-0000-0000-0000-000000000001', 'Bo', 's-emp2@t.test', 'lasare', 'aktiv'),
  ('e1000000-0000-0000-0000-0000000000a3', 'e3000000-0000-0000-0000-000000000001', 'PL', 's-pl@t.test', 'projektledare', 'aktiv'),
  ('e2000000-0000-0000-0000-0000000000a1', 'e3000000-0000-0000-0000-000000000002', 'Annan', 's-other@t.test', 'admin', 'aktiv');
insert into customers (id, org_id, company_name) values ('e4000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', 'Kund U'), ('e4000000-0000-0000-0000-000000000002', 'e3000000-0000-0000-0000-000000000002', 'Kund X');
insert into projects (id, org_id, project_number, name, customer_id, status, price, cost) values
  ('e5000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001', 'U-0001', 'Projekt 1', 'e4000000-0000-0000-0000-000000000001', 'Bokad', 1, 1),
  ('e5000000-0000-0000-0000-000000000002', 'e3000000-0000-0000-0000-000000000001', 'U-0002', 'Projekt 2', 'e4000000-0000-0000-0000-000000000001', 'Bokad', 1, 1),
  ('e5000000-0000-0000-0000-000000000003', 'e3000000-0000-0000-0000-000000000001', 'U-0003', 'Avbokat', 'e4000000-0000-0000-0000-000000000001', 'Avbokad', 1, 1),
  ('e5000000-0000-0000-0000-000000000009', 'e3000000-0000-0000-0000-000000000002', 'X-9', 'Annan orgs projekt', 'e4000000-0000-0000-0000-000000000002', 'Bokad', 1, 1);

set role authenticated;
select t.as_user('e1000000-0000-0000-0000-0000000000a1');
select t.ok('anställd startar uppdrag på projekt 1', (session_start('e6000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001')).ended_at is null);
select t.ok('omförsök med samma id ger samma rad utan dubblett', (session_start('e6000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001')).id is not null
  and (select count(*) from assignment_sessions) = 1);
select session_start('e6000000-0000-0000-0000-000000000002', 'e5000000-0000-0000-0000-000000000002');
select t.ok('flera uppdrag på olika projekt kan pågå samtidigt', (select count(*) from assignment_sessions where ended_at is null) = 2);
select t.fails('samma projekt kan inte startas två gånger samtidigt', $$select session_start('e6000000-0000-0000-0000-000000000003', 'e5000000-0000-0000-0000-000000000001')$$, 'pågår redan');
select t.fails('avbokat projekt nekas', $$select session_start('e6000000-0000-0000-0000-000000000004', 'e5000000-0000-0000-0000-000000000003')$$, 'avbokad');
select t.fails('projekt i annan organisation nekas', $$select session_start('e6000000-0000-0000-0000-000000000005', 'e5000000-0000-0000-0000-000000000009')$$, 'hittades inte');
select t.fails('backdaterad starttid nekas', $$select session_start('e6000000-0000-0000-0000-000000000006', 'e5000000-0000-0000-0000-000000000002', null, now() - interval '3 hours')$$, 'starttid');
select t.ok('väntetid kan startas', (session_wait('e6000000-0000-0000-0000-000000000001', true)).waiting_started_at is not null);
select t.ok('upprepad start av väntetid är ofarlig', (session_wait('e6000000-0000-0000-0000-000000000001', true)).waiting_started_at is not null);
select t.ok('väntetid kan stoppas', (session_wait('e6000000-0000-0000-0000-000000000001', false)).waiting_started_at is null);

-- Kollegan ser och rör inte Annas uppdrag
select t.as_user('e1000000-0000-0000-0000-0000000000a2');
select t.ok('kollega ser inte andras uppdrag', (select count(*) from assignment_sessions) = 0);
select t.fails('kollega kan inte stämpla väntetid på andras uppdrag', $$select session_wait('e6000000-0000-0000-0000-000000000001', true)$$, 'hittades inte');
select t.fails('kollega kan inte avsluta andras uppdrag', $$select session_finish('e6000000-0000-0000-0000-000000000001', null, '{"id":"e7000000-0000-0000-0000-0000000000f1","report_date":"2026-10-14","hours":1}'::jsonb)$$, 'hittades inte');
select t.fails('direkt skrivning i tabellen nekas', $$insert into assignment_sessions (id, org_id, user_id, project_id, started_at) values (gen_random_uuid(),'e3000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-0000000000a2','e5000000-0000-0000-0000-000000000001', now())$$);
select t.as_user('e1000000-0000-0000-0000-0000000000a3');
select t.ok('projektledare ser personalens pågående uppdrag', (select count(*) from assignment_sessions where ended_at is null) = 2);
select t.as_user('e2000000-0000-0000-0000-0000000000a1');
select t.ok('annan organisation ser inga uppdrag', (select count(*) from assignment_sessions) = 0);

-- Avslut med rapport: fakturerbar tid kan överstiga arbetad tid (6 h + 5 h på två samtidiga uppdrag)
select t.as_user('e1000000-0000-0000-0000-0000000000a1');
select t.ok('uppdrag avslutas och rapport sparas atomiskt', (session_finish('e6000000-0000-0000-0000-000000000001', now(), '{"id":"e7000000-0000-0000-0000-000000000001","project_id":"e5000000-0000-0000-0000-000000000002","report_date":"2026-10-14","hours":6,"waiting_hours":1.5,"distance_km":180}'::jsonb) ->> 'report_id') = 'e7000000-0000-0000-0000-000000000001');
select t.ok('rapportens projekt styrs av uppdraget (inte av det klienten skickade)', (select project_id from work_reports where id = 'e7000000-0000-0000-0000-000000000001') = 'e5000000-0000-0000-0000-000000000001');
select t.ok('uppdraget är avslutat och kopplat till rapporten', (select ended_at is not null and report_id = 'e7000000-0000-0000-0000-000000000001' from assignment_sessions where id = 'e6000000-0000-0000-0000-000000000001'));
select t.ok('omförsök att avsluta ger samma rapport utan dubblett', (session_finish('e6000000-0000-0000-0000-000000000001', now(), '{"id":"e7000000-0000-0000-0000-000000000001","report_date":"2026-10-14","hours":6}'::jsonb) ->> 'report_id') = 'e7000000-0000-0000-0000-000000000001'
  and (select count(*) from work_reports where performer_profile_id = 'e1000000-0000-0000-0000-0000000000a1') = 1);
select session_finish('e6000000-0000-0000-0000-000000000002', now(), '{"id":"e7000000-0000-0000-0000-000000000002","report_date":"2026-10-14","hours":5}'::jsonb);
select t.ok('två samtidiga uppdrag ger 6 + 5 = 11 fakturerbara timmar utan någon spärr', (select sum(hours) from work_reports where performer_profile_id = 'e1000000-0000-0000-0000-0000000000a1') = 11);
select t.ok('uppdrag påverkar inte närvaro (lönegrundande tid)', (select count(*) from attendance_entries where user_id = 'e1000000-0000-0000-0000-0000000000a1') = 0);
select session_start('e6000000-0000-0000-0000-000000000010', 'e5000000-0000-0000-0000-000000000001');
select t.fails('rapport utan timmar, sträcka eller väntetid nekas', $$select session_finish('e6000000-0000-0000-0000-000000000010', now(), '{"id":"e7000000-0000-0000-0000-000000000003","report_date":"2026-10-14"}'::jsonb)$$, 'minst');
select t.ok('uppdraget är fortfarande öppet efter misslyckad sparning', (select ended_at is null from assignment_sessions where id = 'e6000000-0000-0000-0000-000000000010'));
select session_cancel('e6000000-0000-0000-0000-000000000010');
select t.ok('uppdrag kan avbrytas utan rapport', (select count(*) from assignment_sessions where id = 'e6000000-0000-0000-0000-000000000010') = 0);
select t.fails('avslutat uppdrag kan inte avbrytas', $$select session_cancel('e6000000-0000-0000-0000-000000000001')$$, 'avslutat');
