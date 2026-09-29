#!/usr/bin/env bash
set -euo pipefail

SUPABASE_DIR="${SUPABASE_DIR:-/home/vibo/jkprojekt/supabase}"
ENV_FILE="${SUPABASE_DIR}/.env"
SMTP_SENDER_NAME="${SMTP_SENDER_NAME:-JK Projektlogistik}"

mode="${1:-}"
case "${mode}" in
  --relay)
    SMTP_HOST="${2:-}"
    SMTP_PORT="${3:-25}"
    SMTP_ADMIN_EMAIL="${4:-system@jkprojekt.se}"
    SMTP_USER=""
    SMTP_PASS=""
    ;;
  --authenticated)
    SMTP_HOST="${2:-}"
    SMTP_PORT="${3:-587}"
    SMTP_USER="${4:-}"
    SMTP_ADMIN_EMAIL="${5:-system@jkprojekt.se}"
    if [[ -n "${SMTP_USER}" ]]; then
      read -r -s -p "SMTP password for ${SMTP_USER}: " SMTP_PASS
      printf '\n'
    else
      SMTP_PASS=""
    fi
    ;;
  *)
    printf 'Usage:\n' >&2
    printf '  %s --relay SMTP_HOST SMTP_PORT [SENDER_EMAIL]\n' "$0" >&2
    printf '  %s --authenticated SMTP_HOST SMTP_PORT SMTP_USER [SENDER_EMAIL]\n' "$0" >&2
    exit 1
    ;;
esac

if [[ -z "${SMTP_HOST}" ]]; then
  printf 'SMTP host cannot be empty.\n' >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  printf 'Supabase environment file not found: %s\n' "${ENV_FILE}" >&2
  exit 1
fi

if [[ "${mode}" == "--authenticated" && -z "${SMTP_PASS}" ]]; then
  printf 'SMTP password cannot be empty.\n' >&2
  exit 1
fi

backup="${ENV_FILE}.before-smtp.$(date -u +%Y%m%dT%H%M%SZ)"
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

set_env SMTP_HOST "${SMTP_HOST}"
set_env SMTP_PORT "${SMTP_PORT}"
set_env SMTP_USER "${SMTP_USER}"
set_env SMTP_PASS "${SMTP_PASS}"
set_env SMTP_ADMIN_EMAIL "${SMTP_ADMIN_EMAIL}"
set_env SMTP_SENDER_NAME "${SMTP_SENDER_NAME}"

unset SMTP_PASS

cd "${SUPABASE_DIR}"
docker compose up -d --force-recreate auth

for _ in {1..30}; do
  if docker inspect --format '{{.State.Health.Status}}' supabase-jk-auth 2>/dev/null | grep -qx healthy; then
    printf 'SMTP configured and Supabase Auth is healthy.\n'
    printf 'Environment backup: %s\n' "${backup}"
    exit 0
  fi
  sleep 2
done

printf 'Supabase Auth did not become healthy in time. Inspect: docker logs supabase-jk-auth\n' >&2
exit 1
