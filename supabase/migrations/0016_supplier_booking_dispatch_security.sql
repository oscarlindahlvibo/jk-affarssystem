-- Leverantörsval, mottagaradresser och utskicksfel är intern information och
-- ska inte exponeras för kundportalens användare.

drop policy if exists "org members read supplier booking dispatches" on supplier_booking_dispatches;

create policy "internal staff read supplier booking dispatches"
  on supplier_booking_dispatches for select
  using (exists (
    select 1
    from profiles
    where profiles.id = auth.uid()
      and profiles.org_id = supplier_booking_dispatches.org_id
      and profiles.status = 'aktiv'
  ));
