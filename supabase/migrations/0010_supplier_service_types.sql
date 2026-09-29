-- En leverantör kan tillhandahålla flera tjänster. Den befintliga kolumnen
-- type behålls som primär typ för bakåtkompatibilitet.

alter table suppliers
  add column if not exists service_types text[];

update suppliers
set service_types = array[type]
where service_types is null or cardinality(service_types) = 0;

alter table suppliers
  alter column service_types set not null;

create or replace function sync_supplier_service_types()
returns trigger
language plpgsql
as $$
begin
  if new.service_types is null or cardinality(new.service_types) = 0 then
    new.service_types := array[new.type];
  elsif tg_op = 'UPDATE'
    and new.type is distinct from old.type
    and new.service_types is not distinct from old.service_types then
    new.service_types := array[new.type];
  else
    new.type := new.service_types[1];
  end if;
  return new;
end;
$$;

drop trigger if exists trg_suppliers_service_types on suppliers;
create trigger trg_suppliers_service_types
before insert or update of type, service_types on suppliers
for each row execute function sync_supplier_service_types();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'suppliers_service_types_valid'
      and conrelid = 'suppliers'::regclass
  ) then
    alter table suppliers
      add constraint suppliers_service_types_valid check (
        cardinality(service_types) > 0
        and service_types <@ array['Åkeri', 'Kran', 'Följebil', 'Vägtransportledare', 'Konsult', 'Annat']::text[]
      );
  end if;
end;
$$;
