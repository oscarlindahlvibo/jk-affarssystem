-- Live-förberedelser för projekt.jkprojekt.se:
-- kundportal-inloggning, fält som byggts efter första schemat och tydligare
-- databasstöd för räknesnurra/ändringslogg.

-- ============================================================
-- KUNDANVÄNDARE (kopplas till auth.users och en kund)
-- ============================================================
create table if not exists customer_users (
  id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid not null references organizations (id) on delete cascade,
  customer_id uuid not null references customers (id) on delete cascade,
  contact_person_id uuid references contact_persons (id) on delete set null,
  full_name text not null,
  email text not null unique,
  status text not null default 'inbjuden' check (status in ('aktiv', 'inbjuden', 'inaktiverad')),
  initials text,
  invited_at timestamptz,
  created_at timestamptz not null default now()
);

alter table customer_users enable row level security;

create or replace function current_customer_user()
returns customer_users
language sql
security definer
set search_path = public
stable
as $$
  select * from customer_users where id = auth.uid() and status = 'aktiv';
$$;

create or replace function current_customer_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select customer_id from customer_users where id = auth.uid() and status = 'aktiv';
$$;

create or replace function current_customer_org_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select org_id from customer_users where id = auth.uid() and status = 'aktiv';
$$;

drop policy if exists "customers read own customer user" on customer_users;
drop policy if exists "admins manage customer users" on customer_users;

create policy "customers read own customer user" on customer_users for select
  using (id = auth.uid());
create policy "admins manage customer users" on customer_users for all
  using (is_active_admin() and org_id = current_org_id())
  with check (is_active_admin() and org_id = current_org_id());

-- ============================================================
-- PROJEKTFÄLT SOM NU FINNS I APPEN
-- ============================================================
alter table projects
  add column if not exists booking_source text not null default 'internal'
    check (booking_source in ('internal', 'customer_portal')),
  add column if not exists booking_approval_status text
    check (booking_approval_status in ('Väntar på godkännande', 'Godkänd', 'Avvisad')),
  add column if not exists requested_by_customer_user_id uuid references customer_users (id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by text,
  add column if not exists source_document_ref text,
  add column if not exists delivery_terms text,
  add column if not exists route_distance_km numeric(10, 1);

alter table locations
  add column if not exists contact_name text,
  add column if not exists contact_phone text;

alter table notes
  add column if not exists user_name text,
  add column if not exists visibility text not null default 'internal'
    check (visibility in ('internal', 'customer'));

alter table tasks
  add column if not exists category text not null default 'Övrigt'
    check (category in ('Rekning', 'Dispensansökan', 'Följebil', 'Tillstånd', 'Bokning', 'Dokumentation', 'Övrigt')),
  add column if not exists description text,
  add column if not exists route_section text,
  add column if not exists assignee text;

-- ============================================================
-- RÄKNESNURRA: konfiguration och ändringslogg
-- ============================================================
create table if not exists freight_calculator_configs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  config jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles (id) on delete set null
);

create table if not exists freight_calculator_change_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  changed_at timestamptz not null default now(),
  changed_by uuid references profiles (id) on delete set null,
  changed_by_name text,
  changes jsonb not null
);

alter table freight_calculator_configs enable row level security;
alter table freight_calculator_change_log enable row level security;

create policy "org members read freight calculator config" on freight_calculator_configs for select
  using (org_id = current_org_id());
create policy "admins manage freight calculator config" on freight_calculator_configs for all
  using (is_active_admin() and org_id = current_org_id())
  with check (is_active_admin() and org_id = current_org_id());

create policy "org members read freight calculator log" on freight_calculator_change_log for select
  using (org_id = current_org_id());
create policy "admins write freight calculator log" on freight_calculator_change_log for insert
  with check (is_active_admin() and org_id = current_org_id());

-- ============================================================
-- KUNDPORTAL-RLS: kunder ser endast sitt företag och kundsynliga delar.
-- Intern personal behåller befintliga org-policyer från 0004.
-- ============================================================
create policy "customer users read own customer" on customers for select
  using (id = current_customer_id() and org_id = current_customer_org_id());

create policy "customer users read own customer projects" on projects for select
  using (customer_id = current_customer_id() and org_id = current_customer_org_id());

create policy "customer users create booking requests" on projects for insert
  with check (
    customer_id = current_customer_id()
    and org_id = current_customer_org_id()
    and booking_source = 'customer_portal'
    and booking_approval_status = 'Väntar på godkännande'
  );

create policy "customer users read project locations" on locations for select
  using (exists (
    select 1 from projects p
    where p.id = project_id and p.customer_id = current_customer_id() and p.org_id = current_customer_org_id()
  ));

create policy "customer users write booking locations" on locations for insert
  with check (exists (
    select 1 from projects p
    where p.id = project_id
      and p.customer_id = current_customer_id()
      and p.org_id = current_customer_org_id()
      and p.booking_source = 'customer_portal'
      and p.booking_approval_status = 'Väntar på godkännande'
  ));

create policy "customer users read project cargo" on cargo_items for select
  using (exists (
    select 1 from projects p
    where p.id = project_id and p.customer_id = current_customer_id() and p.org_id = current_customer_org_id()
  ));

create policy "customer users write booking cargo" on cargo_items for insert
  with check (exists (
    select 1 from projects p
    where p.id = project_id
      and p.customer_id = current_customer_id()
      and p.org_id = current_customer_org_id()
      and p.booking_source = 'customer_portal'
      and p.booking_approval_status = 'Väntar på godkännande'
  ));

create policy "customer users read customer-visible notes" on notes for select
  using (
    visibility = 'customer'
    and exists (
      select 1 from projects p
      where p.id = project_id and p.customer_id = current_customer_id() and p.org_id = current_customer_org_id()
    )
  );

create policy "customer users read customer-visible documents" on documents for select
  using (
    visibility = 'customer'
    and exists (
      select 1 from projects p
      where p.id = project_id and p.customer_id = current_customer_id() and p.org_id = current_customer_org_id()
    )
  );
