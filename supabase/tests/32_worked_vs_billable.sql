\set ON_ERROR_STOP off
\set QUIET on
-- Kärnscenario: 10 timmar arbetad (lönegrundande) tid och 6 + 5 + 4 = 15 fakturerbara timmar på tre projekt.
select t.mk_user(u, e) from (values
  ('d1000000-0000-0000-0000-0000000000a1'::uuid, 'w-admin@t.test'),
  ('d1000000-0000-0000-0000-0000000000a2'::uuid, 'w-pl@t.test'),
  ('d1000000-0000-0000-0000-0000000000a3'::uuid, 'w-emp@t.test'),
  ('d1000000-0000-0000-0000-0000000000a4'::uuid, 'w-emp2@t.test')
) as v(u, e);
insert into organizations (id, name) values ('d2000000-0000-0000-0000-000000000001', 'Scenario-org');
insert into profiles (id, org_id, full_name, email, role, status) values
  ('d1000000-0000-0000-0000-0000000000a1', 'd2000000-0000-0000-0000-000000000001', 'Admin', 'w-admin@t.test', 'admin', 'aktiv'),
  ('d1000000-0000-0000-0000-0000000000a2', 'd2000000-0000-0000-0000-000000000001', 'PL', 'w-pl@t.test', 'projektledare', 'aktiv'),
  ('d1000000-0000-0000-0000-0000000000a3', 'd2000000-0000-0000-0000-000000000001', 'Chaufför Anna', 'w-emp@t.test', 'lasare', 'aktiv'),
  ('d1000000-0000-0000-0000-0000000000a4', 'd2000000-0000-0000-0000-000000000001', 'Chaufför Bo', 'w-emp2@t.test', 'lasare', 'aktiv');
insert into customers (id, org_id, company_name) values ('d3000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'Kund S');
insert into projects (id, org_id, project_number, name, customer_id, status, price, cost) values
  ('d4000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'S-0001', 'Projekt A', 'd3000000-0000-0000-0000-000000000001', 'Bokad', 1, 1),
  ('d4000000-0000-0000-0000-000000000002', 'd2000000-0000-0000-0000-000000000001', 'S-0002', 'Projekt B', 'd3000000-0000-0000-0000-000000000001', 'Bokad', 1, 1),
  ('d4000000-0000-0000-0000-000000000003', 'd2000000-0000-0000-0000-000000000001', 'S-0003', 'Projekt C', 'd3000000-0000-0000-0000-000000000001', 'Bokad', 1, 1);

set role authenticated;
select t.as_user('d1000000-0000-0000-0000-0000000000a1');
select payroll_period_create('Oktober S', '2026-10-01', '2026-10-31');

-- Anna stämplar 07:00-17:00 (svensk tid, CEST) onsdag 14 okt = 10 timmar
select t.as_user('d1000000-0000-0000-0000-0000000000a3');
select attendance_add_entries('[{"id":"d5000000-0000-0000-0000-000000000001","type":"work","start":"2026-10-14T05:00:00Z","end":"2026-10-14T15:00:00Z"}]'::jsonb);
-- ... och rapporterar tre uppdrag: 6 + 5 + 4 fakturerbara timmar
select work_report_save('{"id":"d6000000-0000-0000-0000-000000000001","project_id":"d4000000-0000-0000-0000-000000000001","report_date":"2026-10-14","hours":6,"performer_type":"employee"}'::jsonb);
select work_report_save('{"id":"d6000000-0000-0000-0000-000000000002","project_id":"d4000000-0000-0000-0000-000000000002","report_date":"2026-10-14","hours":5,"performer_type":"employee"}'::jsonb);
select t.ok('6 + 5 = 11 rapporterade timmar sparas utan spärr redan nu när 10 timmar är stämplade',
  (select sum(hours) from work_reports where performer_profile_id = 'd1000000-0000-0000-0000-0000000000a3') = 11);
select work_report_save('{"id":"d6000000-0000-0000-0000-000000000003","project_id":"d4000000-0000-0000-0000-000000000003","report_date":"2026-10-14","hours":4,"performer_type":"employee"}'::jsonb);
select t.ok('totalt 15 rapporterade timmar på tre projekt', (select sum(hours) from work_reports where performer_profile_id = 'd1000000-0000-0000-0000-0000000000a3') = 15
  and (select count(distinct project_id) from work_reports) = 3);
select t.ok('lönegrundande arbetad tid är exakt 10 timmar (600 min)', (select sum(total_minutes) from attendance_entries where user_id = 'd1000000-0000-0000-0000-0000000000a3' and entry_type = 'work') = 600);

select t.as_user('d1000000-0000-0000-0000-0000000000a2');
create temp table w_fp1 as select payroll_inputs((select id from payroll_periods where name = 'Oktober S'), 'd1000000-0000-0000-0000-0000000000a3') ->> 'fingerprint' as fp;
grant select on w_fp1 to authenticated;
select billing_rate_set('d3000000-0000-0000-0000-000000000001', null, 'hours', 850);
select t.ok('justering 4 → 6 fakturerbara timmar sparas', (work_report_adjust_billing('d6000000-0000-0000-0000-000000000003', '{"billable_hours":6,"adjust_reason":"Väntade på lossning"}'::jsonb)).billable_hours = 6);
select t.ok('ursprungsrapporten är orörd (4 h)', (select hours from work_reports where id = 'd6000000-0000-0000-0000-000000000003') = 4);
select t.ok('personalens löneunderlag (indata och fingeravtryck) är oförändrat av faktureringsjusteringen',
  (select fp from w_fp1) = (payroll_inputs((select id from payroll_periods where name = 'Oktober S'), 'd1000000-0000-0000-0000-0000000000a3') ->> 'fingerprint')
  and (select sum(total_minutes) from attendance_entries where user_id = 'd1000000-0000-0000-0000-0000000000a3') = 600);

-- Ingen dubbeldebitering
select billing_mark_invoiced(array['d6000000-0000-0000-0000-000000000001']::uuid[], '{}'::uuid[], 'F-1');
select t.fails('samma rapport kan inte faktureras igen', $$select billing_mark_invoiced(array['d6000000-0000-0000-0000-000000000001']::uuid[], '{}'::uuid[], 'F-2')$$, 'Redan fakturerat');
select t.ok('fakturareferensen ligger kvar oförändrad', (select invoice_reference from work_report_billing where report_id = 'd6000000-0000-0000-0000-000000000001') = 'F-1');

-- Flera chaufförer på samma projekt
select t.as_user('d1000000-0000-0000-0000-0000000000a4');
select work_report_save('{"id":"d6000000-0000-0000-0000-000000000004","project_id":"d4000000-0000-0000-0000-000000000001","report_date":"2026-10-14","hours":3.5,"performer_type":"employee"}'::jsonb);
select t.ok('två chaufförer har rapporterat på projekt A (6 + 3,5 h) var för sig', (select count(*) from work_reports where project_id = 'd4000000-0000-0000-0000-000000000001') = 2
  and (select sum(hours) from work_reports where project_id = 'd4000000-0000-0000-0000-000000000001') = 9.5);
select t.ok('Bo har ingen arbetad tid i närvaro: rapporten ger ingen lönegrundande tid', (select count(*) from attendance_entries where user_id = 'd1000000-0000-0000-0000-0000000000a4') = 0);
