# Deployment

How to run SiteLift Chatbots in production with Docker and a reverse proxy.

## Prerequisites

- Docker Engine + Docker Compose v2.
- A domain (e.g. `chat.example.com`) pointing at the host.
- A reverse proxy that terminates TLS (Caddy or nginx). Plain HTTP is never exposed to the public internet.

## Quick start

```bash
cp .env.example .env
# edit .env: set ENCRYPTION_KEY (see Configuration below)
docker compose up -d --build
```

The server listens on the host port `${PORT:-3000}` (default `3000`). The SQLite database is stored in the named volume `sitelift-data` and survives container rebuilds.

## Configuration

Set these in `.env` (git-ignored):

| Variable | Required | Notes |
| --- | --- | --- |
| `ENCRYPTION_KEY` | yes | 32-byte AES-256-GCM key, base64. Generate with `openssl rand -base64 32`. Must never change once keys are stored (see Backups). |
| `ADMIN_TOKEN` | recommended if public | Guards admin routes (`Authorization: Bearer <token>`). Leave empty for a single trusted admin. |
| `PORT` | no | Host port, default `3000`. |
| `HOST` | no | Bind address inside the container, default `0.0.0.0` so the proxy/host can reach it. |
| `DATABASE_PATH` | no | SQLite path inside the container, default `data/sitelift.db` (the mounted volume). |

Generate the encryption key:

```bash
openssl rand -base64 32
```

Paste the output into `ENCRYPTION_KEY` in `.env`. Compose passes the values through both `env_file: .env` and `environment:` (with `${VAR:-default}` fallbacks), so the service runs even without a `.env` present — but without a real `ENCRYPTION_KEY`, stored API keys cannot be encrypted.

## Reverse proxy (Caddy)

Terminate TLS at the proxy and reverse-proxy to the container on port `3000`:

```
chat.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000
}
```

If the dashboard is public, also set `ADMIN_TOKEN` in `.env`. For extra safety, bind only the admin surface behind the proxy's own auth layer (see SECURITY.md §2).

## Backups

The state lives in the `sitelift-data` volume (`data/sitelift.db`):

```bash
docker run --rm -v sitelift-chatbots_sitelift-data:/data -v "$PWD":/backup \
  alpine tar czf /backup/sitelift-backup-$(date +%F).tar.gz -C /data .
```

Keep `ENCRYPTION_KEY` **out of** the backup: without it the encrypted keys are useless, and with it the backup is a full key compromise. Store the key separately (secrets manager, password manager, or a separate git-ignored file).

Rotating the key requires re-entering each chatbot's plaintext API key via the dashboard (see SECURITY.md §4).

## Hardening checklist

From SECURITY.md §4:

- Run as non-root (the image already runs as the `node` user); keep the DB and `.env` in the named volume, not the image layer.
- Keep the DB and `.env` out of version control.
- Restrict file permissions on `data/` and `.env` (e.g. `600`).
- Terminate TLS at the reverse proxy; never serve plain HTTP publicly.
- Generate `ENCRYPTION_KEY` with `openssl rand -base64 32`; store it in a secrets manager or git-ignored `.env`.
- If the dashboard is reachable publicly, set `ADMIN_TOKEN` and prefer binding the admin surface to localhost behind the proxy.
- Enable the AI provider's own cost/rate limits in addition to SiteLift's built-in limits.
- Back up the DB volume regularly; keep `ENCRYPTION_KEY` separate from offsite backups.
