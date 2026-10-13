-- Ny projektstatus "Rekning" och registrerad tid per arbetsorder.

alter table projects drop constraint if exists projects_status_check;
alter table projects add constraint projects_status_check check (status in (
  'Ny bokning', 'Förfrågan', 'Bokad', 'Bekräftad', 'Rekning', 'På väg',
  'Levererad', 'Avbokad', 'Pausad', 'Fakturerad'
));

alter table tasks
  add column if not exists time_spent_minutes integer check (time_spent_minutes is null or time_spent_minutes >= 0);
