-- Kundens förenklade statusflöde och automatisk prioritering från lastdatum.

alter table projects drop constraint if exists projects_status_check;

update projects
set status = case
  when invoice_status = 'Fakturerad' then 'Fakturerad'
  when status in ('Ny bokning', 'Förfrågan', 'Bokad', 'Bekräftad', 'På väg', 'Levererad', 'Avbokad', 'Pausad', 'Fakturerad') then status
  when status = 'Ny' then 'Ny bokning'
  when status in ('Under kalkylering', 'Offert skickad', 'Väntar på kund') then 'Förfrågan'
  when status = 'Transport bokad' then 'Bokad'
  when status in ('Order', 'Planering', 'Ruttkontroll', 'Tillstånd') then 'Bekräftad'
  when status = 'Pågående' then 'På väg'
  when status in ('Levererad', 'Klar för fakturering', 'Avslutad') then 'Levererad'
  when status = 'Avbruten' then 'Avbokad'
  else 'Förfrågan'
end;

alter table projects alter column status set default 'Ny bokning';
alter table projects add constraint projects_status_check check (status in (
  'Ny bokning', 'Förfrågan', 'Bokad', 'Bekräftad', 'På väg',
  'Levererad', 'Avbokad', 'Pausad', 'Fakturerad'
));

alter table projects
  add column if not exists priority text,
  add column if not exists priority_is_manual boolean not null default false;

update projects
set priority = case
  when planned_loading_date is null then 'Kommande'
  when planned_loading_date <= current_date + 7 then 'Prioriterad'
  when planned_loading_date <= current_date + 14 then 'Planera'
  else 'Kommande'
end
where priority is null;

alter table projects alter column priority set default 'Kommande';
alter table projects alter column priority set not null;
alter table projects drop constraint if exists projects_priority_check;
alter table projects add constraint projects_priority_check
  check (priority in ('Kommande', 'Planera', 'Prioriterad'));

create index if not exists idx_projects_priority on projects (priority);

create or replace function set_project_automatic_priority()
returns trigger
language plpgsql
as $$
begin
  if not new.priority_is_manual then
    new.priority := case
      when new.planned_loading_date is null then 'Kommande'
      when new.planned_loading_date <= current_date + 7 then 'Prioriterad'
      when new.planned_loading_date <= current_date + 14 then 'Planera'
      else 'Kommande'
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists projects_set_automatic_priority on projects;
create trigger projects_set_automatic_priority
before insert or update of planned_loading_date, priority_is_manual on projects
for each row execute function set_project_automatic_priority();
