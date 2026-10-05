-- Company at pickup/delivery is independent of the ordering customer and city.
alter table public.locations add column company_name text;

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
    planned_loading_time, planned_delivery_date, planned_delivery_time,
    invoice_status, customer_reference, booking_source,
    booking_approval_status, requested_by_customer_user_id, route_distance_km
  ) values (
    project_id,
    customer_user.org_id,
    project_number,
    coalesce(nullif(trim(p_booking->>'name'), ''), customer_name || ' - Bokningsförfrågan'),
    customer_user.customer_id,
    customer_user.contact_person_id,
    'Ny bokning',
    coalesce(nullif(p_booking->>'transport_type', ''), 'Specialtransport'),
    nullif(trim(p_booking->>'special_requirements'), ''),
    nullif(p_booking->>'planned_loading_date', '')::date,
    nullif(p_booking->>'planned_loading_time', '')::time,
    nullif(p_booking->>'planned_delivery_date', '')::date,
    nullif(p_booking->>'planned_delivery_time', '')::time,
    'Ej fakturerad',
    nullif(trim(p_booking->>'customer_reference'), ''),
    'customer_portal',
    'Väntar på godkännande',
    customer_user.id,
    nullif(p_booking->>'route_distance_km', '')::numeric
  ) returning * into created_project;

  for location in select value from jsonb_array_elements(p_booking->'locations') loop
    insert into locations (id, project_id, type, name, company_name, address, contact_name, contact_phone, order_index)
    values (
      gen_random_uuid(), project_id, location->>'type', location->>'name', nullif(trim(location->>'company_name'), ''),
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

notify pgrst, 'reload schema';
