-- Sista databasdelarna för att webbappen ska kunna använda Supabase som
-- primär datakälla. Kundbokningen skapas atomiskt för att undvika halvfärdiga
-- projekt om någon del av begäran är ogiltig.

alter table documents
  add column if not exists file_url text,
  add column if not exists file_size bigint,
  add column if not exists drive_file_id text,
  add column if not exists uploaded_by_name text;

create or replace function submit_customer_booking(p_booking jsonb)
returns projects
language plpgsql
security definer
set search_path = public
as $$
declare
  customer_user customer_users;
  created_project projects;
  project_id uuid := gen_random_uuid();
  project_number text;
  cargo jsonb;
  location jsonb;
  suggested_task jsonb;
  customer_name text;
begin
  select * into customer_user
  from customer_users
  where id = auth.uid() and status = 'aktiv';

  if customer_user.id is null then
    raise exception 'Kundkontot är inte aktivt.';
  end if;

  if coalesce(jsonb_array_length(p_booking->'cargo_items'), 0) = 0 then
    raise exception 'Bokningen måste innehålla minst en godsrad.';
  end if;

  project_number := 'WEB-' || extract(year from now())::int || '-' || upper(substr(replace(project_id::text, '-', ''), 1, 8));
  select company_name into customer_name from customers where id = customer_user.customer_id;

  insert into projects (
    id, org_id, project_number, name, customer_id, contact_person_id,
    status, transport_type, special_requirements, planned_loading_date,
    planned_delivery_date, invoice_status, customer_reference, booking_source,
    booking_approval_status, requested_by_customer_user_id, route_distance_km
  ) values (
    project_id,
    customer_user.org_id,
    project_number,
    coalesce(nullif(trim(p_booking->>'name'), ''), customer_name || ' - Bokningsförfrågan'),
    customer_user.customer_id,
    customer_user.contact_person_id,
    'Ny',
    coalesce(nullif(p_booking->>'transport_type', ''), 'Specialtransport'),
    nullif(trim(p_booking->>'special_requirements'), ''),
    nullif(p_booking->>'planned_loading_date', '')::date,
    nullif(p_booking->>'planned_delivery_date', '')::date,
    'Ej fakturerad',
    nullif(trim(p_booking->>'customer_reference'), ''),
    'customer_portal',
    'Väntar på godkännande',
    customer_user.id,
    nullif(p_booking->>'route_distance_km', '')::numeric
  ) returning * into created_project;

  for location in select value from jsonb_array_elements(p_booking->'locations') loop
    insert into locations (id, project_id, type, name, address, contact_name, contact_phone, order_index)
    values (
      gen_random_uuid(), project_id, location->>'type', location->>'name',
      nullif(trim(location->>'address'), ''), nullif(trim(location->>'contact_name'), ''),
      nullif(trim(location->>'contact_phone'), ''), coalesce((location->>'order_index')::int, 0)
    );
  end loop;

  for cargo in select value from jsonb_array_elements(p_booking->'cargo_items') loop
    insert into cargo_items (
      id, project_id, description, length_m, width_m, height_m, weight_ton,
      quantity, lift_points, drawing_reference, technical_info
    ) values (
      gen_random_uuid(), project_id, cargo->>'description',
      nullif(cargo->>'length_m', '')::numeric, nullif(cargo->>'width_m', '')::numeric,
      nullif(cargo->>'height_m', '')::numeric, nullif(cargo->>'weight_ton', '')::numeric,
      nullif(cargo->>'quantity', '')::int, null, null, 'Skapad via kundportalen.'
    );
  end loop;

  insert into notes (project_id, user_name, text, category, visibility)
  values (project_id, customer_user.full_name, 'Bokning skapad av kund i kundportalen.', 'Kund', 'internal');

  for suggested_task in select value from jsonb_array_elements(coalesce(p_booking->'suggested_tasks', '[]'::jsonb)) loop
    insert into tasks (project_id, task, category, description, status)
    values (
      project_id,
      suggested_task->>'task',
      coalesce(nullif(suggested_task->>'category', ''), 'Övrigt'),
      nullif(suggested_task->>'description', ''),
      'Ej påbörjad'
    );
  end loop;

  return created_project;
end;
$$;

revoke all on function submit_customer_booking(jsonb) from public;
grant execute on function submit_customer_booking(jsonb) to authenticated;

create or replace function save_internal_project(p_project jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  project_record projects;
begin
  if not can_manage() then
    raise exception 'Saknar behörighet att spara projekt.';
  end if;

  project_record := jsonb_populate_record(null::projects, p_project - array['locations', 'cargo_items', 'documents', 'notes', 'tasks', 'measurement_link']);
  if project_record.org_id is distinct from current_org_id() then
    raise exception 'Projektet tillhör inte din organisation.';
  end if;

  insert into projects select project_record.*
  on conflict (id) do update set
    project_number = excluded.project_number,
    name = excluded.name,
    customer_id = excluded.customer_id,
    contact_person_id = excluded.contact_person_id,
    responsible_id = excluded.responsible_id,
    status = excluded.status,
    transport_type = excluded.transport_type,
    special_requirements = excluded.special_requirements,
    planned_loading_date = excluded.planned_loading_date,
    planned_delivery_date = excluded.planned_delivery_date,
    price = excluded.price,
    cost = excluded.cost,
    invoice_status = excluded.invoice_status,
    supplier_id = excluded.supplier_id,
    customer_reference = excluded.customer_reference,
    vehicle = excluded.vehicle,
    driver_name = excluded.driver_name,
    carrier_order_number = excluded.carrier_order_number,
    booking_source = excluded.booking_source,
    booking_approval_status = excluded.booking_approval_status,
    requested_by_customer_user_id = excluded.requested_by_customer_user_id,
    approved_at = excluded.approved_at,
    approved_by = excluded.approved_by,
    source_document_ref = excluded.source_document_ref,
    delivery_terms = excluded.delivery_terms,
    route_distance_km = excluded.route_distance_km,
    updated_at = now();

  delete from locations where project_id = project_record.id;
  insert into locations select * from jsonb_populate_recordset(null::locations, coalesce(p_project->'locations', '[]'::jsonb));

  delete from cargo_items where project_id = project_record.id;
  insert into cargo_items select * from jsonb_populate_recordset(null::cargo_items, coalesce(p_project->'cargo_items', '[]'::jsonb));

  delete from documents where project_id = project_record.id;
  insert into documents select * from jsonb_populate_recordset(null::documents, coalesce(p_project->'documents', '[]'::jsonb));

  delete from notes where project_id = project_record.id;
  insert into notes select * from jsonb_populate_recordset(null::notes, coalesce(p_project->'notes', '[]'::jsonb));

  delete from tasks where project_id = project_record.id;
  insert into tasks select * from jsonb_populate_recordset(null::tasks, coalesce(p_project->'tasks', '[]'::jsonb));

  return project_record.id;
end;
$$;

revoke all on function save_internal_project(jsonb) from public;
grant execute on function save_internal_project(jsonb) to authenticated;

create policy "customer users read project files" on storage.objects for select
  using (
    bucket_id = 'project-documents'
    and exists (
      select 1 from documents d
      join projects p on p.id = d.project_id
      where d.storage_path = name
        and d.visibility = 'customer'
        and p.customer_id = current_customer_id()
        and p.org_id = current_customer_org_id()
    )
  );
