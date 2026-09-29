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

## Web application

The production SPA is served by a rootless Nginx container on
`127.0.0.1:25173`. Build with the production Vite variables, copy `dist` and
the contents of `ops/web` to `/home/vibo/jkprojekt/web`, then run:

```bash
cd /home/vibo/jkprojekt/web
docker compose up -d
```

The host proxy configuration is `ops/nginx/projekt.jkprojekt.se.conf`.
