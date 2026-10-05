-- Avslutade projekt ska inte längre visas eller räknas som prioriterade.

alter table projects alter column priority drop not null;

update projects
set priority = null,
    priority_is_manual = false
where status in ('Levererad', 'Avbokad', 'Fakturerad');

create or replace function set_project_automatic_priority()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('Levererad', 'Avbokad', 'Fakturerad') then
    new.priority := null;
    new.priority_is_manual := false;
  elsif new.priority is null or not new.priority_is_manual then
    new.priority := case
      when new.planned_loading_date is null then 'Kommande'
      when new.planned_loading_date <= current_date + 7 then 'Prioriterad'
      when new.planned_loading_date <= current_date + 14 then 'Planera'
      else 'Kommande'
    end;
    new.priority_is_manual := false;
  end if;
  return new;
end;
$$;

drop trigger if exists projects_set_automatic_priority on projects;
create trigger projects_set_automatic_priority
before insert or update of planned_loading_date, priority_is_manual, status on projects
for each row execute function set_project_automatic_priority();
