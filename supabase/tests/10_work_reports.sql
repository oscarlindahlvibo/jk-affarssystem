\set ON_ERROR_STOP off
\set QUIET on
-- Testdata: två organisationer, personal i varje roll, en transportör och projekt.
select t.mk_user(u, e) from (values
  ('00000000-0000-0000-0000-0000000000a1'::uuid, 'admin@jk.test'),
  ('00000000-0000-0000-0000-0000000000a2'::uuid, 'pl@jk.test'),
  ('00000000-0000-0000-0000-0000000000a3'::uuid, 'eko@jk.test'),
  ('00000000-0000-0000-0000-0000000000a4'::uuid, 'las@jk.test'),
  ('00000000-0000-0000-0000-0000000000b1'::uuid, 'admin@other.test'),
  ('00000000-0000-0000-0000-0000000000c1'::uuid, 'driver@carrier.test'),
  ('00000000-0000-0000-0000-0000000000c2'::uuid, 'driver2@carrier.test')
) as v(u, e);

insert into organizations (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'JK'), ('10000000-0000-0000-0000-000000000002', 'Annat bolag');
insert into profiles (id, org_id, full_name, email, role, status) values
  ('00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'Admin Adam', 'admin@jk.test', 'admin', 'aktiv'),
  ('00000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000001', 'Pl Petra', 'pl@jk.test', 'projektledare', 'aktiv'),
  ('00000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-000000000001', 'Eko Erik', 'eko@jk.test', 'ekonomi', 'aktiv'),
  ('00000000-0000-0000-0000-0000000000a4', '10000000-0000-0000-0000-000000000001', 'Läs Lisa', 'las@jk.test', 'lasare', 'aktiv'),
  ('00000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000002', 'Admin Annat', 'admin@other.test', 'admin', 'aktiv');
insert into customers (id, org_id, company_name) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Kund A'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Kund Annat');
insert into projects (id, org_id, project_number, name, customer_id, status, price, cost) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'JK-2026-0900', 'Tilldelat projekt', '20000000-0000-0000-0000-000000000001', 'Bokad', 100000, 60000),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'JK-2026-0901', 'Ej tilldelat', '20000000-0000-0000-0000-000000000001', 'Bokad', 5, 5),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'X-0001', 'Annat bolags projekt', '20000000-0000-0000-0000-000000000002', 'Bokad', 1, 1);
insert into suppliers (id, org_id, company_name, type) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Transport AB', 'Åkeri'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Annan Åkeri AB', 'Åkeri');
insert into project_suppliers (project_id, supplier_id, is_primary) values
  ('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', true);
