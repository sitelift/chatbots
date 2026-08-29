<p align="center">
  <img src="assets/sitelift-wordmark.svg" alt="SiteLift" width="280" />
</p>

<p align="center">
  <strong>The open-source, self-hosted AI chatbot platform for web agencies.</strong>
</p>

<p align="center">
  One Docker container · Unlimited client chatbots · Your brand · Your API key
</p>

<p align="center">
  <a href="https://github.com/sitelift/chatbots/actions/workflows/ci.yml"><img src="https://github.com/sitelift/chatbots/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen" alt="Node 22+" />
  <img src="https://img.shields.io/badge/typescript-strict-blue" alt="TypeScript strict" />
  <img src="https://img.shields.io/badge/deploy-docker-2496ED" alt="Docker" />
  <img src="https://img.shields.io/badge/ai-OpenAI--compatible-412991" alt="OpenAI-compatible" />
</p>

---

Deploy SiteLift once. Create a branded chatbot for every client website. Hand each business owner a login. Bill what the market bears.

Business facts live in the system prompt — **no vector databases, no embeddings, no retrieval pipelines**. Bring any OpenAI-compatible key (OpenAI, OpenRouter, Groq, Ollama, …). Flat infra cost. Full token transparency.

## Why agencies pick it

| Problem with the alternatives | SiteLift |
| --- | --- |
| SaaS meters and credit overages | BYO key. Predictable spend. |
| White-label locked behind enterprise | White-label is free and core |
| No real multi-client sub-accounts | Clients are first-class, scoped server-side |
| Postgres + Redis + three services to babysit | One container. One SQLite file. |
| Opaque token bills | Usage stored per message; analytics next |

## Three surfaces, one product

| Surface | Who | Job |
| --- | --- | --- |
| **Agency dashboard** | Your team | Clients, chatbots, settings, inbox, import |
| **Owner portal** | The business owner | Edit facts, appearance, welcome — their bots only |
| **Widget** | Website visitors | On-brand streaming chat + in-chat handoff form |

Dashboard and portal are **one role-aware React app**. The widget is a dependency-free `embed.js` in Shadow DOM.

## What's working today

- Streaming chat (SSE) with optimistic UI, quick replies, abort-on-close
- Facts editor + FAQ pairs + website scrape-to-draft import
- Agency / client roles with ownership-chain scoping
- Client invites and accept-invite flow
- Per-bot **Inbox** (all threads / leads) + activity chart
- In-chat **handoff** contact card → owner email (SMTP)
- Provider hardening: timeouts, sticky cache, routing modes, mid-stream error honesty
- Domain allowlists, rate limits, encrypted API key at rest
- Docker one-shot deploy

Still on the roadmap: cross-bot agency inbox, deeper analytics, white-label polish, Playwright E2E, CSV export. Details in [`PROGRESS.md`](PROGRESS.md).

## Quick start

### Docker (recommended)

```bash
git clone https://github.com/sitelift/chatbots.git
cd chatbots
cp .env.example .env          # add OPENAI_API_KEY (and optional OPENAI_BASE_URL)
docker compose -f docker/docker-compose.yml up -d --build
```

Open **http://localhost:3000/admin** — first sign-up becomes the agency account.

### Local development

```bash
corepack enable && pnpm install
pnpm approve-builds           # better-sqlite3 + esbuild (first time)
cp .env.example .env          # OPENAI_API_KEY / OPENAI_BASE_URL

pnpm dev                      # API :3000  (also serves /admin, /embed.js)
pnpm dev:dashboard            # Vite :5173 (proxies /api + /embed.js)
```

```bash
pnpm test && pnpm lint && pnpm typecheck && pnpm build
```

### Embed on a client site

```html
<script
  src="https://YOUR_HOST/embed.js"
  data-chatbot-id="ch_…"
  data-api-base="https://YOUR_HOST"
  async
></script>
```

Add the site's origin under the chatbot's **allowed domains** or the widget will refuse to answer.

## How a message flows

```
Visitor → Widget (Shadow DOM, optimistic bubble)
       → POST /api/chat/:id/messages/stream  (SSE)
       → SiteLift (allowlist · rate limit · last-20 context · handoff tool)
       → OpenAI-compatible provider  (stream:true, pooled keep-alive)
       → token events → widget; optional handoff card → owner email
```

## Stack

| Layer | Choice |
| --- | --- |
| Runtime | Node 22 · TypeScript strict |
| API | Hono + Zod |
| Data | SQLite + Drizzle |
| Auth | better-auth (email/password, sessions) |
| Dashboard | React 19 · Vite · Tailwind v4 · TanStack Router/Query · shadcn/ui |
| Widget | TS → single `embed.js`, Shadow DOM |
| Email | nodemailer (SMTP in Settings) |
| Deploy | Multi-stage Docker · one volume · migrations on boot |

## Monorepo layout

```
apps/server        Hono API + static /admin + /embed.js
apps/dashboard     Agency + owner UI (role-aware)
packages/shared    Zod contracts shared by server & dashboard
packages/widget    Widget source → embed.js
packages/config    Shared tooling presets
docker/            Dockerfile + compose
docs/              Product, architecture, style contracts
```

## Documentation

| Doc | What it is |
| --- | --- |
| [`PROGRESS.md`](PROGRESS.md) | Living handoff — done, next, gotchas |
| [`docs/PRODUCT.md`](docs/PRODUCT.md) | Scope contract & definition of done |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Implementation spec |
| [`docs/STYLE.md`](docs/STYLE.md) | Design system & release gate |
| [`AGENTS.md`](AGENTS.md) | Guide for AI coding assistants |

## Design principles

1. **Style is the product** — half-built-looking surfaces are bugs.
2. **Dead-simple ops** — one container, one SQLite file, backups = copy a file.
3. **Predictable economics** — BYO key, encrypted at rest, spend visible per bot.
4. **Agency-first multi-tenancy** — clients see their world; agencies see everything. Enforced in the query layer.
5. **Safe by default** — domain allowlists, rate limits, CSRF, SSRF-filtered imports.
6. **Honest AI** — facts in the prompt; admit ignorance; hand off to humans.

## Status

Actively rebuilt as **v2** on a TypeScript monorepo. Auth, CRUD, owner portal, knowledge editor, widget, handoffs, and per-bot inbox are in place. See [`PROGRESS.md`](PROGRESS.md) for the honest snapshot and roadmap.

## Contributing

Issues and PRs welcome. Before opening a PR:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

Read [`docs/PRODUCT.md`](docs/PRODUCT.md) for scope and [`docs/STYLE.md`](docs/STYLE.md) before UI work. Keep [`PROGRESS.md`](PROGRESS.md) updated when you land a stable chunk.
