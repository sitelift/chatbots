# SiteLift

**The open-source, self-hosted AI chatbot platform for web agencies.**

One Docker container. Unlimited client chatbots. Your brand, not ours. Your API key, not our meter.

A web agency deploys SiteLift once, creates a branded AI chatbot for each client website, gives every business owner a login to their own bot, and bills clients whatever the market bears. Business facts live in the system prompt — no vector databases, no embeddings, no retrieval pipelines.

> **Status: v2 rebuild underway — Milestone 0 complete.** The TypeScript monorepo (`apps/server`, `apps/dashboard`, `packages/*`) is scaffolded with the streaming chat loop working end-to-end. The legacy v1 Express implementation has been removed; its proven logic lives on in the new server. Scope and "done" are defined in [`docs/PRODUCT.md`](docs/PRODUCT.md).

## The three surfaces

| Surface | Audience | What it does |
| --- | --- | --- |
| **Agency dashboard** | Web agency staff | Onboard clients, create/maintain chatbots, observe conversations, leads, analytics, manage settings |
| **Owner portal** | Business owner (agency's client) | Edit business facts, read chat history, see stats — scoped to their own chatbot(s) |
| **Widget** | Website visitor | On-brand streaming chat bubble that answers questions and captures leads |

The dashboard and portal are one role-aware application; the widget is a dependency-free `embed.js` mounted in Shadow DOM.

## Design principles

1. **Style is the product.** Every surface must feel clean, modern, premium. A half-built-looking surface is a bug.
2. **Dead-simple operations.** One container, one SQLite file, auto-migrations, backups = copy a file.
3. **Predictable economics.** BYO OpenAI-compatible API key, encrypted at rest. Token spend visible per chatbot.
4. **Agency-first multi-tenancy.** Clients see only their world; agencies see everything. Enforced server-side.
5. **Safe by default.** Rate limits, per-chatbot domain allowlists, CSRF, audit log, SSRF-filtered imports.
6. **Honest AI.** Facts in the system prompt; the bot admits ignorance and points to humans.

## How a chat message flows

```
Visitor types "What are your hours?"
        │
        ▼
Widget (Shadow DOM) — optimistic user bubble
        │  POST /api/chat/:chatbotId/messages/stream   (SSE)
        ▼
SiteLift server (Hono)
        │  1. load chatbot config + check domain allowlist
        │  2. rate-limit + validate
        │  3. store message (SQLite/Drizzle), flush meta event
        │  4. resolve global key (encrypted at rest) + base URL
        ▼
OpenAI-compatible API (OpenAI, OpenRouter, Groq, Ollama, ...)  stream:true
        │  streams delta tokens
        ▼
SiteLift server proxies token events → persists reply + usage
        │
        ▼
Widget renders tokens live; lead captured → email to owner
```

## Documentation index

| Document | What it covers | Status |
| --- | --- | --- |
| [`docs/PRODUCT.md`](docs/PRODUCT.md) | Positioning, personas, principles, full v1 feature set, definition of done | ✅ current |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | V2 implementation spec: stack, monorepo layout, components, lifecycles | ✅ current |
| [`docs/STYLE.md`](docs/STYLE.md) | Design contract: north stars, tokens, component + widget specs, style release gate | ✅ current |
| [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) | SQLite schema details | 🔶 legacy v1 — pending revision |
| [`docs/API.md`](docs/API.md) | REST API reference | 🔶 legacy v1 — pending revision |
| [`docs/EMBED.md`](docs/EMBED.md) | Widget install guide | 🔶 legacy v1 — pending revision |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Key protection, threat model, hardening | 🔶 legacy v1 — pending revision |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Docker deployment guide | 🔶 legacy v1 — pending revision |
| [`AGENTS.md`](AGENTS.md) | Guide for AI coding assistants | ✅ current |

## Decisions (settled)

Tracked in [`AGENTS.md`](AGENTS.md) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md):

- TypeScript strict everywhere; Node 22 + Hono + Zod; SQLite + Drizzle; better-auth (passwords + passkeys).
- One React app (React 19 + Vite + Tailwind v4 + shadcn/ui + TanStack) serving both agency and client roles.
- Widget authored in TS, built to a single dependency-free `embed.js` in Shadow DOM.
- Roles `agency` / `client`; clients edit their own facts directly; scoping enforced server-side.
- White-label free and core; powered-by badge toggleable; email-only lead notifications (SMTP).
- Per-chatbot domain allowlists; global AI key AES-256-GCM encrypted at rest.
- Deployment: self-hosted Docker only. No SaaS, no billing, no RAG in v1.
