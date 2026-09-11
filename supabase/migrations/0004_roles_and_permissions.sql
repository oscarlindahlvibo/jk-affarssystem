-- Roller, användarstatus och bolagsisolering (Row Level Security).
-- Ersätter de öppna "authenticated read/write"-policyerna från 0001 med
-- policyer som styrs av användarens roll (admin/projektledare/ekonomi/lasare)
-- och bolag (org_id) – motsvarande behörighetsmatrisen i src/lib/permissions.ts.

-- ============================================================
-- PROFILES: nya roller + status
-- ============================================================
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles alter column role set default 'lasare';
alter table profiles add constraint profiles_role_check
  check (role in ('admin', 'projektledare', 'ekonomi', 'lasare'));

alter table profiles add column if not exists status text not null default 'aktiv'
  check (status in ('aktiv', 'inbjuden', 'inaktiverad'));
alter table profiles add column if not exists invited_at timestamptz;

-- org_id är grunden för att en användare bara ska kunna se sitt eget bolags data.
alter table profiles alter column org_id set not null;
alter table customers alter column org_id set not null;
alter table projects alter column org_id set not null;
alter table suppliers alter column org_id set not null;

-- ============================================================
-- Hjälpfunktioner: vem är inloggad, vilket bolag/roll har de, är kontot aktivt.
-- SECURITY DEFINER + stabil sökväg så de kan användas fritt i RLS-policyer
-- utan att själva triggas av policyerna på profiles (skulle annars rekursera).
-- ============================================================
create or replace function current_profile()
returns profiles
language sql
security definer
set search_path = public
stable
as $$
  select * from profiles where id = auth.uid();
$$;

create or replace function current_org_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select org_id from profiles where id = auth.uid() and status = 'aktiv';
$$;

create or replace function current_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from profiles where id = auth.uid() and status = 'aktiv';
$$;

create or replace function is_active_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'aktiv' and role = 'admin');
$$;

create or replace function can_manage()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  -- admin + projektledare får skapa/redigera/radera kunder, projekt, kontakter,
  -- leverantörer och dokument. Ekonomi/läsare är read-only (se can_edit_finance
  -- för ekonomis undantag på faktura-/kostnadsfält).
  select exists (
    select 1 from profiles
    where id = auth.uid() and status = 'aktiv' and role in ('admin', 'projektledare')
  );
$$;

create or replace function can_edit_finance()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and status = 'aktiv' and role in ('admin', 'projektledare', 'ekonomi')
  );
$$;

-- ============================================================
-- Rensa de gamla, öppna policyerna från 0001
-- ============================================================
drop policy if exists "authenticated read/write" on profiles;
drop policy if exists "authenticated read/write" on customers;
drop policy if exists "authenticated read/write" on contact_persons;
drop policy if exists "authenticated read/write" on suppliers;
drop policy if exists "authenticated read/write" on projects;
drop policy if exists "authenticated read/write" on project_statuses;
drop policy if exists "authenticated read/write" on locations;
drop policy if exists "authenticated read/write" on cargo_items;
drop policy if exists "authenticated read/write" on documents;
drop policy if exists "authenticated read/write" on notes;
drop policy if exists "authenticated read/write" on tasks;
drop policy if exists "authenticated read/write" on measurement_links;
drop policy if exists "authenticated read/write" on measurement_points;
drop policy if exists "authenticated read own org" on organizations;

-- ============================================================
-- PROFILES (personal/användare) – bara admin hanterar andras konton,
-- alla aktiva användare kan läsa sitt eget bolags personallista.
-- ============================================================
create policy "read own org profiles" on profiles for select
  using (org_id = current_org_id() or id = auth.uid());
create policy "admin manages org profiles" on profiles for insert
  with check (is_active_admin() and org_id = current_org_id());
create policy "admin updates org profiles" on profiles for update
  using (is_active_admin() and org_id = current_org_id())
  with check (org_id = current_org_id());
-- Inaktivering sker via update (status -> 'inaktiverad'), ingen delete-policy
-- behövs normalt; historik/spårbarhet bevaras.

-- ============================================================
-- ORGANIZATIONS – en användare ser bara sin egen organisation.
-- ============================================================
create policy "read own organization" on organizations for select
  using (id = current_org_id());

-- ============================================================
-- CUSTOMERS
-- ============================================================
create policy "org members read customers" on customers for select
  using (org_id = current_org_id());
create policy "managers write customers" on customers for insert
  with check (can_manage() and org_id = current_org_id());
create policy "managers update customers" on customers for update
  using (can_manage() and org_id = current_org_id())
  with check (org_id = current_org_id());
create policy "managers delete customers" on customers for delete
  using (can_manage() and org_id = current_org_id());

-- ============================================================
-- CONTACT_PERSONS (ärver bolagstillhörighet via kundens org_id)
-- ============================================================
create policy "org members read contacts" on contact_persons for select
  using (exists (select 1 from customers c where c.id = customer_id and c.org_id = current_org_id()));
