# SiteLift Chatbots — AGENTS.md

You are working on the **SiteLift Chatbots** project: a self-hosted platform for **one admin running many AI-powered chatbots** across different websites. Each chatbot answers visitors via an OpenAI-compatible API, with business facts embedded in the system prompt. **No vector databases, no embeddings** — knowledge is just a textarea in the admin dashboard.

**Current status: design phase.** The repo contains specification and design documentation only. No implementation code exists yet. Before writing any code, read `docs/ARCHITECTURE.md` in full — it is the implementation spec.

## Project in one paragraph

A website owner embeds a small vanilla-JS widget on their site. It floats a chat bubble bottom-right. Visitor messages go to the SiteLift server, which looks up the chatbot's config (system prompt + encrypted API key), forwards to an OpenAI-compatible `/v1/chat/completions` endpoint, and returns the reply. Everything is stored in SQLite. The admin manages all chatbots from a single dashboard page.

## Documentation (table of contents)

| Document | What it covers | Status |
| --- | --- | --- |
| [`README.md`](README.md) | High-level overview, design principles, quick start, doc index | ✅ done |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | **Implementation spec.** End-to-end flow, components, request lifecycle, key decisions, open questions, non-goals | ✅ done |
| [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) | SQLite schema: `chatbots`, `conversations`, `messages`; context window | ✅ done |
| [`docs/EMBED.md`](docs/EMBED.md) | Widget install guide, `data-*` attributes, visitor identity | ✅ done |
| [`docs/API.md`](docs/API.md) | Full REST API reference (embed, public chat, admin) | ✅ done |
| [`docs/SECURITY.md`](docs/SECURITY.md) | API key encryption, threat model, deployment hardening | ✅ done |

## Key architecture decisions (settled)

- **Stack:** Node.js + Express + SQLite backend; vanilla-JS widget and single-page admin UI. No front-end framework, no build step for the client.
- **Data model:** one global admin, no auth by default; optional `ADMIN_TOKEN`. Tables: `chatbots`, `conversations`, `messages`.
- **AI keys:** each chatbot stores its own key, **AES-256-GCM encrypted** server-side. Never sent to browser/widget; redacted in all admin responses.
- **Knowledge:** `business_facts` on the chatbot becomes the system prompt. Plain English, no retrieval.
- **Provider contract:** any OpenAI-compatible `POST /v1/chat/completions` endpoint.
- **Context window (v1):** last 20 messages per conversation sent to the provider each turn.
- **Streaming:** out of scope for v1 (non-streaming JSON response).
- **Public routes:** CORS allow any origin (needed for embedding). Admin routes gated by optional token.

## Open questions (to dial in — resolve before implementing)

Tracked in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §5. Highlights:

1. Confirm the 20-message context window vs a token-count cap.
2. Whether to add per-chatbot message count / cost estimate in the dashboard.
3. Deployment target (systemd / Docker / PaaS) — affects security docs.
4. Optional visitor name/email lead capture (v2).

## Working rules for AI assistants

- **This is a design-phase repo.** Do not start writing application code until the design docs are finalized and the user asks for implementation.
- Keep the documentation the single source of truth. If you change behavior, update the relevant docs in the same change.
- `docs/ARCHITECTURE.md` §5 "Open questions" and §6 "Non-goals" must stay accurate — move items to "settled" only when explicitly agreed.
- Never add code comments unless asked; never commit unless the user asks.
- Follow the repo's conventions (vanilla JS, no deps for the client) when implementation begins.
