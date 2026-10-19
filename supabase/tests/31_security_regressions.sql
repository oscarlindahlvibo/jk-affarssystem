\set ON_ERROR_STOP off
\set QUIET on
-- Regressionstester för fynd i säkerhetsgranskningen. Bygger på testdata från 10_work_reports.sql och
-- 20_attendance_payroll.sql (körs i filordning).
set role authenticated;

-- ===== Rapporter kan inte flyttas mellan projekt =====
select t.as_user('00000000-0000-0000-0000-0000000000a2');  -- projektledare
select t.ok('projektledare sparar rapport på projekt 1', (work_report_save('{"id":"51000000-0000-0000-0000-000000000001","project_id":"30000000-0000-0000-0000-000000000001","report_date":"2026-10-05","hours":3,"performer_type":"employee"}'::jsonb)).project_id = '30000000-0000-0000-0000-000000000001');
select t.fails('samma rapport-id kan inte återanvändas för ett annat projekt', $$select work_report_save('{"id":"51000000-0000-0000-0000-000000000001","project_id":"30000000-0000-0000-0000-000000000002","report_date":"2026-10-05","hours":3,"performer_type":"employee"}'::jsonb)$$, 'annat projekt');
select t.fails('datum före 2020 nekas', $$select work_report_save('{"id":"51000000-0000-0000-0000-000000000002","project_id":"30000000-0000-0000-0000-000000000001","report_date":"1999-01-01","hours":3,"performer_type":"employee"}'::jsonb)$$, 'datum');

-- ===== Transportör: uppdrag och projektbyte =====
select t.as_user('00000000-0000-0000-0000-0000000000c1');
select t.ok('transportör sparar rapport på tilldelat uppdrag', (carrier_work_report_save('{"id":"61000000-0000-0000-0000-000000000051","project_id":"30000000-0000-0000-0000-000000000001","report_date":"2026-10-05","hours":2}'::jsonb) ->> 'id') is not null);
select t.fails('transportör kan inte flytta egen rapport till ej tilldelat projekt', $$select carrier_work_report_save('{"id":"61000000-0000-0000-0000-000000000051","project_id":"30000000-0000-0000-0000-000000000002","report_date":"2026-10-05","hours":2}'::jsonb)$$, 'tilldelat');
reset role;
update projects set status = 'Fakturerad' where id = '30000000-0000-0000-0000-000000000001';
set role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000c1');
select t.fails('transportör kan inte rapportera på fakturerat projekt', $$select carrier_work_report_save('{"id":"61000000-0000-0000-0000-000000000052","project_id":"30000000-0000-0000-0000-000000000001","report_date":"2026-10-05","hours":2}'::jsonb)$$, 'tilldelat');
reset role;
update projects set status = 'Bokad' where id = '30000000-0000-0000-0000-000000000001';
set role authenticated;

-- ===== Frånvaro: ingen överskrivning av annan organisations rad =====
select t.as_user('00000000-0000-0000-0000-0000000000b1');  -- admin i annan organisation
select t.fails('annan organisations admin kan inte skriva över vår frånvaro via känt id', $$select attendance_absence_save('d0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', '2026-10-01', 'absence_other', 60, '', 'x')$$, 'nekas');
select t.as_user('81000000-0000-0000-0000-000000000002');
select t.ok('vår frånvaro är oförändrad (480 min sjuk 18 sep)', (select minutes = 480 and kind = 'absence_sick' from attendance_absences where id = 'd0000000-0000-0000-0000-000000000001'));
select t.fails('frånvaro-id kan inte flyttas till en annan person', $$select attendance_absence_save('d0000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000005', '2026-09-18', 'absence_sick', 480, '', 'x')$$, 'nekas');
