# Architecture

Target architecture for the SiteLift v2 rebuild. This document is the implementation spec: precise enough to build from directly.

> **Status:** describes the v2 architecture. Milestone 0 (monorepo, server heartbeat, dashboard shell, widget, streaming E2E, Docker) is complete. See [PRODUCT.md](PRODUCT.md) for scope.

## 1. Big picture

One Node process serves everything:

1. **Public chat API** — unauthenticated endpoints for widgets: public chatbot metadata, SSE-streamed chat proxying to an OpenAI-compatible provider.
2. **Authenticated REST API** — serves the dashboard app. Roles: `agency` (full reach) and `client` (scoped to assigned chatbots).
3. **Static assets** — the built dashboard SPA (`/admin`) and the compiled `embed.js` (`/embed.js`).

Identity is handled by **better-auth** (email+password, passkeys, sessions). Data lives in **SQLite via Drizzle ORM**. The whole system ships as **one Docker container** with one volume.

### The data boundary

- **Public API** — reachable from anywhere, CORS-scoped per chatbot's allowed domains. Never exposes API keys or full prompts.
- **Dashboard API** — cookie-session authenticated via better-auth; every query filtered through the role ownership chain server-side.

## 2. Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Language | TypeScript, strict mode everywhere | Type safety end-to-end; contributor quality bar |
| Runtime | Node 22 LTS | Maximum compatibility; Hono keeps Bun/edge portable later |
| API framework | Hono + Zod | Web-standard, fast, mainstream (v4.x); Zod schemas define the API contract once |
| Database | SQLite + Drizzle ORM (+ drizzle-kit migrations, drizzle-zod) | Typed queries, real migrations, zero ops; Drizzle hit v1.0 |
| Auth | better-auth (passkey plugin, session cookies, CSRF, rate limiting) | The TS auth standard; replaces hand-rolled v1 auth |
| Dashboard | React 19 + Vite + Tailwind CSS v4 + shadcn/ui + TanStack Router/Query | The 2026 default for polished SaaS UIs; largest contributor pool |
| Widget | TypeScript source → Vite library build → single dependency-free `embed.js` in Shadow DOM | Dev-time safety, zero runtime surface, style isolation |
| AI providers | Official `openai` SDK with `baseURL` override, `stream: true` | Any OpenAI-compatible endpoint, clean streaming |
| Email | nodemailer (SMTP settings in admin) | Lead notifications |
| Logging | pino | Structured production logs |
| Tooling | pnpm workspaces · Biome (lint+format) · Vitest · GitHub Actions | One fast toolchain, tests from day one |
| Deploy | Multi-stage Dockerfile → single container + volume | `docker compose up -d` |

**Rejected (and why):** Next.js/Nuxt (SSR machinery unneeded; widget must stay framework-free), tRPC (widget needs plain REST regardless — two protocols worse than one), Bun-as-default (Node removes contributor friction), Postgres/Mongo (SQLite is correct for this product).

## 3. Repository layout

```
sitelift/
├── apps/
│   ├── server/        # Hono API + static serving of built assets
│   └── dashboard/     # ONE React app — role-aware (agency ⇄ owner)
├── packages/
│   ├── shared/        # Zod schemas + types = the API contract
│   ├── widget/        # TS source → dist/embed.js (tiny, dependency-free)
│   └── config/        # shared tsconfig/biome/vitest presets
├── docker/            # Dockerfile, compose, entrypoint
└── docs/
```

## 4. Components

### 4.1 `apps/server`

Hono application. Route groups:

| Area | Routes | Auth |
| --- | --- | --- |
| Public chat | `GET /api/chatbots/:id` (public metadata) · `POST /api/chat/:chatbotId/messages` · `POST /api/chat/:chatbotId/messages/stream` (SSE) | none; origin checked against chatbot's domain allowlist |
| Auth | better-auth mounted routes (email+password, passkeys, sessions) · `GET /api/auth/me` (current user) · `GET /api/auth/bootstrap` (fresh-install detection → `{ hasUsers }`) | rate-limited |
| Dashboard API | chatbots CRUD, clients, conversations, leads, analytics, settings, **website import** (`POST /api/admin/import`), **draft-facts tester** (`POST /api/admin/chatbots/:id/test`), **leads** (`GET /api/admin/chatbots/:id/leads`), **per-bot activity stats** (`GET /api/admin/chatbots/:id/stats?days=30`, daily conversation/lead/message buckets + totals) | better-auth session; role-scoped queries |
| Static | `/admin/*` (SPA), `/embed.js` (cacheable `public, max-age=600`) | none |

