# JK self-hosted Supabase

Production layout on `vibo-server`:

- Project directory: `/home/vibo/jkprojekt/supabase`
- Compose project: `supabase-jk`
- API gateway: `127.0.0.1:28000`
- Session pooler: `127.0.0.1:25432`
- Transaction pooler: `127.0.0.1:26543`
- Public API hostname: `https://supabase.jkprojekt.se`
- Frontend hostname: `https://projekt.jkprojekt.se`

The checked-in `docker-compose.jk.yml` is layered on top of Supabase's pinned
self-hosted release. It provides unique container names, loopback-only port
bindings, and per-container log rotation.

Apply application migrations with:

```bash
/home/vibo/jkprojekt/apply-migrations.sh /home/vibo/jkprojekt/migrations
```

Create an immediate backup with:

```bash
/home/vibo/bin/backup-self-hosted-supabase.sh
```

Do not commit the production `.env`; it contains database credentials and API
secrets. Supabase Studio is intentionally not routed through public Nginx.

## Email and account invitations

The `invite-user` Edge Function accepts requests only from an active admin and
derives the organization from that admin's profile. Configure either the
IP-restricted Microsoft 365 relay or an authenticated transactional provider:

```bash
# Microsoft 365 relay after the server IP has been allowed in a connector:
/home/vibo/jkprojekt/configure-smtp.sh --relay \
  jkprojekt-se.mail.protection.outlook.com 25 system@jkprojekt.se

# Authenticated transactional SMTP provider:
/home/vibo/jkprojekt/configure-smtp.sh --authenticated \
  SMTP_HOST 587 SMTP_USER system@jkprojekt.se
```

The script backs up `.env` and recreates only the Auth container. Authenticated
mode prompts for the password. Relay mode writes empty credentials and must be
restricted to the server's static IP in Microsoft 365. Do not use Exchange
Online Basic Auth credentials for a normal mailbox.

## Central Google Drive storage

Project documents can be stored in the WPE Shared Drive `JK PROJEKT` with ID
`0AEBJmdIO2OmUUk9PVA`. Create a dedicated Google service account, enable the
Google Drive API, download its JSON key, and add the service account email to
the Shared Drive with the Content manager role. Install the key interactively:

```bash
/home/vibo/jkprojekt/configure-google-drive.sh \
  /path/to/service-account.json 0AEBJmdIO2OmUUk9PVA
```

The key is base64-encoded into the server-only Supabase `.env` and injected
only into the Edge Functions container. It must never be committed or included
in a frontend build. The `drive-file` function authorizes every request against
the JK database and creates one folder per project in the Shared Drive.

## Web application

The production SPA is served by a rootless Nginx container on
`127.0.0.1:25173`. Build with the production Vite variables, copy `dist` and
the contents of `ops/web` to `/home/vibo/jkprojekt/web`, then run:

```bash
cd /home/vibo/jkprojekt/web
docker compose up -d
```

The host proxy configuration is `ops/nginx/projekt.jkprojekt.se.conf`.