create policy "managers write contacts" on contact_persons for insert
  with check (can_manage() and exists (select 1 from customers c where c.id = customer_id and c.org_id = current_org_id()));
create policy "managers update contacts" on contact_persons for update
  using (can_manage() and exists (select 1 from customers c where c.id = customer_id and c.org_id = current_org_id()));
create policy "managers delete contacts" on contact_persons for delete
  using (can_manage() and exists (select 1 from customers c where c.id = customer_id and c.org_id = current_org_id()));

-- ============================================================
-- SUPPLIERS
-- ============================================================
create policy "org members read suppliers" on suppliers for select
  using (org_id = current_org_id());
create policy "managers write suppliers" on suppliers for insert
  with check (can_manage() and org_id = current_org_id());
create policy "managers update suppliers" on suppliers for update
  using (can_manage() and org_id = current_org_id())
  with check (org_id = current_org_id());
create policy "managers delete suppliers" on suppliers for delete
  using (can_manage() and org_id = current_org_id());

-- ============================================================
-- PROJECTS – ekonomi får läsa allt men bara skriva via update_project_finance()
-- nedan (SECURITY DEFINER), inte via en generell update-policy.
-- ============================================================
create policy "org members read projects" on projects for select
  using (org_id = current_org_id());
create policy "managers write projects" on projects for insert
  with check (can_manage() and org_id = current_org_id());
create policy "managers update projects" on projects for update
  using (can_manage() and org_id = current_org_id())
  with check (org_id = current_org_id());
create policy "managers delete projects" on projects for delete
  using (can_manage() and org_id = current_org_id());

-- Ekonomi-rollens undantag: får ändra pris/kostnad/faktureringsstatus på projekt
-- i sitt eget bolag utan att i övrigt ha redigeringsrätt på projekt.
create or replace function update_project_finance(
  p_project_id uuid,
  p_price numeric,
  p_cost numeric,
  p_invoice_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not can_edit_finance() then
    raise exception 'Saknar behörighet att redigera faktura-/kostnadsuppgifter.';
  end if;
  update projects
    set price = p_price, cost = p_cost, invoice_status = p_invoice_status, updated_at = now()
    where id = p_project_id and org_id = current_org_id();
end;
$$;

-- ============================================================
-- Övriga projektrelaterade tabeller (ärver org via projektets org_id)
-- ============================================================
do $$
declare
  t text;
begin
  foreach t in array array['locations', 'cargo_items', 'documents', 'notes', 'tasks', 'project_statuses']
  loop
    execute format('create policy "org members read %1$s" on %1$s for select using (exists (select 1 from projects p where p.id = project_id and p.org_id = current_org_id()));', t);
    execute format('create policy "managers write %1$s" on %1$s for insert with check (can_manage() and exists (select 1 from projects p where p.id = project_id and p.org_id = current_org_id()));', t);
    execute format('create policy "managers update %1$s" on %1$s for update using (can_manage() and exists (select 1 from projects p where p.id = project_id and p.org_id = current_org_id()));', t);
    execute format('create policy "managers delete %1$s" on %1$s for delete using (can_manage() and exists (select 1 from projects p where p.id = project_id and p.org_id = current_org_id()));', t);
  end loop;
end $$;

-- ============================================================
-- MEASUREMENT_LINKS / MEASUREMENT_POINTS – read-only för appen (skrivs av det
-- separata mätsystemet), men fortfarande scopat till eget bolag.
-- ============================================================
create policy "org members read measurement_links" on measurement_links for select
  using (exists (select 1 from projects p where p.id = project_id and p.org_id = current_org_id()));
create policy "org members read measurement_points" on measurement_points for select
  using (exists (
    select 1 from measurement_links ml
    join projects p on p.id = ml.project_id
    where ml.id = measurement_link_id and p.org_id = current_org_id()
  ));

-- ============================================================
-- STORAGE (project-documents-bucket): filväg börjar med projektets id,
-- kontrollera att projektet tillhör användarens bolag.
-- ============================================================
drop policy if exists "authenticated read documents" on storage.objects;
drop policy if exists "authenticated upload documents" on storage.objects;
drop policy if exists "authenticated delete documents" on storage.objects;

create policy "org members read documents" on storage.objects for select
  using (
    bucket_id = 'project-documents'
    and exists (
      select 1 from projects p
      where p.id::text = split_part(name, '/', 1) and p.org_id = current_org_id()
    )
  );
create policy "managers upload documents" on storage.objects for insert
  with check (
    bucket_id = 'project-documents'
    and can_manage()
    and exists (
      select 1 from projects p
      where p.id::text = split_part(name, '/', 1) and p.org_id = current_org_id()
    )
  );
create policy "managers delete documents" on storage.objects for delete
  using (
    bucket_id = 'project-documents'
    and can_manage()
    and exists (
      select 1 from projects p
      where p.id::text = split_part(name, '/', 1) and p.org_id = current_org_id()
    )
  );
