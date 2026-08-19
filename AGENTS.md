# SiteLift Chatbots — AGENTS.md

You are working on the **SiteLift Chatbots** project: a self-hosted platform for **one admin running many AI-powered chatbots** across different websites. Each chatbot answers visitors via an OpenAI-compatible API, with business facts embedded in the system prompt. **No vector databases, no embeddings** — knowledge is just a textarea in the admin dashboard.

**Current status: implemented.** The repo contains the full Node.js + Express + SQLite implementation (`server.js`, `src/`, `public/`) alongside the design docs. Before writing any code, read `docs/ARCHITECTURE.md` in full — it is the implementation spec.

## Project in one paragraph

A website owner embeds a small vanilla-JS widget on their site. It floats a chat bubble bottom-right. Visitor messages go to the SiteLift server, which looks up the chatbot's config (business facts), forwards to an OpenAI-compatible `/v1/chat/completions` endpoint using a single global API key, and returns the reply. Everything is stored in SQLite. The admin manages all chatbots from a single dashboard page.

## Documentation (table of contents)

| Document | What it covers | Status |
| --- | --- | --- |
| [`README.md`](README.md) | High-level overview, design principles, quick start, doc index | ✅ done |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | **Implementation spec.** End-to-end flow, components, request lifecycle, key decisions, open questions, non-goals | ✅ done |
| [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) | SQLite schema: `chatbots`, `settings`, `conversations`, `messages`; context window | ✅ done |
| [`docs/EMBED.md`](docs/EMBED.md) | Widget install guide, `data-*` attributes, visitor identity | ✅ done |
| [`docs/API.md`](docs/API.md) | Full REST API reference (embed, public chat, admin) | ✅ done |
| [`docs/SECURITY.md`](docs/SECURITY.md) | API key encryption, threat model, deployment hardening | ✅ done |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Docker + reverse-proxy deployment guide, backups, hardening checklist | ✅ done |
## Key architecture decisions (settled)

- **Stack:** Node.js + Express + SQLite backend; vanilla-JS widget and single-page admin UI. No front-end framework, no build step for the client.
- **Data model:** one global admin, no auth by default; optional `ADMIN_TOKEN`. Tables: `chatbots`, `conversations`, `messages`, `settings`.
- **AI key:** one **global** OpenAI-compatible key shared by all chatbots, **AES-256-GCM encrypted** at rest in the `settings` table (set in Admin → Settings) with `OPENAI_API_KEY`/`OPENAI_BASE_URL` env fallback. Never sent to browser/widget; only a 4-char hint is ever returned.
- **Knowledge:** `business_facts` on the chatbot becomes the system prompt. Stored as structured `facts` (`hours`, `contact`, `faq`, `products`, `misc`) that the server assembles into the prompt; a one-time admin-only scrape-to-draft import pulls text from the target site (no runtime retrieval).
- **Provider contract:** any OpenAI-compatible `POST /v1/chat/completions` endpoint.
- **Context window (v1):** last 20 messages per conversation sent to the provider each turn.
- **Abuse prevention (v1):** 20-message cap + 2000-char message limit + ~20 msgs/min per-visitor rate limit (in-memory, keyed by visitorId).
- **Lead capture:** anonymous by default; the AI naturally asks for name/email and steers visitors toward calling the business. Volunteered name/email stored on the conversation.
- **Deployment:** Docker (Dockerfile + docker-compose with a named volume for `data/`).
- **Usage/cost dashboards:** deferred — not in v1.
- **Streaming:** out of scope for v1 (non-streaming JSON response).
- **Public routes:** CORS allow any origin (needed for embedding). Admin routes gated by optional token.

## Open questions (to dial in — resolve before implementing)

Tracked in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §5. Highlights:

1. Exact rate-limit numbers (start with ~20 msgs/min, 2000 chars; tune after real traffic).
2. Whether `visitorId` should rotate after N days of inactivity.
3. ~~Final Docker image base, volume layout, and reverse-proxy example~~ — **settled**, documented in `docs/DEPLOYMENT.md`.

## Working rules for AI assistants

- **The codebase is implemented.** Follow the conventions above (vanilla JS, no deps for the client) and the module layout under `src/` and `public/`. Update the relevant docs in the same change as any behavior change.
- Keep the documentation the single source of truth. If you change behavior, update the relevant docs in the same change.
- `docs/ARCHITECTURE.md` §5 "Open questions" and §6 "Non-goals" must stay accurate — move items to "settled" only when explicitly agreed.
- Never add code comments unless asked; never commit unless the user asks.
- Follow the repo's conventions (vanilla JS, no deps for the client) when implementation begins.
