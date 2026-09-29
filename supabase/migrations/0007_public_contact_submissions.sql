-- Kontaktförfrågningar från den publika webbplatsen. Besökare får endast
-- skapa poster; bara aktiv intern JK-personal får läsa och hantera dem.

create table if not exists contact_submissions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  email text not null check (char_length(trim(email)) between 3 and 320),
  phone text check (phone is null or char_length(phone) <= 50),
  company text check (company is null or char_length(company) <= 200),
  message text not null check (char_length(trim(message)) between 1 and 5000),
  service_type text check (service_type is null or char_length(service_type) <= 100),
  status text not null default 'new' check (status in ('new', 'read', 'responded', 'archived')),
  created_at timestamptz not null default now()
);

alter table contact_submissions enable row level security;

drop policy if exists "anon_insert_contact" on contact_submissions;
drop policy if exists "auth_select_contact" on contact_submissions;
drop policy if exists "auth_update_contact" on contact_submissions;
drop policy if exists "auth_delete_contact" on contact_submissions;
drop policy if exists "public submits contact requests" on contact_submissions;
drop policy if exists "internal staff read contact requests" on contact_submissions;
drop policy if exists "internal managers update contact requests" on contact_submissions;
drop policy if exists "admins delete contact requests" on contact_submissions;

create policy "public submits contact requests" on contact_submissions for insert
  to anon, authenticated
  with check (
    status = 'new'
    and char_length(trim(name)) between 1 and 120
    and char_length(trim(email)) between 3 and 320
    and char_length(trim(message)) between 1 and 5000
  );

create policy "internal staff read contact requests" on contact_submissions for select
  to authenticated
  using (current_org_id() is not null);

create policy "internal managers update contact requests" on contact_submissions for update
  to authenticated
  using (can_manage())
  with check (can_manage());

create policy "admins delete contact requests" on contact_submissions for delete
  to authenticated
  using (is_active_admin());

create index if not exists idx_contact_submissions_created_at
  on contact_submissions (created_at desc);

create index if not exists idx_contact_submissions_status
  on contact_submissions (status);
