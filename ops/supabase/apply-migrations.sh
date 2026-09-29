#!/usr/bin/env bash

set -Eeuo pipefail

readonly DATABASE_CONTAINER="${DATABASE_CONTAINER:-supabase-jk-db}"
readonly MIGRATIONS_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/supabase/migrations}"

if [[ ! -d "${MIGRATIONS_DIR}" ]]; then
  printf 'Migration directory not found: %s\n' "${MIGRATIONS_DIR}" >&2
  exit 1
fi

if [[ "$(docker inspect --format '{{.State.Running}}' "${DATABASE_CONTAINER}")" != "true" ]]; then
  printf 'Database container is not running: %s\n' "${DATABASE_CONTAINER}" >&2
  exit 1
fi

docker exec -i "${DATABASE_CONTAINER}" psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
create schema if not exists app_migrations;
create table if not exists app_migrations.schema_migrations (
  version text primary key,
  checksum text not null,
  applied_at timestamptz not null default now()
);
SQL

shopt -s nullglob
migrations=("${MIGRATIONS_DIR}"/*.sql)
if (( ${#migrations[@]} == 0 )); then
  printf 'No SQL migrations found in %s\n' "${MIGRATIONS_DIR}" >&2
  exit 1
fi

for migration in "${migrations[@]}"; do
  version=$(basename "${migration}")
  checksum=$(sha256sum "${migration}" | awk '{print $1}')
  applied_checksum=$(
    printf "select checksum from app_migrations.schema_migrations where version = :'migration_version';\n" \
      | docker exec -i "${DATABASE_CONTAINER}" \
        psql -v ON_ERROR_STOP=1 -U postgres -d postgres -At \
        -v migration_version="${version}"
  )

  if [[ -n "${applied_checksum}" ]]; then
    if [[ "${applied_checksum}" != "${checksum}" ]]; then
      printf 'Checksum mismatch for applied migration %s\n' "${version}" >&2
      exit 1
    fi
    printf 'Already applied: %s\n' "${version}"
    continue
  fi

  printf 'Applying: %s\n' "${version}"
  {
    printf 'begin;\n'
    printf '\\set ON_ERROR_STOP on\n'
    cat "${migration}"
    printf "\ninsert into app_migrations.schema_migrations (version, checksum) values (:'migration_version', :'checksum');\n"
    printf 'commit;\n'
  } | docker exec -i "${DATABASE_CONTAINER}" \
    psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
    -v migration_version="${version}" \
    -v checksum="${checksum}"
done

printf 'All migrations are up to date.\n'
