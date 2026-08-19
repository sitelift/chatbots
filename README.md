# SiteLift Chatbots — Project Overview

A small, self-hosted platform for **one admin running many AI-powered chatbots** across different websites.

Each chatbot answers visitors using an OpenAI-compatible API. Business facts — pricing, hours, FAQs, product info — are written straight into the chatbot's **system prompt**. No vector databases, no embeddings, no complexity.

> **Status: implemented.** Node.js + Express + SQLite backend, a vanilla-JS embed widget, and a single-page admin dashboard. See [`docs/`](docs/) for the full design and [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for how to run it.

## The idea in one paragraph

A website owner embeds a small JavaScript widget on their site. The widget floats a chat bubble in the bottom-right corner. When a visitor types a message, the widget sends it to the SiteLift server, which looks up the chatbot's configuration (system prompt + API key), forwards the message to an OpenAI-compatible API, and returns the AI's reply. Everything is stored in SQLite so the admin can read the conversations later. The admin manages all of their chatbots — one per website — from a single dashboard.

## Design principles

1. **Dead simple.** No vector databases, no auth system, no microservices, no front-end framework. A few REST endpoints, one SQLite file, one HTML admin page, one vanilla-JS widget.
2. **Bring your own key.** Each chatbot has its own OpenAI-compatible API key. Keys are stored **encrypted** on the server and never sent to the browser or the widget.
3. **One admin, no login.** The admin is a single trusted person. Authentication is deliberately out of scope; the docs describe how to protect the dashboard with a reverse proxy or an optional token.
4. **Business facts live in the system prompt.** Editing facts = editing a textarea and saving. No re-indexing, no pipelines.
5. **Anonymous, AI-driven lead capture.** No forced forms. The bot naturally asks for a name/email and steers visitors toward calling the business; details land on the conversation.
6. **Built-in abuse prevention + Docker.** A 20-message context cap, a max message length, and a per-visitor rate limit keep token spend bounded. Deployed via Docker.

## The three pieces

| Piece | What it is | Where it lives |
| --- | --- | --- |
| **Admin dashboard** | A single HTML page to create/manage chatbots, edit system prompts, view conversations | Served by the SiteLift server at `/admin` |
| **Embed widget** | A self-contained JS file visitors load on a target website | Served by the SiteLift server at `/embed.js` |
| **API server** | Express app that serves the above and proxies chat to the AI provider | The SiteLift server itself |

## How a chat message flows

```
Visitor types "What are your hours?"
        │
        ▼
Embed widget (target website)
        │  POST /api/chat/:chatbotId/messages
        ▼
SiteLift API server
        │  1. load chatbot config (system prompt + encrypted API key)
        │  2. decrypt API key
        │  3. store visitor message in SQLite
        ▼
OpenAI-compatible API (OpenAI, OpenRouter, Ollama, ...)
        │  returns assistant reply
        ▼
SiteLift API server  →  stores reply in SQLite  →  returns reply to widget
        │
        ▼
Embed widget renders the reply
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the detailed lifecycle.

## Documentation index

| Document | What it covers |
| --- | --- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | End-to-end flow, component responsibilities, request lifecycle |
| [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) | SQLite schema: chatbots, conversations, messages |
| [`docs/EMBED.md`](docs/EMBED.md) | How to install and configure the widget on a target website |
| [`docs/API.md`](docs/API.md) | Full REST API reference (public + admin) |
| [`docs/SECURITY.md`](docs/SECURITY.md) | How API keys are protected, threat model, deployment hardening |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Docker + reverse-proxy deployment guide, backups, hardening checklist |
| [`AGENTS.md`](AGENTS.md) | Guide for AI coding assistants working in this repo |

## Decisions (settled)

Tracked in [`AGENTS.md`](AGENTS.md) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Key decisions:

- Node.js + Express + SQLite backend, vanilla JS widget and admin page.
- One global admin, no auth by default; optional token for the dashboard.
- Each chatbot stores its own encrypted API key server-side.
- AI providers supported via any **OpenAI-compatible** endpoint (`/v1/chat/completions`).
- Context window: last 20 messages per turn.
- Abuse prevention (v1): 20-message cap + 2000-char message limit + ~20 msgs/min per-visitor rate limit.
- Lead capture: AI-driven (no forced form), steering visitors toward calling the business.
- Deployment: Docker.
- Usage/cost dashboards: deferred — working and simple first, front end later.