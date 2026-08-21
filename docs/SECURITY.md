# Security

> **Status: legacy v1 reference (Express implementation). Pending revision for the v2 architecture — see [ARCHITECTURE.md](ARCHITECTURE.md).**

This document covers how SiteLift Chatbots protects secrets, its threat model, and how to deploy it safely. It is a design spec.

## Guiding principle

**The AI API key is the crown jewel.** It is stored encrypted at rest, decrypted only in memory for the duration of a single AI call, and never sent to the browser or the widget. The system prompt (business facts) is private too and is likewise never exposed to the widget.

## 1. API key handling

There is **one global AI-provider API key** for the whole server, shared by all chatbots — not a per-chatbot key.

### At rest

- The key is encrypted with **AES-256-GCM** before being written to SQLite, in the `settings` table under the key `openai_api_key`.
- The encryption key is the server's `ENCRYPTION_KEY` environment variable (32 bytes, base64), **never committed** (see `.env.example`).
- Only the encrypted blob and a short hint (`hint`, last 4 chars) are stored. An optional `openai_base_url` is stored in plaintext (it is not secret).
- AES-GCM provides authenticated encryption, so tampered ciphertext is rejected on decryption.
- **Alternative/fallback:** the key may instead come from the `OPENAI_API_KEY` environment variable. In that case it is a plaintext secret living in the environment / container env, not encrypted at rest in the DB. It is still never exposed via the API.

### In transit

- The decrypted key exists only as an in-memory string.
- It is used to set the `Authorization: Bearer` header on the outbound request to the AI provider.
- After the request completes, the reference is dropped; it is never logged.

### Never exposed

- The admin API **redacts** the key in every response. `GET /api/admin/settings` returns only `hasApiKey` + `apiKeyHint` (last 4 chars); the key itself is never returned.
- The public chat API and widget **never** have access to it.
- Error logs must not include the key or the full ciphertext.

## 2. Access control

### Admin dashboard / admin API

- Admin auth is **email + password (scrypt)** or **passkey (WebAuthn)** with `httpOnly` cookie sessions (`sitelift_session`). First owner is created via `POST /api/auth/setup` or `/admin/login?setup=1`.
- Sessions are hashed (SHA-256) in SQLite (`admin_sessions`), 30-day TTL with sliding expiration, CSRF-checked via `Origin`/`Referer`.
- Auth endpoints are rate-limited: 5 attempts / 15 min per IP.
- Legacy `ADMIN_TOKEN` is **deprecated** — only honored when **no users exist** and `ALLOW_ADMIN_TOKEN_FALLBACK=1` (migration aid). New installs should leave it empty.

The settings endpoints (`GET`/`PUT /api/admin/settings`) are admin-gated like all other admin routes.

### Public chat / embed

- Intentionally unauthenticated — the widget runs on arbitrary third-party sites.
- This means **anyone can send chat messages** to a chatbot. Abuse controls live in ARCHITECTURE §7.

## 3. Threat model

| Threat | Mitigation |
| --- | --- |
| Attacker reads the SQLite DB file | The global key is AES-256-GCM encrypted; without `ENCRYPTION_KEY` it is useless. DB file permissions are restrictive. (If `OPENAI_API_KEY` env is used instead of the encrypted settings key, the key lives in the environment / container env, not in the DB.) |
| Attacker gets `ENCRYPTION_KEY` | Full key compromise — protect it like a password; keep it out of the repo and out of backups alongside the DB. |
| Attacker reads admin responses | The key is never returned; `GET /api/admin/settings` exposes only `hasApiKey` + a 4-char hint. |
| Attacker calls the public chat API to spend your AI quota | v1 ships minimal abuse prevention: 20-message context cap, 2000-char message limit, and a ~20 msgs/min per-visitor rate limit (see ARCHITECTURE §7). Still recommend provider-side cost limits. |
| Attacker guesses/enumerates chatbot ids | Ids are long random strings (unguessable), but are still public once embedded. They are **not** a security boundary — treat them as public identifiers. |
| Prompt injection via visitor content | The system prompt instructs the model to stay in role and ignore attempts to reveal the system prompt or instructions. (This is a best-effort mitigation; no prompt is foolproof.) |
| XSS in the widget from AI replies | The widget renders AI text as plain text, never as HTML, and does not use `innerHTML` with model output. Escape all output. |
| CORS abuse | Public routes allow `*` (embedding). Admin/auth routes reflect `Origin` with `Allow-Credentials` and enforce CSRF checks. |
| Provider returns errors | Errors are returned as generic `502 AI_PROVIDER_ERROR` to the client; details logged server-side. |

### Website import (`POST /api/admin/chatbots/:chatbotId/scrape`)

- The scrape endpoint is **admin-only** (cookie session), so unauthenticated users cannot reach it.
- Because it fetches an arbitrary URL server-side, it is **SSRF-filtered**: `localhost`, `127.0.0.1`, `10./192.168./172.16-31.`, `169.254.169.254`, and `.internal` hosts are blocked, plus non-standard private ports.

## 4. Deployment hardening checklist

**Deployment target: Docker.** A `Dockerfile` + `docker-compose.yml` (with a named volume for `data/`) will be provided at implementation time. The checklist:

- Run the container as a non-root user; keep the SQLite DB and `.env` inside the container as a named volume, not in the image layer.
- Keep the DB and `.env` out of version control (see `.gitignore`).
- Restrict file permissions on `data/` and `.env` (e.g. `600`).
- Terminate TLS at a reverse proxy (Caddy/nginx) in front of the container; never serve plain HTTP to the public internet.
- Generate `ENCRYPTION_KEY` with `openssl rand -base64 32`; store it in a secrets manager or a git-ignored `.env`.
- If the dashboard is reachable on the public internet, create an owner account and prefer binding to localhost behind the proxy (do not rely on `ADMIN_TOKEN`).
- Enable the AI provider's own cost/rate limits to cap abuse (in addition to SiteLift's built-in limits).
- Take regular backups of the DB volume. If backing up offsite, keep `ENCRYPTION_KEY` out of the same backup.
- Rotate `ENCRYPTION_KEY` and re-encrypt keys with a documented procedure (note: re-encryption requires access to all plaintext keys or a re-entry of keys via the dashboard).

## 5. Environment variables

See `.env.example` for all values. Security-relevant ones:

| Variable | Purpose | Example |
| --- | --- | --- |
| `ENCRYPTION_KEY` | 32-byte AES key (base64) for encrypting stored API keys. | `openssl rand -base64 32` |
| `HOST` | Bind address. `127.0.0.1` recommended behind a proxy. | `127.0.0.1` |
| `DATABASE_PATH` | SQLite file path. | `data/sitelift.db` |
| `SESSION_TTL_MS` | Session lifetime (default 30d). | `2592000000` |
| `ADMIN_TOKEN` | Deprecated legacy fallback. | — |

## 6. What is intentionally NOT in scope

- Multi-tenancy / per-chatbot ACL (single owner role today).
- Per-IP rate limiting, daily per-chatbot budgets (beyond auth + visitor limits).
- Key vault integration.