-- Ready is a manually selected priority; automatic date rules remain unchanged.
alter table public.projects drop constraint projects_priority_check;
alter table public.projects add constraint projects_priority_check
  check (priority in ('Kommande', 'Planera', 'Prioriterad', 'Klar'));

notify pgrst, 'reload schema';
