-- Notis även när ett projekt ändras på det som personalen behöver följa: status (t.ex. avbokad), lastnings- och
-- leveransdatum/-tid, ansvarig, godkännande av kundbokning och faktureringsstatus. Triggern skickar bara de fält som
-- faktiskt ändrats (gammalt och nytt värde); ändras inget av dem sker inget anrop.

create or replace function notify_project_event()
returns trigger
language plpgsql
security definer
set search_path = public, net
as $$
declare
  cfg project_event_webhook;
  payload jsonb;
  changes jsonb := '{}'::jsonb;
begin
  select * into cfg from project_event_webhook where id;
  if cfg.url is null then return null; end if;

  if tg_op = 'UPDATE' then
    if old.status is distinct from new.status then changes := changes || jsonb_build_object('status', jsonb_build_array(old.status, new.status)); end if;
    if old.planned_loading_date is distinct from new.planned_loading_date then changes := changes || jsonb_build_object('planned_loading_date', jsonb_build_array(old.planned_loading_date, new.planned_loading_date)); end if;
    if old.planned_delivery_date is distinct from new.planned_delivery_date then changes := changes || jsonb_build_object('planned_delivery_date', jsonb_build_array(old.planned_delivery_date, new.planned_delivery_date)); end if;
    if old.planned_loading_time is distinct from new.planned_loading_time then changes := changes || jsonb_build_object('planned_loading_time', jsonb_build_array(old.planned_loading_time, new.planned_loading_time)); end if;
    if old.planned_delivery_time is distinct from new.planned_delivery_time then changes := changes || jsonb_build_object('planned_delivery_time', jsonb_build_array(old.planned_delivery_time, new.planned_delivery_time)); end if;
    if old.responsible_id is distinct from new.responsible_id then changes := changes || jsonb_build_object('responsible_id', jsonb_build_array(old.responsible_id, new.responsible_id)); end if;
    if old.booking_approval_status is distinct from new.booking_approval_status then changes := changes || jsonb_build_object('booking_approval_status', jsonb_build_array(old.booking_approval_status, new.booking_approval_status)); end if;
    if old.invoice_status is distinct from new.invoice_status then changes := changes || jsonb_build_object('invoice_status', jsonb_build_array(old.invoice_status, new.invoice_status)); end if;
    if changes = '{}'::jsonb then return null; end if;
    payload := jsonb_build_object('type', 'project_update', 'id', new.id, 'actor', auth.uid(), 'changes', changes);
  else
    payload := jsonb_build_object('type', case tg_table_name when 'notes' then 'note' else 'project' end, 'id', new.id, 'actor', auth.uid());
  end if;

  begin
    perform net.http_post(
      url := cfg.url,
      body := payload,
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

drop trigger if exists projects_notify_change on projects;
create trigger projects_notify_change after update on projects
  for each row execute function notify_project_event();
