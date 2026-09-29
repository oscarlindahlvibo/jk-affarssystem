#!/usr/bin/env bash

set -Eeuo pipefail

readonly PROJECT_DIR="${1:-/home/vibo/jkprojekt/supabase}"
readonly ENV_FILE="${PROJECT_DIR}/.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  printf 'Supabase environment file not found: %s\n' "${ENV_FILE}" >&2
  exit 1
fi

set_env() {
  local key=$1
  local value=$2

  if grep -q "^${key}=" "${ENV_FILE}"; then
    sed -i "s|^${key}=.*$|${key}=${value}|" "${ENV_FILE}"
  else
    printf '%s=%s\n' "${key}" "${value}" >> "${ENV_FILE}"
  fi
}

set_env COMPOSE_FILE "docker-compose.yml:docker-compose.jk.yml"
set_env SUPABASE_PUBLIC_URL "https://supabase.jkprojekt.se"
set_env API_EXTERNAL_URL "https://supabase.jkprojekt.se/auth/v1"
set_env SITE_URL "https://projekt.jkprojekt.se"
set_env ADDITIONAL_REDIRECT_URLS "https://projekt.jkprojekt.se/**,http://127.0.0.1:5173/**"

set_env POSTGRES_PORT "25432"
set_env POOLER_PROXY_PORT_TRANSACTION "26543"
set_env POOLER_TENANT_ID "jkprojekt"
set_env API_GW_HTTP_PORT "28000"
set_env KONG_HTTP_PORT "28000"

set_env STUDIO_DEFAULT_ORGANIZATION "JK Projektlogistik"
set_env STUDIO_DEFAULT_PROJECT "JK Affarssystem"
set_env DASHBOARD_USERNAME "jk-studio"

set_env DISABLE_SIGNUP "true"
set_env ENABLE_EMAIL_SIGNUP "true"
set_env ENABLE_EMAIL_AUTOCONFIRM "false"
set_env ENABLE_PHONE_SIGNUP "false"
set_env ENABLE_PHONE_AUTOCONFIRM "false"

set_env SMTP_ADMIN_EMAIL "system@jkprojekt.se"
set_env SMTP_SENDER_NAME "JK Projektlogistik"

set_env PROXY_DOMAIN "supabase.jkprojekt.se"
set_env CERTBOT_EMAIL "admin@jkprojekt.se"

chmod 600 "${ENV_FILE}"

printf 'Configured JK Supabase environment at %s\n' "${ENV_FILE}"
