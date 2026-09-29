#!/usr/bin/env bash

set -Eeuo pipefail

PATH=/usr/local/bin:/usr/bin:/bin
export PATH
export DOCKER_HOST="${DOCKER_HOST:-unix:///run/user/1000/docker.sock}"

umask 077

readonly RAID_BACKUP_ROOT="/mnt/md0/supabase-backups"
readonly FALLBACK_BACKUP_ROOT="${HOME}/supabase-backups"
readonly LOCK_FILE="${HOME}/.cache/supabase-backup.lock"

CURRENT_TEMP_DIR=""

log() {
  logger -t supabase-backup -- "$*"
  printf '%s %s\n' "$(date --iso-8601=seconds)" "$*"
}

cleanup() {
  if [[ -n "${CURRENT_TEMP_DIR}" && -d "${CURRENT_TEMP_DIR}" ]]; then
    rm -rf -- "${CURRENT_TEMP_DIR}"
  fi
}

on_error() {
  local exit_code=$?
  log "Backup failed with exit code ${exit_code}."
  cleanup
  exit "${exit_code}"
}

trap on_error ERR
trap cleanup EXIT

mkdir -p "$(dirname "${LOCK_FILE}")"
exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  log "Another backup is already running; skipping this execution."
  exit 0
fi

if [[ -d "${RAID_BACKUP_ROOT}" && -w "${RAID_BACKUP_ROOT}" ]]; then
  BACKUP_ROOT="${RAID_BACKUP_ROOT}"
  RETENTION_DAYS=30
else
  BACKUP_ROOT="${FALLBACK_BACKUP_ROOT}"
  RETENTION_DAYS=7
  log "RAID backup directory is unavailable; using ${FALLBACK_BACKUP_ROOT}."
fi

mkdir -p "${BACKUP_ROOT}"

backup_instance() {
  local instance_name=$1
  local database_container=$2
  local project_dir=$3
  local timestamp
  local instance_root
  local final_dir
  local image_name
  local -a archive_paths=()
  local candidate

  timestamp=$(date -u +%Y%m%dT%H%M%SZ)
  instance_root="${BACKUP_ROOT}/${instance_name}"
  final_dir="${instance_root}/${timestamp}"

  mkdir -p "${instance_root}"
  CURRENT_TEMP_DIR=$(mktemp -d "${instance_root}/.tmp-${timestamp}-XXXXXX")

  if [[ "$(docker inspect --format '{{.State.Running}}' "${database_container}")" != "true" ]]; then
    log "${instance_name}: database container ${database_container} is not running."
    return 1
  fi

  log "${instance_name}: creating PostgreSQL cluster dump."
  docker exec "${database_container}" \
    pg_dumpall -U postgres --clean --if-exists \
    | gzip -9 > "${CURRENT_TEMP_DIR}/database.sql.gz"
  gzip -t "${CURRENT_TEMP_DIR}/database.sql.gz"

  for candidate in \
    docker-compose.yml \
    .env \
    volumes/storage \
    volumes/functions \
    volumes/api \
    volumes/pooler; do
    if [[ -e "${project_dir}/${candidate}" ]]; then
      archive_paths+=("${candidate}")
    fi
  done

  log "${instance_name}: archiving Storage and restore configuration."
  tar -C "${project_dir}" -czf "${CURRENT_TEMP_DIR}/storage-config.tar.gz" \
    "${archive_paths[@]}"
  gzip -t "${CURRENT_TEMP_DIR}/storage-config.tar.gz"

  image_name=$(docker inspect --format '{{.Config.Image}}' "${database_container}")
  {
    printf 'instance=%s\n' "${instance_name}"
    printf 'created_at=%s\n' "$(date --iso-8601=seconds --utc)"
    printf 'host=%s\n' "$(hostname)"
    printf 'database_container=%s\n' "${database_container}"
    printf 'database_image=%s\n' "${image_name}"
    printf 'project_dir=%s\n' "${project_dir}"
  } > "${CURRENT_TEMP_DIR}/manifest.txt"

  (
    cd "${CURRENT_TEMP_DIR}"
    sha256sum database.sql.gz storage-config.tar.gz manifest.txt > SHA256SUMS
    sha256sum --check SHA256SUMS >/dev/null
  )

  mv "${CURRENT_TEMP_DIR}" "${final_dir}"
  CURRENT_TEMP_DIR=""
  log "${instance_name}: backup completed at ${final_dir}."
}

prune_backups() {
  local backup_root=$1
  local retention_days=$2
  local instance_root
  local expired_dir

  [[ -d "${backup_root}" ]] || return 0

  for instance_root in \
    "${backup_root}/shared" \
    "${backup_root}/accounted" \
    "${backup_root}/jk"; do
    [[ -d "${instance_root}" ]] || continue

    while IFS= read -r -d '' expired_dir; do
      case "${expired_dir}" in
        "${instance_root}"/20*T*Z)
          rm -rf -- "${expired_dir}"
          ;;
      esac
    done < <(
      find "${instance_root}" -mindepth 1 -maxdepth 1 -type d \
        -name '20*T*Z' -mtime "+${retention_days}" -print0
    )
  done
}

backup_instance \
  "shared" \
  "supabase-db" \
  "/home/vibo/atm-personal-supabase"

backup_instance \
  "accounted" \
  "supabase-accounted-db" \
  "/home/vibo/accounted/supabase"

backup_instance \
  "jk" \
  "supabase-jk-db" \
  "/home/vibo/jkprojekt/supabase"

prune_backups "${BACKUP_ROOT}" "${RETENTION_DAYS}"
if [[ "${BACKUP_ROOT}" != "${FALLBACK_BACKUP_ROOT}" ]]; then
  prune_backups "${FALLBACK_BACKUP_ROOT}" 7
fi

log "All Supabase backups completed successfully."
