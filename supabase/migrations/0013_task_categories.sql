alter table public.tasks
  drop constraint if exists tasks_category_check;

update public.tasks
set category = 'Bokning av mobilkran'
where category = 'Bokning'
  and lower(task) ~ '(mobilkran|kranbil)';

update public.tasks
set category = 'Bokning av transport'
where category = 'Bokning';

update public.tasks
set category = 'VTL'
where category = 'Följebil'
  and lower(task) ~ '(vtl|vägtransportledare)';

alter table public.tasks
  add constraint tasks_category_check check (
    category in (
      'Rekning',
      'Dispensansökan',
      'Följebil',
      'VTL',
      'Tillstånd',
      'Bokning av transport',
      'Bokning av mobilkran',
      'Dokumentation',
      'Övrigt'
    )
  );
