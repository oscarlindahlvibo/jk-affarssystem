#!/usr/bin/env bash
set -euo pipefail

SUPABASE_DIR="${SUPABASE_DIR:-/home/vibo/jkprojekt/supabase}"
ENV_FILE="${SUPABASE_DIR}/.env"
CREDENTIALS_FILE="${1:-}"
SHARED_DRIVE_ID="${2:-0AEBJmdIO2OmUUk9PVA}"

if [[ -z "${CREDENTIALS_FILE}" || ! -f "${CREDENTIALS_FILE}" ]]; then
  printf 'Usage: %s /path/to/service-account.json [SHARED_DRIVE_ID]\n' "$0" >&2
  exit 1
fi
if [[ ! -f "${ENV_FILE}" ]]; then
  printf 'Supabase environment file not found: %s\n' "${ENV_FILE}" >&2
  exit 1
fi

account_type="$(jq -r '.type // empty' "${CREDENTIALS_FILE}")"
client_email="$(jq -r '.client_email // empty' "${CREDENTIALS_FILE}")"
private_key="$(jq -r '.private_key // empty' "${CREDENTIALS_FILE}")"
if [[ "${account_type}" != "service_account" || -z "${client_email}" || -z "${private_key}" ]]; then
  printf 'The credentials file is not a valid Google service-account key.\n' >&2
  exit 1
fi

credentials_base64="$(base64 < "${CREDENTIALS_FILE}" | tr -d '\n')"
backup="${ENV_FILE}.before-google-drive.$(date -u +%Y%m%dT%H%M%SZ)"
cp -p "${ENV_FILE}" "${backup}"

set_env() {
  local key="$1"
  local value="$2"
  local temp
  local updated=0
  temp="$(mktemp)"
  while IFS= read -r line || [[ -n "${line}" ]]; do
    if [[ "${line}" == "${key}="* ]]; then
      printf '%s=%s\n' "${key}" "${value}" >> "${temp}"
      updated=1
    else
      printf '%s\n' "${line}" >> "${temp}"
    fi
  done < "${ENV_FILE}"
  if [[ "${updated}" -eq 0 ]]; then
    printf '%s=%s\n' "${key}" "${value}" >> "${temp}"
  fi
  chmod --reference="${ENV_FILE}" "${temp}"
  mv "${temp}" "${ENV_FILE}"
}

set_env GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 "${credentials_base64}"
set_env GOOGLE_SHARED_DRIVE_ID "${SHARED_DRIVE_ID}"
unset credentials_base64 private_key

cd "${SUPABASE_DIR}"
docker compose up -d --force-recreate functions

for _ in {1..30}; do
  if docker inspect --format '{{.State.Health.Status}}' supabase-jk-edge-functions 2>/dev/null | grep -qx healthy; then
    printf 'Google Drive credentials installed.\n'
    printf 'Service account: %s\n' "${client_email}"
    printf 'Shared Drive ID: %s\n' "${SHARED_DRIVE_ID}"
    printf 'Environment backup: %s\n' "${backup}"
    exit 0
  fi
  sleep 2
done

printf 'Edge Functions did not become healthy. Inspect: docker logs supabase-jk-edge-functions\n' >&2
exit 1
