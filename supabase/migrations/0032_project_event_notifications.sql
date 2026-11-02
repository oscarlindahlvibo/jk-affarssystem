-- Notis till projektledare och administratörer när någon lägger in en anteckning eller ett nytt projekt.
-- Databasen anropar Edge Function notify-project-event via pg_net efter commit, så alla vägar täcks
-- (appen, kundportalen och import). Webhook-adressen och hemligheten ligger i project_event_webhook;
-- utan en rad där gör triggrarna ingenting. Ett fel i notisen får aldrig stoppa själva sparandet.

create extension if not exists pg_net;

create table if not exists project_event_webhook (
  id boolean primary key default true check (id),
  url text not null,
  secret text not null
);

alter table project_event_webhook enable row level security;
revoke all on project_event_webhook from public, anon, authenticated;

create or replace function notify_project_event()
returns trigger
language plpgsql
security definer
set search_path = public, net
as $$
declare
  cfg project_event_webhook;
  event_type text := case tg_table_name when 'notes' then 'note' else 'project' end;
begin
  select * into cfg from project_event_webhook where id;
  if cfg.url is null then return null; end if;
  begin
    perform net.http_post(
      url := cfg.url,
      body := jsonb_build_object('type', event_type, 'id', new.id, 'actor', auth.uid()),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', cfg.secret),
      timeout_milliseconds := 5000
    );
  exception when others then
    raise warning 'notify_project_event misslyckades: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function notify_project_event() from public, anon, authenticated;

drop trigger if exists notes_notify_event on notes;
create trigger notes_notify_event after insert on notes
  for each row execute function notify_project_event();

drop trigger if exists projects_notify_event on projects;
create trigger projects_notify_event after insert on projects
  for each row execute function notify_project_event();
