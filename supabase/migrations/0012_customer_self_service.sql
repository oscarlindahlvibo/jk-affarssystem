-- Kundportalens självbetjäning: räknesnurra per kund, kunden kan generera
-- fraktsedel/CMR själv för godkända bokningar, och begära ändringar.

alter table customers
  add column if not exists freight_calculator_enabled boolean not null default false;

alter table projects
  add column if not exists edit_requested_at timestamptz,
  add column if not exists edit_request_message text;

-- Kunden får generera fraktsedel/CMR själv för en bokning som inte längre
-- väntar på godkännande eller är avvisad/avbruten. Dokumentet sparas med
-- visibility='customer' så personalen ser samma fil i projektets dokument.
create or replace function customer_add_shipping_document(p_project_id uuid, p_document jsonb)
returns documents
language plpgsql
security definer
set search_path = public
as $$
declare
  customer_user customer_users;
  target_project projects;
  created_document documents;
begin
  select * into customer_user from customer_users where id = auth.uid() and status = 'aktiv';
  if customer_user.id is null then
    raise exception 'Kundkontot är inte aktivt.';
  end if;

  select * into target_project from projects
  where id = p_project_id and customer_id = customer_user.customer_id and org_id = customer_user.org_id;
  if target_project.id is null then
    raise exception 'Bokningen kunde inte hittas.';
  end if;
  if coalesce(target_project.booking_approval_status, 'Godkänd') in ('Väntar på godkännande', 'Avvisad') then
    raise exception 'Bokningen är inte godkänd ännu.';
  end if;

  insert into documents (
    project_id, file_name, file_type, category, storage_path, file_url, file_size,
    uploaded_at, uploaded_by, uploaded_by_name, visibility, comment
  ) values (
    p_project_id,
    p_document->>'file_name',
    p_document->>'file_type',
    coalesce(nullif(p_document->>'category', ''), 'Fraktsedel'),
    p_document->>'storage_path',
    p_document->>'file_url',
    nullif(p_document->>'file_size', '')::bigint,
    now(),
    null,
    customer_user.full_name,
    'customer',
    p_document->>'comment'
  ) returning * into created_document;

  return created_document;
end;
$$;

revoke all on function customer_add_shipping_document(uuid, jsonb) from public;
grant execute on function customer_add_shipping_document(uuid, jsonb) to authenticated;

-- Kunden begär en ändring av en egen bokning. Sätter en flagga som personalen
-- ser i projektet, och lämnar en spårbar notering.
create or replace function customer_request_booking_edit(p_project_id uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  customer_user customer_users;
  target_project projects;
begin
  select * into customer_user from customer_users where id = auth.uid() and status = 'aktiv';
  if customer_user.id is null then
    raise exception 'Kundkontot är inte aktivt.';
  end if;
  if coalesce(trim(p_message), '') = '' then
    raise exception 'Beskriv vad som ska ändras.';
  end if;

  select * into target_project from projects
  where id = p_project_id and customer_id = customer_user.customer_id and org_id = customer_user.org_id;
  if target_project.id is null then
    raise exception 'Bokningen kunde inte hittas.';
  end if;

  update projects set edit_requested_at = now(), edit_request_message = trim(p_message)
  where id = p_project_id;

  insert into notes (project_id, user_name, text, category, visibility)
  values (p_project_id, customer_user.full_name, 'Kund begär ändring: ' || trim(p_message), 'Kund', 'internal');
end;
$$;

revoke all on function customer_request_booking_edit(uuid, text) from public;
grant execute on function customer_request_booking_edit(uuid, text) to authenticated;

-- Kunden får ladda upp fraktsedel/CMR-filer den själv genererar för sina egna,
-- godkända bokningar (filväg börjar med projektets id, som för personalens
-- uppladdningar).
create policy "customer users upload own shipping documents" on storage.objects for insert
  with check (
    bucket_id = 'project-documents'
    and exists (
      select 1 from projects p
      where p.id::text = split_part(name, '/', 1)
        and p.customer_id = current_customer_id()
        and p.org_id = current_customer_org_id()
        and coalesce(p.booking_approval_status, 'Godkänd') not in ('Väntar på godkännande', 'Avvisad')
    )
  );
