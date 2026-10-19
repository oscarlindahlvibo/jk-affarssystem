\set ON_ERROR_STOP off
\set QUIET on
-- Testdata: egen organisation och personal i varje roll.
select t.mk_user(u, e) from (values
  ('81000000-0000-0000-0000-000000000001'::uuid, 'p-admin@t.test'),
  ('81000000-0000-0000-0000-000000000002'::uuid, 'p-pl@t.test'),
  ('81000000-0000-0000-0000-000000000003'::uuid, 'p-eko@t.test'),
  ('81000000-0000-0000-0000-000000000004'::uuid, 'p-emp1@t.test'),
  ('81000000-0000-0000-0000-000000000005'::uuid, 'p-emp2@t.test'),
  ('82000000-0000-0000-0000-000000000001'::uuid, 'o-admin@t.test'),
  ('83000000-0000-0000-0000-000000000001'::uuid, 'p-carrier@t.test')
) as v(u, e);
insert into organizations (id, name) values
  ('91000000-0000-0000-0000-000000000001', 'Lön-org'), ('92000000-0000-0000-0000-000000000001', 'Annan lön-org');
insert into profiles (id, org_id, full_name, email, role, status) values
  ('81000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'Admin', 'p-admin@t.test', 'admin', 'aktiv'),
  ('81000000-0000-0000-0000-000000000002', '91000000-0000-0000-0000-000000000001', 'Projektledare', 'p-pl@t.test', 'projektledare', 'aktiv'),
  ('81000000-0000-0000-0000-000000000003', '91000000-0000-0000-0000-000000000001', 'Ekonomi', 'p-eko@t.test', 'ekonomi', 'aktiv'),
  ('81000000-0000-0000-0000-000000000004', '91000000-0000-0000-0000-000000000001', 'Anställd 1', 'p-emp1@t.test', 'lasare', 'aktiv'),
  ('81000000-0000-0000-0000-000000000005', '91000000-0000-0000-0000-000000000001', 'Anställd 2', 'p-emp2@t.test', 'lasare', 'aktiv'),
  ('82000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000001', 'Annan admin', 'o-admin@t.test', 'admin', 'aktiv');
insert into suppliers (id, org_id, company_name, type) values ('93000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'Åkeri', 'Åkeri');
insert into carrier_users (id, org_id, supplier_id, full_name, email, status) values
  ('83000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000001', 'Carrier', 'p-carrier@t.test', 'aktiv');

set role authenticated;

-- ===== Stämpelklockan: in, rast, lunch, ut =====
select t.as_user('81000000-0000-0000-0000-000000000004');
select t.ok('anställd kan stämpla in utan projekt eller kategori',
  (attendance_clock_transition('a0000000-0000-0000-0000-000000000001', 'clockin', null, now() - interval '14 minutes', 'Start')) -> 'current' ->> 'entry_type' = 'work');
select t.ok('omförsök med samma id ger samma resultat utan dubbel post', (select count(*) from attendance_entries where user_id = '81000000-0000-0000-0000-000000000004') = 1
  and (attendance_clock_transition('a0000000-0000-0000-0000-000000000001', 'clockin', null, now() - interval '14 minutes', 'Start')) is not null
  and (select count(*) from attendance_entries where user_id = '81000000-0000-0000-0000-000000000004') = 1);
select t.fails('dubbel instämpling (annan enhet) nekas', $$select attendance_clock_transition('a0000000-0000-0000-0000-000000000002', 'clockin', null, now() - interval '13 minutes')$$, 'CLOCK_STATE_CONFLICT');
select t.ok('lunch stänger arbetspasset och startar lunch', (attendance_clock_transition('a0000000-0000-0000-0000-000000000003', 'lunch', 'a0000000-0000-0000-0000-000000000001', now() - interval '10 minutes', 'Förmiddag klar')) -> 'current' ->> 'entry_type' = 'lunch');
select t.fails('två enheter med samma förväntade pass: den andra får konflikt', $$select attendance_clock_transition('a0000000-0000-0000-0000-000000000004', 'resume', 'a0000000-0000-0000-0000-000000000001', now() - interval '9 minutes')$$, 'CLOCK_STATE_CONFLICT');
select t.ok('återgång till arbete efter lunch', (attendance_clock_transition('a0000000-0000-0000-0000-000000000005', 'resume', 'a0000000-0000-0000-0000-000000000003', now() - interval '9 minutes')) -> 'current' ->> 'entry_type' = 'work');
select t.ok('utstämpling med anteckning', (attendance_clock_transition('a0000000-0000-0000-0000-000000000006', 'clockout', 'a0000000-0000-0000-0000-000000000005', now() - interval '3 minutes', 'Klar för dagen')) ->> 'current' is null);
select t.ok('arbetad tid 10 min och lunch 1 min enligt stämplingarna',
  (select sum(total_minutes) from attendance_entries where user_id = '81000000-0000-0000-0000-000000000004' and entry_type = 'work') = 10
  and (select total_minutes from attendance_entries where entry_type = 'lunch' and user_id = '81000000-0000-0000-0000-000000000004') = 1);
select t.ok('ingen öppen post kvar', (select count(*) from attendance_entries where end_time is null and user_id = '81000000-0000-0000-0000-000000000004') = 0);
select t.fails('utstämpling utan pågående pass nekas', $$select attendance_clock_transition('a0000000-0000-0000-0000-000000000007', 'clockout', null, now() - interval '1 minute')$$, 'Ingen pågående');
select t.fails('stämpling långt fram i tiden nekas', $$select attendance_clock_transition('a0000000-0000-0000-0000-000000000008', 'clockin', null, '2030-01-01T05:00:00Z')$$, 'Ogiltig');
select t.fails('backdaterad stämpling (2 timmar bakåt) nekas, missad tid läggs in manuellt', $$select attendance_clock_transition('a0000000-0000-0000-0000-000000000009', 'clockin', null, now() - interval '2 hours')$$, 'Ogiltig');
select t.fails('direkt skrivning i attendance_entries nekas', $$insert into attendance_entries (org_id, user_id, start_time, end_time) values ('91000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000004','2026-09-15T05:00:00Z','2026-09-15T06:00:00Z')$$);
-- Måndag 14 sep: 07:00-17:00 svensk tid med 30 min lunch (9,5 h arbetad tid) som missad stämpling
select t.ok('en hel arbetsdag med lunch kan läggas in som missad stämpling', attendance_add_entries('[
  {"id":"b0000000-0000-0000-0000-000000000021","type":"work","start":"2026-09-14T05:00:00Z","end":"2026-09-14T10:00:00Z"},
  {"id":"b0000000-0000-0000-0000-000000000022","type":"lunch","start":"2026-09-14T10:00:00Z","end":"2026-09-14T10:30:00Z"},
  {"id":"b0000000-0000-0000-0000-000000000023","type":"work","start":"2026-09-14T10:30:00Z","end":"2026-09-14T15:00:00Z"}]'::jsonb) = 3);
select t.ok('arbetad tid 14 sep är 9,5 h', (select sum(total_minutes) from attendance_entries where user_id = '81000000-0000-0000-0000-000000000004' and entry_type = 'work' and start_time::date = '2026-09-14') = 570);

-- ===== Missad stämpling =====
select t.ok('missad dag kan läggas in med lunch (3 pass atomiskt)', attendance_add_entries('[
  {"id":"b0000000-0000-0000-0000-000000000001","type":"work","start":"2026-09-15T05:00:00Z","end":"2026-09-15T10:00:00Z"},
  {"id":"b0000000-0000-0000-0000-000000000002","type":"lunch","start":"2026-09-15T10:00:00Z","end":"2026-09-15T10:30:00Z"},
  {"id":"b0000000-0000-0000-0000-000000000003","type":"work","start":"2026-09-15T10:30:00Z","end":"2026-09-15T15:00:00Z"}]'::jsonb) = 3);
select t.fails('överlappande pass nekas och inget sparas (atomiskt)', $$select attendance_add_entries('[
  {"id":"b0000000-0000-0000-0000-000000000010","type":"work","start":"2026-09-16T05:00:00Z","end":"2026-09-16T08:00:00Z"},
  {"id":"b0000000-0000-0000-0000-000000000011","type":"work","start":"2026-09-16T07:00:00Z","end":"2026-09-16T09:00:00Z"}]'::jsonb)$$, 'överlappar');
select t.ok('inget av de överlappande passen sparades', (select count(*) from attendance_entries where id in ('b0000000-0000-0000-0000-000000000010','b0000000-0000-0000-0000-000000000011')) = 0);
select t.fails('pass som överlappar befintligt nekas', $$select attendance_add_entries('[{"type":"work","start":"2026-09-14T08:00:00Z","end":"2026-09-14T09:00:00Z"}]'::jsonb)$$, 'överlappar');
select t.fails('pass i framtiden nekas', $$select attendance_add_entries('[{"type":"work","start":"2030-09-14T08:00:00Z","end":"2030-09-14T09:00:00Z"}]'::jsonb)$$, 'framtiden');
select t.fails('pass längre än 24 h nekas', $$select attendance_add_entries('[{"type":"work","start":"2026-09-10T08:00:00Z","end":"2026-09-11T10:00:00Z"}]'::jsonb)$$, '24 timmar');
select t.fails('anställd kan inte lägga in tid åt kollega', $$select attendance_add_entries('[{"type":"work","start":"2026-09-17T05:00:00Z","end":"2026-09-17T06:00:00Z"}]'::jsonb, '81000000-0000-0000-0000-000000000005', 'x')$$, 'nekas');
select t.ok('anställd ser bara egna pass', (select count(distinct user_id) from attendance_entries) = 1);

-- ===== Korrigeringsförfrågan, godkännande och revisionshistorik =====
select t.ok('anställd kan föreslå rättelse (ändra sluttid)', (attendance_request_correction('c0000000-0000-0000-0000-000000000001', 'change', 'b0000000-0000-0000-0000-000000000003', 'work', '2026-09-15T10:30:00Z', '2026-09-15T15:30:00Z', 'Glömde stämpla ut')).status = 'pending');
select t.fails('förfrågan utan orsak nekas', $$select attendance_request_correction('c0000000-0000-0000-0000-000000000002', 'change', 'b0000000-0000-0000-0000-000000000003', 'work', '2026-09-15T10:30:00Z', '2026-09-15T15:30:00Z', '')$$, 'orsak');
select t.fails('anställd kan inte godkänna rättelse', $$select attendance_decide_correction('c0000000-0000-0000-0000-000000000001', true, '')$$, 'nekas');
select t.as_user('81000000-0000-0000-0000-000000000002');
select t.ok('projektledare ser förfrågan', (select count(*) from attendance_corrections) = 1);
select t.ok('projektledare godkänner rättelsen', (attendance_decide_correction('c0000000-0000-0000-0000-000000000001', true, 'Ok')).status = 'approved');
select t.ok('passet ändrades', (select end_time from attendance_entries where id = 'b0000000-0000-0000-0000-000000000003') = '2026-09-15T15:30:00Z');
select t.ok('revisionshistoriken har ursprunglig och ny registrering, orsak och vem', exists (
  select 1 from attendance_audit where entry_id = 'b0000000-0000-0000-0000-000000000003' and action = 'update'
    and reason like '%Glömde stämpla ut%' and before ->> 'end_time' <> after ->> 'end_time' and changed_by = '81000000-0000-0000-0000-000000000002'));
select t.fails('förfrågan kan inte hanteras två gånger', $$select attendance_decide_correction('c0000000-0000-0000-0000-000000000001', true, '')$$, 'redan hanterad');

-- ===== Åtkomst per roll =====
select t.ok('projektledare ser alla anställdas pass', (select count(distinct user_id) from attendance_entries) >= 1);
select t.as_user('81000000-0000-0000-0000-000000000005');
select t.ok('anställd 2 ser inte anställd 1:s pass eller revisionshistorik', (select count(*) from attendance_entries) = 0 and (select count(*) from attendance_audit) = 0);
select t.as_user('81000000-0000-0000-0000-000000000003');
select t.ok('ekonomi ser personalens pass (löneadministration)', (select count(*) from attendance_entries) > 0);
select t.as_user('82000000-0000-0000-0000-000000000001');
select t.ok('annan organisation ser ingenting', (select count(*) from attendance_entries) = 0 and (select count(*) from payroll_periods) = 0);
select t.fails('annan organisation kan inte attestera/lägga in tid åt vår personal', $$select attendance_add_entries('[{"type":"work","start":"2026-09-17T05:00:00Z","end":"2026-09-17T06:00:00Z"}]'::jsonb, '81000000-0000-0000-0000-000000000004', 'x')$$, 'hittades inte');

-- ===== Scheman, regler och lönekoder =====
select t.as_user('81000000-0000-0000-0000-000000000003');  -- ekonomi
select t.ok('ekonomi kan spara schema för anställd', (employee_terms_save('{"user_id":"81000000-0000-0000-0000-000000000004","valid_from":"2026-01-01","employment_number":"1001","employment_type":"tillsvidare","weekly_hours":40,"employment_rate":100,"schedule":{"mon":480,"tue":480,"wed":480,"thu":480,"fri":480,"sat":0,"sun":0},"external_employee_ref":"S-17"}'::jsonb)).employment_number = '1001');
select t.fails('ogiltigt schema nekas', $$select employee_terms_save('{"user_id":"81000000-0000-0000-0000-000000000004","valid_from":"2026-02-01","schedule":{"mon":480}}'::jsonb)$$, 'schema');
select t.ok('ny schemaversion med giltighetsdatum', (employee_terms_save('{"user_id":"81000000-0000-0000-0000-000000000004","valid_from":"2026-10-01","schedule":{"mon":600,"tue":600,"wed":600,"thu":600,"fri":0,"sat":0,"sun":0}}'::jsonb)).valid_from = '2026-10-01');
select t.ok('regeluppsättning kan sparas', (overtime_rule_set_save(null, 'Test', '{"version":1,"dayBucketing":"start_day","tierScope":"day","tiers":[{"key":"overtime_1","label":"Övertid 1","upToMinutes":120},{"key":"overtime_2","label":"Övertid 2","upToMinutes":null}],"autoBreak":{"enabled":false}}'::jsonb, true)).name = 'Test');
select t.fails('regelmall utan övertidsnivåer nekas', $$select overtime_rule_set_save(null, 'Tom', '{"version":1,"tiers":[]}'::jsonb, true)$$, 'Ogiltig');
select t.fails('regelmall med fallande gränser nekas', $$select overtime_rule_set_save(null, 'Fel', '{"version":1,"tiers":[{"key":"a","upToMinutes":120},{"key":"b","upToMinutes":60}]}'::jsonb, true)$$, 'Ogiltig');
select t.ok('ny regelmall är inte godkänd', (select approved_at is null from overtime_rule_sets where name = 'Test'));
select t.fails('ekonomi kan inte godkänna regelmall (endast admin)', $$select overtime_rule_set_approve((select id from overtime_rule_sets where name = 'Test'), 'Kollektivavtal')$$, 'admin');
select employee_terms_save(jsonb_build_object('user_id','81000000-0000-0000-0000-000000000004','valid_from','2026-01-01','employment_number','1001','employment_type','tillsvidare','weekly_hours',40,'employment_rate',100,'schedule','{"mon":480,"tue":480,"wed":480,"thu":480,"fri":480,"sat":0,"sun":0}'::jsonb,'external_employee_ref','S-17','rule_set_id',(select id from overtime_rule_sets where name = 'Test')));
select t.ok('schemat pekar på regelmallen', (select rule_set_id is not null from employee_terms where valid_from = '2026-01-01' and user_id = '81000000-0000-0000-0000-000000000004'));
select t.ok('lönekod kan mappas', (payroll_code_mapping_save('overtime_1', '210', 'Övertid enkel')).external_code = '210');
select t.as_user('81000000-0000-0000-0000-000000000004');
select t.fails('anställd kan inte spara schema', $$select employee_terms_save('{"user_id":"81000000-0000-0000-0000-000000000004","valid_from":"2026-03-01","schedule":{"mon":480,"tue":480,"wed":480,"thu":480,"fri":480,"sat":0,"sun":0}}'::jsonb)$$, 'nekas');
select t.fails('anställd kan inte spara lönekod', $$select payroll_code_mapping_save('x','1','x')$$, 'nekas');
select t.ok('anställd ser sitt eget schema men inte lönekoder', (select count(*) from employee_terms) = 2 and (select count(*) from payroll_code_mappings) = 0);
select t.as_user('81000000-0000-0000-0000-000000000005');
select t.ok('anställd 2 ser inte andras scheman', (select count(*) from employee_terms) = 0);

-- ===== Frånvaro =====
select t.as_user('81000000-0000-0000-0000-000000000002');
select t.ok('projektledare kan registrera frånvaro med orsak', (attendance_absence_save('d0000000-0000-0000-0000-000000000001', '81000000-0000-0000-0000-000000000004', '2026-09-18', 'absence_sick', 480, 'Sjuk', 'Sjukanmälan')).minutes = 480);
select t.fails('frånvaro kräver orsak', $$select attendance_absence_save(null, '81000000-0000-0000-0000-000000000004', '2026-09-19', 'absence_sick', 480, '', '')$$, 'orsak');
select t.as_user('81000000-0000-0000-0000-000000000004');
select t.fails('anställd kan inte registrera frånvaro direkt', $$select attendance_absence_save(null, '81000000-0000-0000-0000-000000000004', '2026-09-19', 'absence_sick', 480, '', 'x')$$, 'nekas');
select t.ok('anställd ser sin frånvaro', (select count(*) from attendance_absences) = 1);

-- ===== Löneperiod, inlämning, attest =====
select t.as_user('81000000-0000-0000-0000-000000000003');
select t.ok('ekonomi skapar löneperiod', (payroll_period_create('September 2026', '2026-09-01', '2026-09-30')).name = 'September 2026');
select t.fails('överlappande löneperiod nekas', $$select payroll_period_create('Dubbel', '2026-09-15', '2026-10-15')$$, 'överlappar');
select t.as_user('81000000-0000-0000-0000-000000000004');
select t.fails('anställd kan inte skapa löneperiod', $$select payroll_period_create('X', '2026-11-01', '2026-11-30')$$, 'nekas');
select t.ok('anställd skickar in sin period', (payroll_statement_submit((select id from payroll_periods where name = 'September 2026'))).status = 'submitted');
select t.as_user('81000000-0000-0000-0000-000000000002');
select t.fails('ogiltigt löneunderlag nekas', $$select payroll_statement_attest((select id from payroll_periods limit 1), '81000000-0000-0000-0000-000000000004', '{"x":1}'::jsonb, '[]'::jsonb, 'x')$$, 'ändrats');
select t.fails('attest nekas när regelmallen inte är godkänd', $$select payroll_statement_attest((select id from payroll_periods limit 1), '81000000-0000-0000-0000-000000000004', '{"days":3,"scheduledMinutes":1440,"workedMinutes":1170,"breakMinutes":60,"ordinaryMinutes":960,"overtime":{"overtime_1":210},"absence":{"absence_sick":480},"openEntryIds":[]}'::jsonb,
  jsonb_build_array(
    jsonb_build_object('date','2026-09-14','scheduledMinutes',480,'workedMinutes',570,'breakMinutes',30,'ordinaryMinutes',480,'overtime','{"overtime_1":90}'::jsonb,'absence','{}'::jsonb),
    jsonb_build_object('date','2026-09-15','scheduledMinutes',480,'workedMinutes',600,'breakMinutes',30,'ordinaryMinutes',480,'overtime','{"overtime_1":120}'::jsonb,'absence','{}'::jsonb),
    jsonb_build_object('date','2026-09-18','scheduledMinutes',480,'workedMinutes',0,'breakMinutes',0,'ordinaryMinutes',0,'overtime','{}'::jsonb,'absence','{"absence_sick":480}'::jsonb)), (payroll_inputs((select id from payroll_periods where name = 'September 2026'), '81000000-0000-0000-0000-000000000004') ->> 'fingerprint'))$$, 'inte godkänd');
select t.as_user('81000000-0000-0000-0000-000000000001');
select t.ok('admin godkänner regelmallen med underlag', (overtime_rule_set_approve((select id from overtime_rule_sets where name = 'Test'), 'Exempelavtal 2026-09')).approved_at is not null);
select t.as_user('81000000-0000-0000-0000-000000000002');
select t.fails('gammalt/felaktigt fingeravtryck nekas', $$select payroll_statement_attest((select id from payroll_periods limit 1), '81000000-0000-0000-0000-000000000004', '{"days":3,"scheduledMinutes":1440,"workedMinutes":1170,"breakMinutes":60,"ordinaryMinutes":960,"overtime":{"overtime_1":210},"absence":{"absence_sick":480},"openEntryIds":[]}'::jsonb, '[]'::jsonb, 'gammalt')$$, 'ändrats');
select t.fails('manipulerad arbetad tid nekas (1200 i stället för 1170)', $$select payroll_statement_attest((select id from payroll_periods limit 1), '81000000-0000-0000-0000-000000000004', '{"days":3,"scheduledMinutes":1440,"workedMinutes":1200,"breakMinutes":60,"ordinaryMinutes":960,"overtime":{"overtime_1":210},"absence":{"absence_sick":480},"openEntryIds":[]}'::jsonb,
  jsonb_build_array(
    jsonb_build_object('date','2026-09-14','scheduledMinutes',480,'workedMinutes',570,'breakMinutes',30,'ordinaryMinutes',480,'overtime','{"overtime_1":90}'::jsonb,'absence','{}'::jsonb),
    jsonb_build_object('date','2026-09-15','scheduledMinutes',480,'workedMinutes',630,'breakMinutes',30,'ordinaryMinutes',480,'overtime','{"overtime_1":120}'::jsonb,'absence','{}'::jsonb),
    jsonb_build_object('date','2026-09-18','scheduledMinutes',480,'workedMinutes',0,'breakMinutes',0,'ordinaryMinutes',0,'overtime','{}'::jsonb,'absence','{"absence_sick":480}'::jsonb)), (payroll_inputs((select id from payroll_periods where name = 'September 2026'), '81000000-0000-0000-0000-000000000004') ->> 'fingerprint'))$$, 'stämmer inte');
select t.fails('övertid som inte summerar till arbetad tid nekas', $$select payroll_statement_attest((select id from payroll_periods limit 1), '81000000-0000-0000-0000-000000000004', '{"days":3,"scheduledMinutes":1440,"workedMinutes":1170,"breakMinutes":60,"ordinaryMinutes":960,"overtime":{"overtime_1":210},"absence":{"absence_sick":480},"openEntryIds":[]}'::jsonb,
  jsonb_build_array(
    jsonb_build_object('date','2026-09-14','scheduledMinutes',480,'workedMinutes',570,'breakMinutes',30,'ordinaryMinutes',480,'overtime','{"overtime_1":90}'::jsonb,'absence','{}'::jsonb),
    jsonb_build_object('date','2026-09-15','scheduledMinutes',480,'workedMinutes',600,'breakMinutes',30,'ordinaryMinutes',480,'overtime','{"overtime_1":100}'::jsonb,'absence','{}'::jsonb),
    jsonb_build_object('date','2026-09-18','scheduledMinutes',480,'workedMinutes',0,'breakMinutes',0,'ordinaryMinutes',0,'overtime','{}'::jsonb,'absence','{"absence_sick":480}'::jsonb)), (payroll_inputs((select id from payroll_periods where name = 'September 2026'), '81000000-0000-0000-0000-000000000004') ->> 'fingerprint'))$$, 'summerar');
select t.fails('ordinarie tid över schemat nekas', $$select payroll_statement_attest((select id from payroll_periods limit 1), '81000000-0000-0000-0000-000000000004', '{"days":3,"scheduledMinutes":1440,"workedMinutes":1170,"breakMinutes":60,"ordinaryMinutes":1050,"overtime":{"overtime_1":120},"absence":{"absence_sick":480},"openEntryIds":[]}'::jsonb,
  jsonb_build_array(
    jsonb_build_object('date','2026-09-14','scheduledMinutes',480,'workedMinutes',570,'breakMinutes',30,'ordinaryMinutes',570,'overtime','{}'::jsonb,'absence','{}'::jsonb),
    jsonb_build_object('date','2026-09-15','scheduledMinutes',480,'workedMinutes',600,'breakMinutes',30,'ordinaryMinutes',480,'overtime','{"overtime_1":120}'::jsonb,'absence','{}'::jsonb),
    jsonb_build_object('date','2026-09-18','scheduledMinutes',480,'workedMinutes',0,'breakMinutes',0,'ordinaryMinutes',0,'overtime','{}'::jsonb,'absence','{"absence_sick":480}'::jsonb)), (payroll_inputs((select id from payroll_periods where name = 'September 2026'), '81000000-0000-0000-0000-000000000004') ->> 'fingerprint'))$$, 'överstiger');
select t.fails('okänd övertidstyp nekas', $$select payroll_statement_attest((select id from payroll_periods limit 1), '81000000-0000-0000-0000-000000000004', '{"days":3,"scheduledMinutes":1440,"workedMinutes":1170,"breakMinutes":60,"ordinaryMinutes":960,"overtime":{"hittepå":210},"absence":{"absence_sick":480},"openEntryIds":[]}'::jsonb,
  jsonb_build_array(
    jsonb_build_object('date','2026-09-14','scheduledMinutes',480,'workedMinutes',570,'breakMinutes',30,'ordinaryMinutes',480,'overtime','{"hittepå":90}'::jsonb,'absence','{}'::jsonb),
    jsonb_build_object('date','2026-09-15','scheduledMinutes',480,'workedMinutes',600,'breakMinutes',30,'ordinaryMinutes',480,'overtime','{"hittepå":120}'::jsonb,'absence','{}'::jsonb),
    jsonb_build_object('date','2026-09-18','scheduledMinutes',480,'workedMinutes',0,'breakMinutes',0,'ordinaryMinutes',0,'overtime','{}'::jsonb,'absence','{"absence_sick":480}'::jsonb)), (payroll_inputs((select id from payroll_periods where name = 'September 2026'), '81000000-0000-0000-0000-000000000004') ->> 'fingerprint'))$$, 'Okänd övertidstyp');
select t.fails('frånvarodag som utelämnas nekas', $$select payroll_statement_attest((select id from payroll_periods limit 1), '81000000-0000-0000-0000-000000000004', '{"days":2,"scheduledMinutes":960,"workedMinutes":1170,"breakMinutes":60,"ordinaryMinutes":960,"overtime":{"overtime_1":210},"absence":{"absence_sick":480},"openEntryIds":[]}'::jsonb,
  jsonb_build_array(jsonb_build_object('date','2026-09-14','scheduledMinutes',480,'workedMinutes',570,'breakMinutes',30,'ordinaryMinutes',480,'overtime','{"overtime_1":90}'::jsonb,'absence','{}'::jsonb), jsonb_build_object('date','2026-09-15','scheduledMinutes',480,'workedMinutes',600,'breakMinutes',30,'ordinaryMinutes',480,'overtime','{"overtime_1":120}'::jsonb,'absence','{}'::jsonb)), (payroll_inputs((select id from payroll_periods where name = 'September 2026'), '81000000-0000-0000-0000-000000000004') ->> 'fingerprint'))$$, 'saknar dagar');
select t.ok('projektledare attesterar med verifierat underlag', (payroll_statement_attest((select id from payroll_periods limit 1), '81000000-0000-0000-0000-000000000004',
  '{"days":3,"scheduledMinutes":1440,"workedMinutes":1170,"breakMinutes":60,"ordinaryMinutes":960,"overtime":{"overtime_1":210},"absence":{"absence_sick":480},"openEntryIds":[]}'::jsonb, jsonb_build_array(
    jsonb_build_object('date','2026-09-14','scheduledMinutes',480,'workedMinutes',570,'breakMinutes',30,'ordinaryMinutes',480,'overtime','{"overtime_1":90}'::jsonb,'absence','{}'::jsonb),
    jsonb_build_object('date','2026-09-15','scheduledMinutes',480,'workedMinutes',600,'breakMinutes',30,'ordinaryMinutes',480,'overtime','{"overtime_1":120}'::jsonb,'absence','{}'::jsonb),
    jsonb_build_object('date','2026-09-18','scheduledMinutes',480,'workedMinutes',0,'breakMinutes',0,'ordinaryMinutes',0,'overtime','{}'::jsonb,'absence','{"absence_sick":480}'::jsonb)), (payroll_inputs((select id from payroll_periods where name = 'September 2026'), '81000000-0000-0000-0000-000000000004') ->> 'fingerprint'))).status = 'attested');
select t.ok('serverns regelkopia sparades (inte klientens)', (select rule_snapshot -> 'ruleSets' -> 0 ->> 'name' = 'Test' and input_fingerprint is not null from payroll_statements limit 1));
select t.fails('projektledare kan inte attestera egen tid', $$select payroll_statement_attest((select id from payroll_periods limit 1), '81000000-0000-0000-0000-000000000002', '{"workedMinutes":0}'::jsonb, '[]'::jsonb, 'x')$$, 'egen');
select t.fails('redan attesterad period kan inte attesteras igen', $$select payroll_statement_attest((select id from payroll_periods limit 1), '81000000-0000-0000-0000-000000000004', '{"workedMinutes":1}'::jsonb, '[]'::jsonb, 'x')$$, 'redan attesterad');

-- Låst period
select t.as_user('81000000-0000-0000-0000-000000000004');
select t.fails('anställd kan inte ändra pass i attesterad period', $$select attendance_change_entry('b0000000-0000-0000-0000-000000000001', 'work', '2026-09-15T04:30:00Z', '2026-09-15T10:00:00Z', '', 'x')$$, 'attesterad');
select t.fails('anställd kan inte lägga in tid i attesterad period', $$select attendance_add_entries('[{"type":"work","start":"2026-09-22T05:00:00Z","end":"2026-09-22T06:00:00Z"}]'::jsonb)$$, 'attesterad');
select t.fails('anställd kan inte ta bort pass i attesterad period', $$select attendance_delete_entry('b0000000-0000-0000-0000-000000000001', 'x')$$, 'attesterad');
select t.as_user('81000000-0000-0000-0000-000000000003');
select t.fails('ekonomi kan inte registrera frånvaro i attesterad period', $$select attendance_absence_save(null, '81000000-0000-0000-0000-000000000004', '2026-09-24', 'absence_sick', 60, '', 'x')$$, 'attesterad');

-- Granskning och export
select t.as_user('81000000-0000-0000-0000-000000000002');
select t.fails('projektledare kan inte exportera', $$select payroll_export_create((select id from payroll_periods limit 1), array[(select id from payroll_statements limit 1)], 'csv', 'c', 1, false, null)$$, 'admin eller ekonomi');
select t.as_user('81000000-0000-0000-0000-000000000003');
select t.fails('export av ogranskad sammanställning nekas', $$select payroll_export_create((select id from payroll_periods limit 1), array[(select id from payroll_statements limit 1)], 'csv', 'c', 1, false, null)$$, 'granskade');
select t.ok('ekonomi granskar', (payroll_statement_review((select id from payroll_statements limit 1))).status = 'reviewed');
select t.ok('ekonomi exporterar', payroll_export_create((select id from payroll_periods limit 1), array[(select id from payroll_statements limit 1)], 'csv', 'abc123', 3, false, null) is not null);
select t.ok('status är exporterad', (select status from payroll_statements limit 1) = 'exported');
select t.fails('dubbel export nekas utan bekräftelse', $$select payroll_export_create((select id from payroll_periods limit 1), array[(select id from payroll_statements limit 1)], 'csv', 'abc123', 3, false, null)$$, 'Redan exporterat');
select t.fails('dubbel export kräver orsak även med bekräftelse', $$select payroll_export_create((select id from payroll_periods limit 1), array[(select id from payroll_statements limit 1)], 'csv', 'abc123', 3, true, '')$$, 'Redan exporterat');
select t.ok('ny export kan göras med uttrycklig bekräftelse och orsak (loggas som reexport)', payroll_export_create((select id from payroll_periods limit 1), array[(select id from payroll_statements limit 1)], 'xlsx', 'def456', 3, true, 'Ulrika behövde filen igen') is not null);
select t.ok('exportloggen har båda exporterna', (select count(*) from payroll_exports) = 2 and exists (select 1 from payroll_exports where kind = 'reexport' and reason = 'Ulrika behövde filen igen'));

-- Rättelse av exporterad tid ska vara spårbar
select t.as_user('81000000-0000-0000-0000-000000000002');
select t.fails('projektledare kan inte ändra exporterad period', $$select attendance_change_entry('b0000000-0000-0000-0000-000000000001', 'work', '2026-09-15T04:30:00Z', '2026-09-15T10:00:00Z', '', 'x')$$, 'exporterad');
select t.as_user('81000000-0000-0000-0000-000000000001');
select t.fails('rättelse av exporterad tid kräver orsak', $$select attendance_change_entry('b0000000-0000-0000-0000-000000000001', 'work', '2026-09-15T04:30:00Z', '2026-09-15T10:00:00Z', '', '')$$, 'orsak');
select t.ok('admin kan rätta exporterad tid med orsak', (attendance_change_entry('b0000000-0000-0000-0000-000000000001', 'work', '2026-09-15T04:30:00Z', '2026-09-15T10:00:00Z', '', 'Glömd arbetstid, rättelse')).total_minutes = 330);
select t.ok('rättelsen flaggas (inte tyst överskrivning)', (select pending_adjustment from payroll_statements limit 1));
select t.as_user('81000000-0000-0000-0000-000000000003');
select t.fails('ny export blockeras tills rättelsen registrerats', $$select payroll_export_create((select id from payroll_periods limit 1), array[(select id from payroll_statements limit 1)], 'csv', 'zzz', 1, false, null)$$, 'rättelse väntar');
select t.fails('rättelse med felaktig beräkning nekas', $$select payroll_record_adjustment((select id from payroll_statements limit 1), '{"days":3,"scheduledMinutes":1440,"workedMinutes":1170,"breakMinutes":60,"ordinaryMinutes":960,"overtime":{"overtime_1":210},"absence":{"absence_sick":480},"openEntryIds":[]}'::jsonb, jsonb_build_array(
    jsonb_build_object('date','2026-09-14','scheduledMinutes',480,'workedMinutes',570,'breakMinutes',30,'ordinaryMinutes',480,'overtime','{"overtime_1":90}'::jsonb,'absence','{}'::jsonb),
    jsonb_build_object('date','2026-09-15','scheduledMinutes',480,'workedMinutes',600,'breakMinutes',30,'ordinaryMinutes',480,'overtime','{"overtime_1":120}'::jsonb,'absence','{}'::jsonb),
    jsonb_build_object('date','2026-09-18','scheduledMinutes',480,'workedMinutes',0,'breakMinutes',0,'ordinaryMinutes',0,'overtime','{}'::jsonb,'absence','{"absence_sick":480}'::jsonb)), 'x', (payroll_inputs((select id from payroll_periods where name = 'September 2026'), '81000000-0000-0000-0000-000000000004') ->> 'fingerprint'))$$, 'stämmer inte');
select t.ok('rättelse registreras som differens (övertid +30 min)', payroll_record_adjustment((select id from payroll_statements limit 1),
  '{"days":3,"scheduledMinutes":1440,"workedMinutes":1200,"breakMinutes":60,"ordinaryMinutes":960,"overtime":{"overtime_1":240},"absence":{"absence_sick":480},"openEntryIds":[]}'::jsonb, jsonb_build_array(
    jsonb_build_object('date','2026-09-14','scheduledMinutes',480,'workedMinutes',570,'breakMinutes',30,'ordinaryMinutes',480,'overtime','{"overtime_1":90}'::jsonb,'absence','{}'::jsonb),
    jsonb_build_object('date','2026-09-15','scheduledMinutes',480,'workedMinutes',630,'breakMinutes',30,'ordinaryMinutes',480,'overtime','{"overtime_1":150}'::jsonb,'absence','{}'::jsonb),
    jsonb_build_object('date','2026-09-18','scheduledMinutes',480,'workedMinutes',0,'breakMinutes',0,'ordinaryMinutes',0,'overtime','{}'::jsonb,'absence','{"absence_sick":480}'::jsonb)), 'Glömd arbetstid, rättelse', (payroll_inputs((select id from payroll_periods where name = 'September 2026'), '81000000-0000-0000-0000-000000000004') ->> 'fingerprint')) = 1);
select t.ok('rättelseraden har rätt typ och belopp', exists (select 1 from payroll_adjustments where time_type = 'overtime_1' and minutes_delta = 30 and export_id is null));
select payroll_export_create((select id from payroll_periods where name = 'September 2026'), array[(select id from payroll_statements where user_id = '81000000-0000-0000-0000-000000000004')], 'csv', 'corr1', 1, false, null);
select t.ok('korrigeringsexport registrerad och rättelserna kopplade till den', exists (select 1 from payroll_exports where kind = 'correction')
  and (select count(*) from payroll_adjustments where export_id is null) = 0);
select t.ok('loggen visar rättelsen', (select count(*) from payroll_log where action in ('correction_after_export', 'adjustment_recorded', 'exported')) >= 4);
select t.as_user('81000000-0000-0000-0000-000000000004');
select t.ok('anställd ser inte export, rättelser eller lönekoder', (select count(*) from payroll_exports) = 0 and (select count(*) from payroll_adjustments) = 0);

-- ===== Tidszon: lokalt (svenskt) datum avgör period, inte UTC-datum =====
reset role;
insert into payroll_periods (org_id, name, start_date, end_date) values ('91000000-0000-0000-0000-000000000001', 'Augusti 2026', '2026-08-01', '2026-08-31');
insert into payroll_statements (org_id, period_id, user_id, status, totals, attested_at, attested_by)
  select '91000000-0000-0000-0000-000000000001', id, '81000000-0000-0000-0000-000000000005', 'attested', '{"workedMinutes":0}'::jsonb, now(), '81000000-0000-0000-0000-000000000001' from payroll_periods where name = 'Augusti 2026';
set role authenticated;
select t.as_user('81000000-0000-0000-0000-000000000005');
select t.fails('pass 31 aug 23:30 svensk tid (UTC 21:30) ligger i attesterad augusti', $$select attendance_add_entries('[{"type":"work","start":"2026-08-31T21:30:00Z","end":"2026-08-31T21:50:00Z"}]'::jsonb)$$, 'attesterad');
select t.ok('pass 1 sep 00:30 svensk tid (UTC-datum 31 aug) ligger i september och är inte låst',
  attendance_add_entries('[{"id":"e0000000-0000-0000-0000-000000000001","type":"work","start":"2026-08-31T22:30:00Z","end":"2026-08-31T23:30:00Z"}]'::jsonb) = 1);
select t.ok('pass över lokal midnatt sparas med verklig längd (60 min)', (select total_minutes from attendance_entries where id = 'e0000000-0000-0000-0000-000000000001') = 60);
select t.fails('pass som korsar periodgränsen berörs av låset', $$select attendance_add_entries('[{"type":"work","start":"2026-08-31T21:00:00Z","end":"2026-08-31T22:15:00Z"}]'::jsonb)$$, 'attesterad');

-- ===== Generell kontroll: inga skrivningar utanför funktionerna, och externa konton ser ingenting =====
select t.as_user('83000000-0000-0000-0000-000000000001');
do $$
declare r record; n bigint; leaked text := '';
begin
  for r in select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' loop
    execute format('select count(*) from public.%I', r.table_name) into n;
    if n > 0 and r.table_name <> 'carrier_users' then leaked := leaked || r.table_name || '(' || n || ') '; end if;
  end loop;
  if leaked = '' then raise notice 'ok   transportör når ingen löne-/närvarodata eller annan tabell';
  else raise notice 'FAIL transportör läser: %', leaked; end if;
end $$;
select t.as_user('81000000-0000-0000-0000-000000000001');
do $$
declare r record; failed text := '';
begin
  for r in select unnest(array['attendance_entries','attendance_absences','payroll_statements','payroll_periods','payroll_exports','payroll_adjustments','payroll_log','employee_terms','payroll_code_mappings','overtime_rule_sets','attendance_audit','attendance_corrections']) as tn loop
    begin
      execute format('delete from public.%I', r.tn);
      failed := failed || r.tn || ' ';
    exception when others then null;
    end;
  end loop;
  if failed = '' then raise notice 'ok   inte ens admin kan radera direkt i löne-/närvarotabellerna';
  else raise notice 'FAIL direkt radering lyckades i: %', failed; end if;
end $$;
