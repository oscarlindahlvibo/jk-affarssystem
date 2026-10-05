-- Spårbar historik för bokningar som skickas till transportörer/leverantörer.

create table if not exists supplier_booking_dispatches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  supplier_id uuid not null references suppliers (id) on delete restrict,
  recipient_email text not null,
  recipient_name text,
  sent_at timestamptz not null default now(),
  sent_by uuid references profiles (id) on delete set null,
  sent_by_name text not null,
  subject text not null,
  status text not null check (status in ('sent', 'failed')),
  external_message_id text,
  error_message text
);

create index if not exists idx_supplier_booking_dispatches_project
  on supplier_booking_dispatches (project_id, sent_at desc);

alter table supplier_booking_dispatches enable row level security;

create policy "org members read supplier booking dispatches"
  on supplier_booking_dispatches for select
  using (org_id = current_org_id());

-- Utskick och loggning görs av Edge Function med service role. Klienten får
-- bara läsa historiken och kan därför inte förfalska ett lyckat utskick.
grant select on supplier_booking_dispatches to authenticated;