insert into carrier_users (id, org_id, supplier_id, full_name, email, status) values
  ('00000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Chaufför Carl', 'driver@carrier.test', 'aktiv'),
  ('00000000-0000-0000-0000-0000000000c2', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', 'Chaufför Dan', 'driver2@carrier.test', 'aktiv');
insert into locations (project_id, type, name, address, order_index) values
  ('30000000-0000-0000-0000-000000000001', 'lastning', 'Göteborg', 'Hamngatan 1', 0);
insert into cargo_items (project_id, description) values ('30000000-0000-0000-0000-000000000001', 'Transformator');

set role authenticated;

-- ===== Intern personal rapporterar arbete =====
select t.as_user('00000000-0000-0000-0000-0000000000a4');  -- läsare/anställd
select t.ok('anställd kan rapportera eget arbete (enbart väntetid)',
  (work_report_save('{"id":"50000000-0000-0000-0000-000000000001","project_id":"30000000-0000-0000-0000-000000000001","report_date":"2026-10-12","waiting_hours":1.5,"comment":"Väntade på lossning"}'::jsonb)).waiting_hours = 1.5);
select t.ok('rapport med bara körsträcka går att spara',
  (work_report_save('{"id":"50000000-0000-0000-0000-000000000002","project_id":"30000000-0000-0000-0000-000000000001","report_date":"2026-10-12","distance_km":180}'::jsonb)).distance_km = 180);
select t.fails('rapport utan något mätvärde nekas', $$select work_report_save('{"id":"50000000-0000-0000-0000-000000000003","project_id":"30000000-0000-0000-0000-000000000001","report_date":"2026-10-12","comment":"inget"}'::jsonb)$$, 'minst');
select t.fails('negativa värden nekas', $$select work_report_save('{"id":"50000000-0000-0000-0000-000000000004","project_id":"30000000-0000-0000-0000-000000000001","report_date":"2026-10-12","hours":-2}'::jsonb)$$);
select t.fails('anställd kan inte rapportera åt annan', $$select work_report_save('{"id":"50000000-0000-0000-0000-000000000005","project_id":"30000000-0000-0000-0000-000000000001","report_date":"2026-10-12","hours":2,"performer_profile_id":"00000000-0000-0000-0000-0000000000a2"}'::jsonb)$$, 'eget arbete');
select t.fails('anställd kan inte rapportera för extern transportör', $$select work_report_save('{"id":"50000000-0000-0000-0000-000000000006","project_id":"30000000-0000-0000-0000-000000000001","report_date":"2026-10-12","hours":2,"performer_type":"carrier","performer_supplier_id":"40000000-0000-0000-0000-000000000001"}'::jsonb)$$);
select t.fails('projekt i annan organisation nekas', $$select work_report_save('{"id":"50000000-0000-0000-0000-000000000007","project_id":"30000000-0000-0000-0000-000000000003","report_date":"2026-10-12","hours":2}'::jsonb)$$, 'Projektet');
select t.fails('datum långt fram i tiden nekas', $$select work_report_save('{"id":"50000000-0000-0000-0000-000000000008","project_id":"30000000-0000-0000-0000-000000000001","report_date":"2030-01-01","hours":2}'::jsonb)$$, 'datum');
select t.ok('anställd ser projektets rapporter', (select count(*) from work_reports) = 2);
select t.ok('anställd ser inte intern kostnad, justeringar eller priser',
  (select count(*) from work_report_costs) = 0 and (select count(*) from work_report_billing) = 0 and (select count(*) from billing_rates) = 0);

-- Intern kostnad bara för behöriga
select t.as_user('00000000-0000-0000-0000-0000000000a2');  -- projektledare
select t.ok('projektledare kan rapportera för extern transportör med intern kostnad',
  (work_report_save('{"id":"50000000-0000-0000-0000-000000000010","project_id":"30000000-0000-0000-0000-000000000001","report_date":"2026-10-13","hours":4.5,"distance_km":180,"waiting_hours":1,"performer_type":"carrier","performer_supplier_id":"40000000-0000-0000-0000-000000000001","internal_cost":3200}'::jsonb)).performer_name = 'Transport AB');
select t.ok('intern kostnad syns för behörig', (select internal_cost from work_report_costs where report_id = '50000000-0000-0000-0000-000000000010') = 3200);

select t.as_user('00000000-0000-0000-0000-0000000000a4');
select t.ok('anställd kan inte spara intern kostnad (ignoreras)',
  (work_report_save('{"id":"50000000-0000-0000-0000-000000000001","project_id":"30000000-0000-0000-0000-000000000001","report_date":"2026-10-12","waiting_hours":2,"internal_cost":999}'::jsonb)).waiting_hours = 2);
select t.as_user('00000000-0000-0000-0000-0000000000a3');  -- ekonomi
select t.ok('ingen intern kostnad skrevs av anställd', (select count(*) from work_report_costs where report_id = '50000000-0000-0000-0000-000000000001') = 0);

-- anställd ändrar inte annans rapport
select t.as_user('00000000-0000-0000-0000-0000000000a4');
select t.fails('anställd kan inte ändra annans rapport (id 10)', $$select work_report_save('{"id":"50000000-0000-0000-0000-000000000010","project_id":"30000000-0000-0000-0000-000000000001","report_date":"2026-10-13","hours":99}'::jsonb)$$, 'egna');
select t.fails('anställd kan inte radera annans rapport', $$select work_report_delete('50000000-0000-0000-0000-000000000010')$$, 'egna');

-- ===== Ekonomi: justera fakturerbart utan att ändra rapporten =====
select t.as_user('00000000-0000-0000-0000-0000000000a3');
select billing_rate_set(null, '30000000-0000-0000-0000-000000000001', 'hours', 950);
select billing_rate_set(null, '30000000-0000-0000-0000-000000000001', 'distance', 110);
select billing_rate_set('20000000-0000-0000-0000-000000000001', null, 'waiting', 650);
select t.ok('ekonomi ser priser', (select count(*) from billing_rates) = 3);
select t.ok('ekonomi kan justera fakturerbar tid utan att ändra rapporten', (
  select billable_hours from work_report_adjust_billing('50000000-0000-0000-0000-000000000010', '{"billable_hours":4,"adjust_reason":"Avrundat"}'::jsonb)) = 4);
select t.ok('ursprunglig rapport oförändrad (4,5 h)', (select hours from work_reports where id = '50000000-0000-0000-0000-000000000010') = 4.5);

-- ===== Fakturering och dubbeldebitering =====
select billing_mark_invoiced(array['50000000-0000-0000-0000-000000000010']::uuid[], '{}'::uuid[], 'F-1001');
select t.fails('samma rapport kan inte faktureras två gånger', $$select billing_mark_invoiced(array['50000000-0000-0000-0000-000000000010']::uuid[], '{}'::uuid[], 'F-1002')$$, 'Redan fakturerat');
select t.fails('fakturerad rapport kan inte ändras', $$select work_report_save('{"id":"50000000-0000-0000-0000-000000000010","project_id":"30000000-0000-0000-0000-000000000001","report_date":"2026-10-13","hours":1,"performer_type":"carrier","performer_supplier_id":"40000000-0000-0000-0000-000000000001"}'::jsonb)$$, 'fakturerad');
select t.fails('fakturerad rapport kan inte tas bort', $$select work_report_delete('50000000-0000-0000-0000-000000000010')$$, 'fakturerad');
select t.fails('fakturerad rapport kan inte justeras', $$select work_report_adjust_billing('50000000-0000-0000-0000-000000000010', '{"billable_hours":1}'::jsonb)$$, 'fakturerad');
select t.as_user('00000000-0000-0000-0000-0000000000a2');
select t.fails('projektledare kan inte ta bort faktureringsmarkering (spårbarhet)', $$select billing_clear_invoiced(array['50000000-0000-0000-0000-000000000010']::uuid[], '{}'::uuid[], 'fel')$$, 'admin eller ekonomi');
select t.as_user('00000000-0000-0000-0000-0000000000a3');
select t.fails('borttagning av markering kräver orsak', $$select billing_clear_invoiced(array['50000000-0000-0000-0000-000000000010']::uuid[], '{}'::uuid[], '')$$, 'orsak');
select billing_clear_invoiced(array['50000000-0000-0000-0000-000000000010']::uuid[], '{}'::uuid[], 'Kreditfaktura utfärdad');
select t.ok('markering borttagen', (select invoiced_at from work_report_billing where report_id = '50000000-0000-0000-0000-000000000010') is null);

reset role;
select t.ok('ändringen av faktureringsmarkering finns i loggen med orsak', exists (
  select 1 from billing_audit where table_name = 'work_report_billing' and reason = 'Kreditfaktura utfärdad'));
select t.ok('justeringen finns i ändringsloggen', (select count(*) from billing_audit where table_name = 'work_report_billing') >= 2);
set role authenticated;

-- ===== Transportör =====
select t.as_user('00000000-0000-0000-0000-0000000000c1');
select t.ok('transportör ser sina tilldelade uppdrag (1 st)', jsonb_array_length(carrier_assignments()) = 1);
select t.ok('transportörens uppdrag innehåller ingen ekonomi', not (carrier_assignments()::text ~* '(price|cost|invoice|pris|kostnad)'));
select t.ok('transportör kan rapportera på tilldelat uppdrag',
  (carrier_work_report_save('{"id":"60000000-0000-0000-0000-000000000001","project_id":"30000000-0000-0000-0000-000000000001","report_date":"2026-10-14","hours":6,"distance_km":240,"waiting_hours":0.5}'::jsonb)) ->> 'id' = '60000000-0000-0000-0000-000000000001');
select t.fails('transportör kan inte rapportera på ej tilldelat uppdrag', $$select carrier_work_report_save('{"id":"60000000-0000-0000-0000-000000000002","project_id":"30000000-0000-0000-0000-000000000002","report_date":"2026-10-14","hours":6}'::jsonb)$$, 'tilldelat');
select t.fails('transportör kan inte rapportera på annat bolags uppdrag', $$select carrier_work_report_save('{"id":"60000000-0000-0000-0000-000000000003","project_id":"30000000-0000-0000-0000-000000000003","report_date":"2026-10-14","hours":6}'::jsonb)$$, 'tilldelat');
select t.ok('transportör ser bara egna rapporter', jsonb_array_length(carrier_work_reports()) = 1);

-- Alla publika tabeller: transportören får inte läsa något annat än sin egen användarrad
do $$
declare r record; n bigint; leaked text := '';
begin
  for r in select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' loop
    execute format('select count(*) from public.%I', r.table_name) into n;
    if n > 0 and r.table_name <> 'carrier_users' then leaked := leaked || r.table_name || '(' || n || ') '; end if;
  end loop;
  if leaked = '' then raise notice 'ok   transportör har ingen direkt läsåtkomst till någon tabell utom egen användarrad';
  else raise notice 'FAIL transportör läser: %', leaked; end if;
end $$;
select t.fails('transportör kan inte skriva direkt i work_reports', $$insert into work_reports (org_id, project_id, report_date, performer_type, performer_name, hours, created_by) values ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','2026-10-14','carrier','x',1,'00000000-0000-0000-0000-0000000000c1')$$);
select t.fails('transportör kan inte anropa interna rapportfunktioner', $$select work_report_save('{"id":"60000000-0000-0000-0000-000000000009","project_id":"30000000-0000-0000-0000-000000000001","report_date":"2026-10-14","hours":1}'::jsonb)$$, 'nekas');
select t.fails('transportör kan inte justera fakturering', $$select work_report_adjust_billing('60000000-0000-0000-0000-000000000001','{"billable_hours":1}'::jsonb)$$, 'nekas');

-- Annan transportör ser/ändrar inte Carls rapport
select t.as_user('00000000-0000-0000-0000-0000000000c2');
select t.ok('annan transportör ser inga uppdrag', jsonb_array_length(carrier_assignments()) = 0);
select t.ok('annan transportör ser inga rapporter', jsonb_array_length(carrier_work_reports()) = 0);
select t.fails('annan transportör kan inte ändra Carls rapport', $$select carrier_work_report_save('{"id":"60000000-0000-0000-0000-000000000001","project_id":"30000000-0000-0000-0000-000000000001","report_date":"2026-10-14","hours":99}'::jsonb)$$, 'tilldelat');

-- Carl kan ändra tills JK behandlat rapporten
select t.as_user('00000000-0000-0000-0000-0000000000c1');
select t.ok('transportör kan ändra egen obehandlad rapport', (carrier_work_report_save('{"id":"60000000-0000-0000-0000-000000000001","project_id":"30000000-0000-0000-0000-000000000001","report_date":"2026-10-14","hours":7}'::jsonb)) is not null);
select t.as_user('00000000-0000-0000-0000-0000000000a3');
select work_report_adjust_billing('60000000-0000-0000-0000-000000000001', '{"billable_hours":6}'::jsonb);
select t.as_user('00000000-0000-0000-0000-0000000000c1');
select t.fails('transportör kan inte ändra rapport som JK justerat', $$select carrier_work_report_save('{"id":"60000000-0000-0000-0000-000000000001","project_id":"30000000-0000-0000-0000-000000000001","report_date":"2026-10-14","hours":1}'::jsonb)$$, 'behandlad');
select t.ok('låst-flagga visas för transportören', ((carrier_work_reports() -> 0) ->> 'locked')::boolean);

-- ===== Organisationsisolering =====
select t.as_user('00000000-0000-0000-0000-0000000000b1');
select t.ok('annan organisation ser inga rapporter', (select count(*) from work_reports) = 0);
select t.fails('annan organisation kan inte rapportera på vårt projekt', $$select work_report_save('{"id":"70000000-0000-0000-0000-000000000001","project_id":"30000000-0000-0000-0000-000000000001","report_date":"2026-10-12","hours":2}'::jsonb)$$, 'Projektet');
select t.fails('annan organisation kan inte sätta pris på vårt projekt', $$select billing_rate_set(null,'30000000-0000-0000-0000-000000000001','hours',1)$$, 'Projektet');
select t.ok('annan organisation ser inga transportörsanvändare', (select count(*) from carrier_users) = 0);
