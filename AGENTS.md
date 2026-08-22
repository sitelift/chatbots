# SiteLift — AGENTS.md

You are working on the **SiteLift** project: an open-source, self-hosted AI chatbot platform for **web agencies** running many branded chatbots across client websites. Each chatbot answers visitors via an OpenAI-compatible API with business facts embedded in the system prompt. **No vector databases, no embeddings** — knowledge is structured textareas in the dashboard.

**Current status: v2 rebuild underway — Milestone 0 complete.** The monorepo is scaffolded (`apps/server`, `apps/dashboard`, `packages/shared`, `packages/widget`) with the streaming chat loop working end-to-end and tested. The legacy v1 Express code and its docs have been fully removed; the architecture doc is the single implementation spec.

Before writing any code, read [`docs/PRODUCT.md`](docs/PRODUCT.md) (scope contract) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (implementation spec) in full.

## Project in one paragraph

A web agency self-hosts SiteLift via Docker. From the agency dashboard they create chatbots for client websites, invite business owners as `client` users, and paste an embed script on each site. Visitors chat with an on-brand widget (Shadow DOM, dependency-free `embed.js`) that streams replies from an OpenAI-compatible provider using a single global encrypted API key. Leads (name/email captured by the AI) trigger email notifications. Owners edit their own facts and watch stats; agencies see everything. Everything persists in SQLite.

## Documentation (table of contents)

| Document | What it covers | Status |
| --- | --- | --- |
| [`README.md`](README.md) | Overview, principles, quick flow, doc index | ✅ current |
| [`docs/PRODUCT.md`](docs/PRODUCT.md) | **Product contract**: positioning, personas, principles, v1 feature set, definition of done | ✅ done |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | **Implementation spec**: v2 stack, monorepo layout, components, lifecycles, decisions | ✅ done |
| [`docs/STYLE.md`](docs/STYLE.md) | **Design contract**: north stars, DNA rules, tokens, component + widget specs, release gate | ✅ done |

## Settled decisions

- **Stack:** TypeScript strict · Node 22 · Hono + Zod · SQLite + Drizzle ORM (+ drizzle-kit, drizzle-zod) · better-auth (email+password + passkeys, sessions, CSRF) · pino · nodemailer.
- **Frontend:** ONE React app (React 19 + Vite + Tailwind CSS v4 + shadcn/ui + TanStack Query) serving both roles; **URL routing via TanStack Router** (code-based tree, auth-guarded layout, prod basepath `/admin`, deep-linkable create/playground intents); design language per docs/STYLE.md.
- **Monorepo:** pnpm workspaces — `apps/server`, `apps/dashboard`, `packages/shared` (Zod contracts), `packages/widget`, `packages/config`. Tooling: Biome, Vitest, GitHub Actions.
- **Widget:** TS source → single dependency-free `embed.js`, Shadow DOM, `data-*` config, localStorage ids, streaming with optimistic UI, quick replies, optional proactive nudge, language matching, accessible (keyboard/ARIA/reduced motion).
- **Roles:** `agency` (full reach) / `client` (assigned chatbots only); ownership-chain scoping enforced in the query layer, never just UI.
- **Client capabilities:** clients edit their own facts/welcome/appearance directly (no approval queue).
- **AI:** official `openai` SDK with `baseURL` override; any OpenAI-compatible provider; system prompt = guardrail prefix + assembled facts sections + FAQ pairs; context = last 20 messages.
- **Key handling:** one global key, AES-256-GCM encrypted at rest, env fallback; never sent to browsers; 4-char hint only.
- **Security:** per-chatbot domain allowlist (Origin/Referer enforced), rate limits (~20 msgs/min per visitor, auth limits), 2000-char cap, SSRF-filtered admin-only scrape import, audit log, security headers.
- **Leads:** AI-driven capture onto conversations; instant email notification (SMTP); CSV export.
- **White-label:** free and core — agency branding across dashboard + widget; powered-by badge toggleable.
- **Deployment:** self-host Docker only; single container, named volume, migrations on boot, healthcheck.

## Open questions

1. Exact rate-limit numbers — tune after real traffic.
2. `visitorId` rotation after N days of inactivity.
3. Knowledge-gap detection heuristics — refine during build.

## Non-goals (v1)

RAG/embeddings/runtime retrieval · webhooks/Zapier · live human takeover inbox · billing/SaaS hosting · attachments/voice/images · automated custom domains.

## Working rules for AI assistants

- **Docs are the source of truth.** Update the relevant doc in the same change as any behavior change. Move items between "settled" and "open" only when explicitly agreed with the user.
- New code goes in the monorepo layout (`apps/`, `packages/`) in TypeScript strict mode. There is no legacy codebase — do not reintroduce Express-era patterns or env vars (e.g. ADMIN_TOKEN as a UI concept).
- Style bar: surfaces must meet [`docs/STYLE.md`](docs/STYLE.md) — tokens only, both color modes, all states designed. Ugly-but-working is not done.
- Never add code comments unless asked; never commit unless the user asks.
- Follow repo conventions (Biome formatting, Vitest tests, Zod-validated boundaries).