Cross-cutting middleware: security headers, per-visitor + auth rate limits, request logging (pino), error envelope (consistent problem+json-style errors).

**Streaming lifecycle (ported from v1, proven):**

1. Load chatbot by id → 404 if missing/paused; verify request origin against allowlist.
2. Validate content (non-empty, ≤2000 chars); rate-limit check per visitorId → 429.
3. Resolve conversation (create if absent; verify ownership) → insert user message row.
4. Load last 20 messages; resolve global key (settings decrypted → env fallback) and base URL (chatbot override → settings → env → default).
5. Flush SSE headers immediately → `event: meta` with ids (TTFB target <10ms).
6. Call provider with `stream: true`; forward deltas as `event: token`; persist usage tokens.
7. On completion persist assistant row → `event: done`. Provider errors → `event: error`.

Non-streaming `POST .../messages` retained as fallback.

**Provider contract:** any OpenAI-compatible `POST {baseUrl}/chat/completions`. System prompt = assembled business facts (plain-text sections + FAQ pairs, never a JSON dump) behind a fixed guardrail prefix: be helpful, brief (1-3 sentences), reply in plain text only (no JSON/markup), never invent prices/hours, admit unknowns, capture name/email naturally, escalate urgent things to phone/contact.

### 4.2 `apps/dashboard`

One React SPA at `/admin` (login included), built on **TanStack Router** (code-based tree) so every surface is a real URL — refresh, back/forward and deep links all work. Routes:

| Path | View | Notes |
| --- | --- | --- |
| `/login` | Sign-in / sign-up | Outside the guarded layout; defaults to **sign-up** when `GET /api/auth/bootstrap` reports an empty database |
| `/` | Overview | Live counts |
| `/chatbots` | List (+ `?new=1` opens create) | URL-driven intent |
| `/chatbots/$botId` | Full chatbot editor | Deep-linkable per client |
| `/settings` | Provider & key config | Agency role only |

Auth is enforced by a `beforeLoad` guard on the layout route (redirects to `/login` when the session is absent); role scoping is re-verified server-side on every request. In production the router runs with basepath `/admin` and the Hono server SPA-falls back any `/admin/*` path to the built `index.html`. Tests render pages through the same tree using memory history (`renderAtLocation`). Role-aware views:

- **Agency views:** setup wizard, chatbot list/create/edit (facts editor + FAQ pairs + prompt preview), client management, cross-bot conversation browser, lead inbox, analytics overview, settings (AI key, SMTP, branding, powered-by default).
- **Client views:** their chatbot(s) only — facts/appearance editor with the in-editor Test tab, chat history, lead list + CSV export, stats.

Data fetching via TanStack Query against the shared Zod contracts; UI via shadcn/ui + Tailwind v4. Design language follows PRODUCT.md principle 1 — clean, modern, premium; dark-mode aware; mobile-capable.

**Chatbot editor** is a four-tab page: **Leads** (default — captured name/email + last message), **Knowledge** (doc-style facts editor — each section labeled by topic with the visitor question as a hint, numbered FAQ pairs up to 50, coverage checklist, a bottom Misc field, and the assembled prompt preview as a first-class side pane), **Test** (an interactive widget preview answering from the draft facts via the admin test endpoint), **Settings** (set-once identity/domains/color/status/model + embed snippet + delete). The Knowledge tab is where the business loads the facts the bot will represent it with; there is no raw-prompt mode — facts are the only input.

