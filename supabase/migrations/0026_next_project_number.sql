-- Serverns förslag på nästa projektnummer. Används av appen när två personer
-- samtidigt råkat få samma nummer (unik nyckel projects_project_number_key).
-- Samma regel som i klienten: högsta löpnummer i JK-ÅÅÅÅ-NNNN + 1, med innevarande år.

create or replace function next_project_number()
returns text
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  highest integer;
begin
  if current_org_id() is null then
    raise exception 'Åtgärden nekas.' using errcode = '42501';
  end if;
  select max(((regexp_match(project_number, '^JK-\d{4}-(\d{4})$'))[1])::int) into highest from projects;
  return 'JK-' || extract(year from now())::int || '-' || lpad((coalesce(highest, 100) + 1)::text, 4, '0');
end;
$$;

revoke all on function next_project_number() from public, anon;
grant execute on function next_project_number() to authenticated;
