#!/usr/bin/env bash
# Kör alla Supabase-migrationer mot en tillfällig lokal Supabase-Postgres och därefter
# SQL-testerna i supabase/tests/*.sql. Rör ingen server eller produktionsdatabas.
set -Eeuo pipefail

IMAGE="${SUPABASE_PG_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.132}"
NAME="jk-sqltest-$$"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cleanup() { [[ "${KEEP_CONTAINER:-0}" == "1" ]] || docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
[[ "${KEEP_CONTAINER:-0}" == "1" ]] && NAME="jk-sqldev"

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=pw "$IMAGE" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 2
done
sleep 5

psql_as() { local user="$1"; shift; docker exec -i "$NAME" psql -U "$user" -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

# Supabase Storage skapar sina tabeller själv; här räcker minimala stand-ins för migrationerna.
psql_as supabase_admin <<'SQL'
create table if not exists storage.buckets (id text primary key, name text, public boolean default false, created_at timestamptz default now());
create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, created_at timestamptz default now());
alter table storage.objects enable row level security;
grant usage on schema storage to postgres, authenticated, anon;
grant all on storage.buckets, storage.objects to postgres;
SQL

echo "== Migrationer"
for file in "$ROOT"/supabase/migrations/*.sql; do
  # Data som motsvarar produktion läggs in före de nya migrationerna (0027 och senare) för att testa uppgradering.
  if [[ "$(basename "$file")" == 0027_* && -f "$ROOT/supabase/tests/pre/legacy_seed.sql" ]]; then
    psql_as postgres -o /dev/null < "$ROOT/supabase/tests/pre/legacy_seed.sql" || { echo "FEL i legacy_seed.sql"; exit 1; }
    echo "ok pre/legacy_seed.sql (produktionsliknande data före 0027)"
  fi
  psql_as postgres -o /dev/null < "$file" 2> >(grep -v '^NOTICE' >&2) || { echo "FEL i $(basename "$file")"; exit 1; }
  echo "ok $(basename "$file")"
done

failed=0
echo "== Tester"
for file in "$ROOT"/supabase/tests/*.sql; do
  [[ -e "$file" ]] || continue
  output="$(psql_as postgres < "$file" 2>&1 || true)"
  passed="$(grep -c 'NOTICE:  ok' <<<"$output" || true)"
  fails="$(grep -E 'NOTICE:  FAIL|ERROR' <<<"$output" || true)"
  if [[ -n "$fails" ]]; then
    echo "-- $(basename "$file"): $passed ok, FEL:"
    echo "$fails"
    failed=1
  else
    echo "-- $(basename "$file"): $passed ok"
  fi
done
exit "$failed"
