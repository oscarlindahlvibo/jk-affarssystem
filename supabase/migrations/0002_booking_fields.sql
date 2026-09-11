-- Utökar projects med fält som motsvarar JK:s nuvarande Excel-bokningsblad,
-- för att stödja import och löpande bokningshantering (transportör, fordon, chaufför).

alter table projects
  add column if not exists price numeric(12, 2),
  add column if not exists cost numeric(12, 2),
  add column if not exists invoice_status text not null default 'Ej fakturerad'
    check (invoice_status in ('Ej fakturerad', 'Klar för fakturering', 'Fakturerad')),
  add column if not exists supplier_id uuid references suppliers (id) on delete set null,
  add column if not exists customer_reference text,
  add column if not exists vehicle text,
  add column if not exists driver_name text,
  add column if not exists carrier_order_number text;

create index if not exists idx_projects_supplier on projects (supplier_id);
