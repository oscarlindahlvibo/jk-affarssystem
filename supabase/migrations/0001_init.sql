-- JK Projektlogistik AB – grundschema för Basic-versionen
-- Förberett för multi-tenant (org_id) och Row Level Security.

create extension if not exists "pgcrypto";

-- ============================================================
-- ORGANISATIONER (framtida multi-tenant-stöd)
-- ============================================================
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- PROFILER (kopplas till auth.users)
-- ============================================================
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid references organizations (id) on delete set null,
  full_name text not null,
  email text not null,
  role text not null default 'koordinator' check (role in ('admin', 'planerare', 'koordinator', 'läsare')),
  initials text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- KUNDER
-- ============================================================
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations (id) on delete set null,
  company_name text not null,
  org_number text,
  invoice_address text,
  visiting_address text,
  phone text,
  email text,
  website text,
  notes text,
  status text not null default 'aktiv' check (status in ('aktiv', 'inaktiv')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_customers_org on customers (org_id);

-- ============================================================
-- KONTAKTPERSONER
-- ============================================================
create table if not exists contact_persons (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  name text not null,
  role text,
  phone text,
  mobile text,
  email text,
  note text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_contacts_customer on contact_persons (customer_id);

-- ============================================================
-- LEVERANTÖRER / TRANSPORTÖRER
-- ============================================================
create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations (id) on delete set null,
  company_name text not null,
  type text not null check (type in ('Åkeri', 'Kran', 'Följebil', 'Vägtransportledare', 'Konsult', 'Annat')),
  contact_person text,
  phone text,
  email text,
  area text,
  notes text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- PROJEKT / TRANSPORTER
-- ============================================================
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations (id) on delete set null,
  project_number text not null unique,
  name text not null,
  customer_id uuid not null references customers (id) on delete restrict,
  contact_person_id uuid references contact_persons (id) on delete set null,
  responsible_id uuid references profiles (id) on delete set null,
  status text not null default 'Ny' check (status in (
    'Ny', 'Under kalkylering', 'Offert skickad', 'Väntar på kund', 'Order',
    'Planering', 'Ruttkontroll', 'Tillstånd', 'Transport bokad', 'Pågående',
    'Levererad', 'Klar för fakturering', 'Avslutad', 'Avbruten'
  )),
  transport_type text not null default 'Specialtransport' check (transport_type in (
    'Specialtransport', 'Maskintransport', 'Krantransport', 'Styckegods', 'Container', 'Annat'
  )),
  special_requirements text,
  planned_loading_date date,
  planned_delivery_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_projects_org on projects (org_id);
create index if not exists idx_projects_customer on projects (customer_id);
create index if not exists idx_projects_status on projects (status);
create index if not exists idx_projects_responsible on projects (responsible_id);

-- Historik över statusändringar (bygger framtida statusflöde/logg)
create table if not exists project_statuses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  status text not null,
  changed_by uuid references profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists idx_project_statuses_project on project_statuses (project_id);

-- ============================================================
-- PLATSER (lastning / lossning / mellanpunkter)
-- ============================================================
create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  type text not null check (type in ('lastning', 'lossning', 'mellanpunkt')),
  name text not null,
  address text,
  order_index int not null default 0
);

create index if not exists idx_locations_project on locations (project_id);

-- ============================================================
-- GODS
-- ============================================================
create table if not exists cargo_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  description text not null,
  length_m numeric(8, 2),
  width_m numeric(8, 2),
  height_m numeric(8, 2),
  weight_ton numeric(10, 2),
  quantity int,
  lift_points text,
  drawing_reference text,
  technical_info text
);

create index if not exists idx_cargo_project on cargo_items (project_id);

-- ============================================================
-- DOKUMENT (metadata; filer i Supabase Storage bucket "project-documents")
-- ============================================================
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  file_name text not null,
  file_type text not null,
  category text not null default 'Övrigt' check (category in (
    'Ritning', 'Tillstånd', 'Offert', 'Order', 'Fraktsedel', 'Foto', 'Övrigt'
  )),
  storage_path text,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references profiles (id) on delete set null,
  visibility text not null default 'internal' check (visibility in ('internal', 'customer')),
  comment text
);

