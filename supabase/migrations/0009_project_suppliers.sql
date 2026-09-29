-- Ett projekt kan använda flera transportörer. projects.supplier_id behålls som
-- primär transportör för bakåtkompatibilitet med dokument och äldre klienter.

create table if not exists project_suppliers (
  project_id uuid not null references projects (id) on delete cascade,
  supplier_id uuid not null references suppliers (id) on delete restrict,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (project_id, supplier_id)
);

create index if not exists idx_project_suppliers_supplier on project_suppliers (supplier_id);
create unique index if not exists idx_project_suppliers_one_primary
  on project_suppliers (project_id) where is_primary;

insert into project_suppliers (project_id, supplier_id, is_primary)
select id, supplier_id, true
from projects
where supplier_id is not null
on conflict (project_id, supplier_id) do update set is_primary = true;

alter table project_suppliers enable row level security;

create policy "org members read project suppliers" on project_suppliers for select
  using (exists (
    select 1 from projects p
    where p.id = project_id and p.org_id = current_org_id()
  ));

create policy "managers write project suppliers" on project_suppliers for insert
  with check (
    can_manage()
    and exists (select 1 from projects p where p.id = project_id and p.org_id = current_org_id())
    and exists (select 1 from suppliers s where s.id = supplier_id and s.org_id = current_org_id())
  );

create policy "managers update project suppliers" on project_suppliers for update
  using (can_manage() and exists (
    select 1 from projects p
    where p.id = project_id and p.org_id = current_org_id()
  ));

create policy "managers delete project suppliers" on project_suppliers for delete
  using (can_manage() and exists (
    select 1 from projects p
    where p.id = project_id and p.org_id = current_org_id()
  ));

grant select, insert, update, delete on project_suppliers to authenticated;

create or replace function save_internal_project(p_project jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  project_record projects;
  supplier_ids jsonb;
begin
  if not can_manage() then
    raise exception 'Saknar behörighet att spara projekt.';
  end if;

  project_record := jsonb_populate_record(
    null::projects,
    p_project - array['locations', 'cargo_items', 'documents', 'notes', 'tasks', 'measurement_link', 'supplier_ids']
  );
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

  supplier_ids := p_project->'supplier_ids';
  if supplier_ids is null then
    supplier_ids := case
      when project_record.supplier_id is null then '[]'::jsonb
      else jsonb_build_array(project_record.supplier_id)
    end;
  end if;

  delete from project_suppliers where project_id = project_record.id;
  insert into project_suppliers (project_id, supplier_id, is_primary)
  select project_record.id, valid_suppliers.supplier_id, valid_suppliers.position = 1
  from (
    select ids.supplier_id::uuid as supplier_id, min(ids.position) as position
    from jsonb_array_elements_text(supplier_ids) with ordinality as ids(supplier_id, position)
    join suppliers s on s.id = ids.supplier_id::uuid and s.org_id = current_org_id()
    group by ids.supplier_id::uuid
  ) valid_suppliers
  on conflict (project_id, supplier_id) do update set is_primary = excluded.is_primary;

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
