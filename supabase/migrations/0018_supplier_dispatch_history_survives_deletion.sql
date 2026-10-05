-- Utskicksloggen ska bevaras som revisionsspår även om en leverantör tas bort.
-- Mottagarnamn och e-post finns redan lagrade direkt på loggraden.

alter table supplier_booking_dispatches
  drop constraint if exists supplier_booking_dispatches_supplier_id_fkey;

alter table supplier_booking_dispatches
  alter column supplier_id drop not null;

alter table supplier_booking_dispatches
  add constraint supplier_booking_dispatches_supplier_id_fkey
  foreign key (supplier_id) references suppliers (id) on delete set null;