create index if not exists idx_documents_project on documents (project_id);

-- ============================================================
-- ANTECKNINGAR
-- ============================================================
create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  date timestamptz not null default now(),
  user_id uuid references profiles (id) on delete set null,
  text text not null,
  category text not null default 'Allmänt' check (category in ('Allmänt', 'Kund', 'Transport', 'Tillstånd', 'Ekonomi'))
);

create index if not exists idx_notes_project on notes (project_id);

-- ============================================================
-- UPPGIFTER / CHECKLISTA
-- ============================================================
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  task text not null,
  assignee_id uuid references profiles (id) on delete set null,
  deadline date,
  status text not null default 'Ej påbörjad' check (status in ('Ej påbörjad', 'Pågående', 'Klar')),
  comment text
);

create index if not exists idx_tasks_project on tasks (project_id);

-- ============================================================
-- RUTTMÄTNING (koppling till framtida separat mätsystem)
-- ============================================================
create table if not exists measurement_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references projects (id) on delete cascade,
  measurement_id text not null,
  route_id text not null,
  measurement_status text not null default 'Ej startad' check (measurement_status in (
    'Ej startad', 'Pågående', 'Klar', 'Bevakning'
  )),
  measurement_date date,
  measurement_summary text,
  lowest_measured_height numeric(6, 2),
  transport_height numeric(6, 2),
  minimum_margin numeric(6, 2),
  number_of_measurement_points int,
  link_to_measurement_map text
);

create table if not exists measurement_points (
  id uuid primary key default gen_random_uuid(),
  measurement_link_id uuid not null references measurement_links (id) on delete cascade,
  name text not null,
  lat numeric(9, 6) not null,
  lng numeric(9, 6) not null,
  free_height numeric(6, 2),
  transport_height numeric(6, 2),
  margin numeric(6, 2),
  quality text default 'Medel' check (quality in ('Hög', 'Medel', 'Låg')),
  status text not null default 'OK' check (status in ('OK', 'Bevaka', 'Kritisk')),
  comment text,
  order_index int not null default 0
);

create index if not exists idx_measurement_points_link on measurement_points (measurement_link_id);

-- ============================================================
-- updated_at triggers
-- ============================================================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_customers_updated_at before update on customers
  for each row execute function set_updated_at();

create trigger trg_projects_updated_at before update on projects
  for each row execute function set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- Basic-version: alla inloggade användare (samma org) får läsa/skriva.
-- Skärps senare per roll och org_id för multi-tenant.
-- ============================================================
alter table organizations enable row level security;
alter table profiles enable row level security;
alter table customers enable row level security;
alter table contact_persons enable row level security;
alter table suppliers enable row level security;
alter table projects enable row level security;
alter table project_statuses enable row level security;
alter table locations enable row level security;
alter table cargo_items enable row level security;
alter table documents enable row level security;
alter table notes enable row level security;
alter table tasks enable row level security;
alter table measurement_links enable row level security;
alter table measurement_points enable row level security;

create policy "authenticated read/write" on profiles for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated read/write" on customers for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated read/write" on contact_persons for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated read/write" on suppliers for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated read/write" on projects for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated read/write" on project_statuses for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated read/write" on locations for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated read/write" on cargo_items for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated read/write" on documents for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated read/write" on notes for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated read/write" on tasks for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated read/write" on measurement_links for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated read/write" on measurement_points for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated read own org" on organizations for select using (auth.role() = 'authenticated');

-- ============================================================
-- STORAGE: bucket för projektdokument
-- ============================================================
insert into storage.buckets (id, name, public)
values ('project-documents', 'project-documents', false)
on conflict (id) do nothing;

create policy "authenticated read documents" on storage.objects
  for select using (bucket_id = 'project-documents' and auth.role() = 'authenticated');
create policy "authenticated upload documents" on storage.objects
  for insert with check (bucket_id = 'project-documents' and auth.role() = 'authenticated');
create policy "authenticated delete documents" on storage.objects
  for delete using (bucket_id = 'project-documents' and auth.role() = 'authenticated');
