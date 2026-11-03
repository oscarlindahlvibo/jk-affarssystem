-- Dokumentbibliotek: mappar som admin skapar själv (t.ex. "Lyftinstruktioner") med filer som all personal kan läsa.
-- Mapparna och filerna ligger i Google Drive; här finns bara referenserna. Skrivning sker enbart via Edge Function
-- drive-file (service role), därför saknas skrivpolicyer. Projektdokument ligger kvar i tabellen documents och visas
-- i appen under den fasta mappen "Projekt" > projektnummer.

create table if not exists document_folders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  parent_id uuid references document_folders (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  drive_folder_id text not null,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_document_folders_unique_name
  on document_folders (org_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
create index if not exists idx_document_folders_parent on document_folders (parent_id);

create table if not exists folder_files (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  folder_id uuid not null references document_folders (id) on delete cascade,
  file_name text not null,
  file_type text not null default 'fil',
  file_size bigint,
  drive_file_id text not null unique,
  uploaded_by uuid references profiles (id) on delete set null,
  uploaded_by_name text,
  uploaded_at timestamptz not null default now()
);

create index if not exists idx_folder_files_folder on folder_files (folder_id);

alter table document_folders enable row level security;
alter table folder_files enable row level security;

drop policy if exists "org members read document folders" on document_folders;
create policy "org members read document folders" on document_folders
  for select using (org_id = current_org_id());

drop policy if exists "org members read folder files" on folder_files;
create policy "org members read folder files" on folder_files
  for select using (org_id = current_org_id());

-- Kundens genererade fraktsedel/CMR sparas nu i Google Drive: Drive-id följer med dokumentet.
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
    project_id, file_name, file_type, category, storage_path, file_url, file_size, drive_file_id,
    uploaded_at, uploaded_by, uploaded_by_name, visibility, comment
  ) values (
    p_project_id,
    p_document->>'file_name',
    p_document->>'file_type',
    coalesce(nullif(p_document->>'category', ''), 'Fraktsedel'),
    p_document->>'storage_path',
    p_document->>'file_url',
    nullif(p_document->>'file_size', '')::bigint,
    nullif(p_document->>'drive_file_id', ''),
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

-- Inga filer ska lagras på servern: all uppladdning går via Google Drive (Edge Function drive-file).
-- Bucketen project-documents är tom och klienten får inte längre skriva till den.
drop policy if exists "managers upload documents" on storage.objects;
drop policy if exists "customer users upload own shipping documents" on storage.objects;
