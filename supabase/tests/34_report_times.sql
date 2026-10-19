\set ON_ERROR_STOP off
\set QUIET on
-- Start- och sluttid på rapporter (bygger på testdata från 10_work_reports.sql).
set role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000a4');  -- anställd
select t.ok('rapport med start och slut sparas', (work_report_save('{"id":"52000000-0000-0000-0000-000000000001","project_id":"30000000-0000-0000-0000-000000000001","report_date":"2026-10-14","report_start":"07:30","report_end":"15:00","hours":7.5,"performer_type":"employee"}'::jsonb)).report_start = '07:30');
select t.ok('klockslagen finns kvar i raden', (select report_end = '15:00' from work_reports where id = '52000000-0000-0000-0000-000000000001'));
select t.fails('bara starttid nekas', $$select work_report_save('{"id":"52000000-0000-0000-0000-000000000002","project_id":"30000000-0000-0000-0000-000000000001","report_date":"2026-10-14","report_start":"07:30","hours":7.5,"performer_type":"employee"}'::jsonb)$$, 'start- och sluttid');
select t.fails('ogiltigt klockslag nekas', $$select work_report_save('{"id":"52000000-0000-0000-0000-000000000003","project_id":"30000000-0000-0000-0000-000000000001","report_date":"2026-10-14","report_start":"25:99","report_end":"15:00","hours":1,"performer_type":"employee"}'::jsonb)$$);
select t.ok('timmar kan överstiga tiden mellan start och slut (flera uppdrag samtidigt)', (work_report_save('{"id":"52000000-0000-0000-0000-000000000004","project_id":"30000000-0000-0000-0000-000000000001","report_date":"2026-10-14","report_start":"08:00","report_end":"10:00","hours":5,"performer_type":"employee"}'::jsonb)).hours = 5);
select t.ok('rapport utan klockslag fungerar som förut', (work_report_save('{"id":"52000000-0000-0000-0000-000000000005","project_id":"30000000-0000-0000-0000-000000000001","report_date":"2026-10-14","hours":2,"performer_type":"employee"}'::jsonb)).report_start is null);
select t.as_user('00000000-0000-0000-0000-0000000000c1');
select t.ok('transportör kan rapportera med start och slut', (carrier_work_report_save('{"id":"62000000-0000-0000-0000-000000000001","project_id":"30000000-0000-0000-0000-000000000001","report_date":"2026-10-14","report_start":"06:00","report_end":"12:30","hours":6.5}'::jsonb) ->> 'id') is not null);
select t.ok('transportören ser klockslagen i sina rapporter', (select (r ->> 'report_start') = '06:00:00' from jsonb_array_elements(carrier_work_reports()) r where r ->> 'id' = '62000000-0000-0000-0000-000000000001'));
