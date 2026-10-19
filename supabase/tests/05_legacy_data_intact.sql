\set ON_ERROR_STOP off
\set QUIET on
-- Verifierar att data som fanns före 0027-0029 är orörd och fortfarande läsbar som tidigare (äldre appversioner).
select t.ok('äldre projekt finns kvar oförändrade', (select count(*) from projects where id in ('c3000000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000002') and price in (50000, 80000)) = 2);
select t.ok('äldre projekttid (time_entries) är orörd', (select total_minutes from time_entries where id = 'c6000000-0000-0000-0000-000000000001') = 150);
select t.ok('inga rapporter, närvaro eller lönedata skapades av migrationerna',
  (select count(*) from work_reports) = 0 and (select count(*) from attendance_entries) = 0 and (select count(*) from payroll_periods) = 0);
set role authenticated;
select t.as_user('c0000000-0000-0000-0000-0000000000a2');
select t.ok('äldre app: läsare ser fortfarande projekt, uppgifter och projekttid', (select count(*) from projects) = 2 and (select count(*) from tasks) = 1 and (select count(*) from time_entries) = 1);
select t.ok('äldre app: den gamla projektklockan fungerar oförändrat (time_clock_transition finns)', exists (select 1 from pg_proc where proname = 'time_clock_transition'));
select t.ok('läsare ser ingen löne-, pris- eller kostnadsdata från de nya tabellerna', (select count(*) from billing_rates) = 0 and (select count(*) from payroll_statements) = 0 and (select count(*) from employee_terms) = 0);
select t.as_user('c0000000-0000-0000-0000-0000000000a1');
select t.ok('admin kan skapa en rapport på äldre projekt efter migreringen', (work_report_save('{"id":"c7000000-0000-0000-0000-000000000001","project_id":"c3000000-0000-0000-0000-000000000002","report_date":"2026-10-01","hours":2,"performer_type":"employee"}'::jsonb)).hours = 2);
select t.ok('rapporten påverkar inte gammal projekttid eller närvaro', (select count(*) from time_entries) = 1 and (select count(*) from attendance_entries) = 0);
