# Deployment

> **Status: legacy v1 reference (Express implementation). Pending revision for the v2 architecture — see [ARCHITECTURE.md](ARCHITECTURE.md).**

How to run SiteLift Chatbots on a VPS with Docker.

## One-command install (VPS)

```bash
git clone <your-repo> sitelift && cd sitelift
./install.sh
```

That's it. `install.sh`:

1. Checks for Docker + Compose v2
2. Creates `.env` with a random `ENCRYPTION_KEY` (and legacy `ADMIN_TOKEN` if missing; never overwrites)
3. Runs `docker compose up -d --build`
4. Prints `http://YOUR_IP:3000/admin` — open `/admin/login?setup=1` to create the owner (email+password, then add a passkey)

No manual `openssl`, no editing. For local testing you can also just run `docker compose up -d --build` — if no `.env` exists the container auto-generates and persists `ENCRYPTION_KEY` in the volume.

Open `Admin > Settings` and paste your OpenAI key. Create a chatbot and copy its embed snippet.

## Manual / alternative

```bash
cp .env.example .env
# optionally edit PORT/HOST, or leave defaults
docker compose up -d --build
```

If you started without `.env`, the first boot generates `ENCRYPTION_KEY` inside `sitelift-data:/app/data/.encryption_key` and reuses it. To make it visible on the host, run `./install.sh` once or copy it from the volume:

```bash
docker compose exec sitelift cat /app/data/.encryption_key
```

## Prerequisites

- Docker Engine + Docker Compose v2. No other deps.
- Any VPS (1 vCPU / 1GB RAM is fine). Tested on Hetzner, DigitalOcean, EC2.
- Domain + TLS are optional for testing; required for production (see Reverse proxy).

## Configuration

All vars are optional and live in `.env` (git-ignored). Compose also reads `env_file: .env` with `required: false`, so missing `.env` does not break `up`.

| Variable | Required | Notes |
| --- | --- | --- |
| `ENCRYPTION_KEY` | auto | 32-byte AES-256-GCM key, base64. `./install.sh` generates it. Must never change once API keys are stored (see Backups). |
| `ADMIN_TOKEN` | legacy | Deprecated fallback. New installs leave empty; use email+passkey login instead. |
| `PORT` | no | Host port, default `3000`. |
| `HOST` | no | Bind inside container, default `0.0.0.0`. With Caddy/nginx set `HOST=127.0.0.1` in `.env` and proxy to it. |
| `DATABASE_PATH` | no | SQLite path inside container, default `data/sitelift.db` (on the volume). |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` | no | Alternative to setting the key in Admin > Settings. |

## Reverse proxy (Caddy) - for public HTTPS

Caddy terminates TLS and proxies to `127.0.0.1:3000`:

```
chat.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000
}
```

If you use Caddy, set `HOST=127.0.0.1` in `.env` before `docker compose up -d` so the app only listens on localhost and the proxy is the public entrypoint.

## Backups

State lives in the `sitelift-data` volume (`data/sitelift.db` + auto-generated `.encryption_key` if no `.env` was used):

```bash
docker run --rm -v sitelift-chatbots_sitelift-data:/data -v "$PWD":/backup \
  alpine tar czf /backup/sitelift-backup-$(date +%F).tar.gz -C /data .
```

- If you used `./install.sh`, back up `.env` **separately** from the DB volume. Without `ENCRYPTION_KEY`, encrypted keys in the DB cannot be decrypted; with it, the backup is a full secret.
- If you ran without `.env` (volume-generated key), the key is already inside the backup. Keep off-site backups encrypted.

Rotating the key requires re-entering the API key via Admin > Settings (see `SECURITY.md`).

## Hardening checklist

From `SECURITY.md`:

- Image runs as `node` (non-root); healthcheck hits `/health`.
- Keep `.env` and `data/` out of git (`600`).
- Terminate TLS at the reverse proxy; never expose `3000` publicly without an owner account.
- Enable provider-side cost/rate limits in addition to the built-in 20 msgs/min per-visitor + 5 auth/15min limits.
- Back up the volume regularly.
