-- Data som motsvarar en befintlig produktionsdatabas (migrationerna t.o.m. 0026), skapad INNAN 0027-0029 körs.
-- Används av scripts/test-sql.sh för att verifiera att de nya migrationerna fungerar på en databas med data
-- och att äldre data och äldre appversioners läsningar påverkas inte.
insert into auth.users (id, email, aud, role) values
  ('c0000000-0000-0000-0000-0000000000a1', 'legacy-admin@jk.test', 'authenticated', 'authenticated'),
  ('c0000000-0000-0000-0000-0000000000a2', 'legacy-las@jk.test', 'authenticated', 'authenticated');
insert into organizations (id, name) values ('c1000000-0000-0000-0000-000000000001', 'JK Legacy');
insert into profiles (id, org_id, full_name, email, role, status) values
  ('c0000000-0000-0000-0000-0000000000a1', 'c1000000-0000-0000-0000-000000000001', 'Legacy Admin', 'legacy-admin@jk.test', 'admin', 'aktiv'),
  ('c0000000-0000-0000-0000-0000000000a2', 'c1000000-0000-0000-0000-000000000001', 'Legacy Läsare', 'legacy-las@jk.test', 'lasare', 'aktiv');
insert into customers (id, org_id, company_name) values ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Gammal kund');
insert into projects (id, org_id, project_number, name, customer_id, status, price, cost) values
  ('c3000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'JK-2025-0100', 'Äldre projekt', 'c2000000-0000-0000-0000-000000000001', 'Fakturerad', 50000, 30000),
  ('c3000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'JK-2026-0100', 'Pågående projekt', 'c2000000-0000-0000-0000-000000000001', 'Bokad', 80000, 50000);
insert into tasks (id, project_id, task, assignee_id, status) values
  ('c4000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000002', 'Boka transport', 'c0000000-0000-0000-0000-0000000000a2', 'Pågående');
insert into suppliers (id, org_id, company_name, type) values ('c5000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Gammalt åkeri', 'Åkeri');
insert into project_suppliers (project_id, supplier_id, is_primary) values ('c3000000-0000-0000-0000-000000000002', 'c5000000-0000-0000-0000-000000000001', true);
insert into locations (project_id, type, name, address, order_index) values ('c3000000-0000-0000-0000-000000000002', 'lastning', 'Malmö', 'Hamnen 1', 0);
insert into time_entries (id, org_id, user_id, project_id, project_label, task_id, category_key, entry_type, start_time, end_time, total_minutes, source) values
  ('c6000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-0000000000a2', 'c3000000-0000-0000-0000-000000000002', 'JK-2026-0100', 'c4000000-0000-0000-0000-000000000001', 'bokning', 'work', '2026-09-10T06:00:00Z', '2026-09-10T08:30:00Z', 150, 'clock');
