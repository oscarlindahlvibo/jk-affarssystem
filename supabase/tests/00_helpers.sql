-- Gemensamma testhjälpare (körs först). Ingen testdata skapas här.
create schema if not exists t;

-- Loggar PASS/FAIL som NOTICE; skriptet bedömer utifrån "FAIL".
create or replace function t.ok(label text, condition boolean) returns void language plpgsql as $$
begin
  if condition then raise notice 'ok   %', label; else raise notice 'FAIL %', label; end if;
end $$;

-- Förväntar att ett uttryck misslyckas (med valfri del av felmeddelandet).
create or replace function t.fails(label text, stmt text, expect text default null) returns void language plpgsql as $$
begin
  begin
    execute stmt;
    raise notice 'FAIL % (inget fel)', label;
  exception when others then
    if expect is null or position(lower(expect) in lower(sqlerrm)) > 0 then raise notice 'ok   % [%]', label, left(sqlerrm, 70);
    else raise notice 'FAIL % (fel text: %)', label, sqlerrm; end if;
  end;
end $$;

create or replace function t.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, false);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
end $$;

-- Skapar en användare i auth.users, och valfritt en profil.
create or replace function t.mk_user(uid uuid, mail text) returns void language sql as $$
  insert into auth.users (id, email, aud, role) values (uid, mail, 'authenticated', 'authenticated') on conflict (id) do nothing;
$$;

grant usage on schema t to authenticated;
grant execute on all functions in schema t to authenticated;
