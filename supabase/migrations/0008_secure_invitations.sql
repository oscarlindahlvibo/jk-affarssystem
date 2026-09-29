-- Secure account invitation support.
-- Invited users remain blocked by RLS until they have followed the email link
-- and chosen a password. This function is the only self-service transition
-- from "inbjuden" to "aktiv".

create unique index if not exists profiles_email_unique_ci
  on profiles (lower(email));

create or replace function activate_invited_account()
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  account_type text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from auth.users
    where id = auth.uid()
      and email_confirmed_at is not null
  ) then
    raise exception 'Email address is not confirmed';
  end if;

  update public.profiles
  set status = 'aktiv'
  where id = auth.uid()
    and status = 'inbjuden';

  if found or exists (select 1 from public.profiles where id = auth.uid() and status = 'aktiv') then
    account_type := 'internal';
  else
    update public.customer_users
    set status = 'aktiv'
    where id = auth.uid()
      and status = 'inbjuden';

    if found or exists (select 1 from public.customer_users where id = auth.uid() and status = 'aktiv') then
      account_type := 'customer';
    end if;
  end if;

  if account_type is null then
    raise exception 'No invited account is linked to this user';
  end if;

  return account_type;
end;
$$;

revoke all on function activate_invited_account() from public;
revoke all on function activate_invited_account() from anon;
grant execute on function activate_invited_account() to authenticated;