**Website import** (`POST /api/admin/import`): SSRF-safe crawl — DNS + private-range blocking, redirect caps, same-origin links only (up to 5 pages, ~60k chars, junk-path denylist) → HTML-to-text extraction → the configured AI provider (the chatbot's selected model, else `AI_MODEL`) reads the combined page text and fills the `businessFactsSchema` JSON (all-LLM, one retry with error feedback, up to 20 FAQ pairs). The dashboard presents what was read and applies it as an editable draft — import never overwrites until the owner saves.

### 4.3 `packages/widget`

TypeScript source compiled by Vite to a single IIFE `embed.js` (no runtime dependencies). Mounted in **Shadow DOM** for total style isolation. Configured via `data-*` attributes (`chatbot-id`, `position`, overrides for theme/title/avatar). Behavior:

- Fetch public metadata → render bubble + panel; store `conversationId`/`visitorId` in localStorage per chatbot.
- Stream tokens optimistically; quick-reply chips; proactive nudge (configurable, default off); language-matched replies; graceful degradation when server/chatbot unavailable; keyboard/ARIA accessible; powered-by badge per settings.

Must never break the host page: no globals beyond one namespace, scoped styles via Shadow DOM.

### 4.4 `packages/shared`

Zod schemas for every API request/response plus shared types. drizzle-zod derives input validation from table definitions where possible. Server validates at the edge; dashboard imports the same schemas for forms and typed fetches. One contract, zero drift.

## 5. Data model (summary)

better-auth manages identity tables (users, sessions, accounts, passkeys). Application tables:

| Table | Purpose |
| --- | --- |
| `chatbots` | name, website URL, welcome message, brand color/avatar, model, base URL, temperature/max tokens, status (active/paused/archived), allowed domains, facts JSON (overview/hours/location/contact/services/pricing/policies/knowledge/FAQs), FAQ pairs JSON |
| `client_assignments` | maps client users → chatbots (the ownership chain) |
| `conversations` | per chatbot + visitorId; captured `visitor_name`/`visitor_email` (leads) |
| `messages` | role, content, token usage per row |
| `settings` | encrypted global AI key + hint, base URL, SMTP config, branding, powered-by default |
| `audit_log` | admin/client actions |

SQLite pragmas and indexes port from v1 (WAL, synchronous=NORMAL, cached prepared statements, indexes on conversation/message lookups). The full schema lives in `apps/server/src/db/schema.ts` — treat it as the source of truth until a dedicated DATA_MODEL.md is written.

## 6. Request lifecycles

### 6.1 Widget boot

```
Host page loads <script src="https://chat.example.com/embed.js" data-chatbot-id="ch_abc">
  → GET /api/chatbots/ch_abc (origin checked)
  → 200 { name, welcomeMessage, brandColor, avatar, quickReplies }
  → bubble renders; panel shows welcome message
```

404/disabled → widget renders nothing.

### 6.2 Visitor message (streaming)

See §4.1 streaming lifecycle. Widget renders optimistic user bubble, streams assistant tokens with cursor, persists nothing locally beyond localStorage ids.

### 6.3 Owner edits facts

Owner (role `client`) PUTs new facts via dashboard API → server verifies ownership chain → validates via shared Zod schema → updates row → prompt preview regenerates. Takes effect on next message; no restart.

## 7. Key decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Greenfield vs evolve | Rebuild in monorepo; port proven logic (streaming flow, rate limits, prompt assembly, encryption scheme) | Clean TS foundation beats carrying Express-era structure |
| Multi-tenancy | Two roles, ownership-chain scoping, no org trees | Matches agency→client reality; simple to reason about |
| Client capabilities | Clients edit own facts/settings directly | Decided in product planning; keeps clients self-sufficient |
| Knowledge | Structured facts + FAQ pairs in system prompt; no RAG | Predictable, honest, zero infra; the product promise |
| Human escalation | Prompt-level (surface contact info, offer follow-up) | Local businesses mostly need calls; live inbox is a different product |
| Notifications | Email only (SMTP) for v1 | The money moment; webhooks deferred |
| White-label | Free and core | The market wedge |
| Deployment | Self-host Docker only | Decided; PaaS templates deferred |

## 8. Security model

- better-auth sessions (httpOnly cookies, CSRF protection, passkeys supported); login rate limits.
- Role scoping enforced in query layer, not UI — a client token simply cannot select another tenant's rows.
- Domain allowlist per chatbot: public chat endpoints verify Origin/Referer against allowed domains; blocks token theft via embed reuse.
- Global AI key AES-256-GCM encrypted at rest (`ENCRYPTION_KEY`); only a 4-char hint ever reaches browsers.
- Per-visitor rate limits (~20 msgs/min), 2000-char cap, 20-message context cap bound abuse.
- SSRF-filtered scraper (private-range blocking) for the admin-only import.
- Audit log for sensitive actions; pino logs structured but secret-free.

A dedicated SECURITY.md (threat model, hardening checklist) will be written once auth lands in M1.

## 9. Deployment

Multi-stage Dockerfile: build stage compiles server + dashboard + widget; runtime stage carries only production deps and built assets. Single container, named volume for the SQLite file, `ENCRYPTION_KEY` required on first boot, migrations run automatically at startup, healthcheck hits `/health`. Reverse proxy (Caddy/nginx) terminates TLS upstream. Backups = copy the volume file.

## 10. Open questions

1. Exact rate-limit numbers — tune after real traffic (defaults ported from v1).
2. `visitorId` rotation after N days of inactivity.
3. Knowledge-gap detection heuristics (flagging "don't know" turns, clustering repeated questions) — refine during build.
