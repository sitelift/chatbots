# Product Definition

What SiteLift is, who it serves, and exactly what "done" means for v1. This is the product contract: build against it, and resolve scope debates by pointing at it.

## 1. Positioning

> **SiteLift is the open-source, self-hosted AI chatbot platform for web agencies.**
>
> One Docker container. Unlimited client chatbots. Your brand, not ours. Your API key, not our meter.

A web agency deploys SiteLift once on infrastructure they control, creates a branded chatbot for every client website, hands each business owner a login to manage their own bot, and bills clients whatever the market bears. SiteLift itself is invisible to the client unless the agency chooses otherwise.

**The buyer is the agency. The daily user is the business owner. The end customer is the website visitor.**

## 2. Why someone picks SiteLift

| Their problem with alternatives | Our answer |
| --- | --- |
| SaaS chatbots bill per message/credit ($19–500/mo, unpredictable overages) | Self-hosted, bring-your-own OpenAI-compatible key. Flat infra cost, full token transparency |
| White-label branding costs $39–199/mo extra or is enterprise-only | White-label is free and core |
| No real multi-client management (sub-accounts are rare even in SaaS) | Client sub-accounts are a first-class feature |
| OSS alternatives (Chatwoot, LibreChat, ChatterMate) need multiple services, Postgres, Redis | One container, one SQLite file, `docker compose up -d` |
| Credit systems hide what bots actually cost | Token usage visible per chatbot, per message |

## 3. Surfaces and audiences

| Surface | Audience | Job to do |
| --- | --- | --- |
| **Agency dashboard** | Web agency staff | Onboard clients, create and maintain chatbots, observe everything, manage global settings |
| **Owner portal** | Business owner (the agency's client) | Edit and confirm business facts, read chat history, see stats and leads — scoped to their own chatbot(s) only |
| **Widget** | Website visitor | Get instant, accurate, on-brand answers; become a captured lead |

The agency dashboard and owner portal are **one application with role-based scopes**, not two products. Same shell, same components, different reach.

## 4. Product principles

1. **Style is the product.** Every surface — dashboard, portal, widget, docs — must feel clean, modern, and premium. Generous whitespace, consistent rhythm, dark-mode aware, tasteful motion. A surface that looks half-built is a bug. (Full design language: decided in the design spec; shadcn/ui defaults are the floor, never the ceiling.)
2. **Dead-simple operations.** One container, one SQLite file, auto-migrations on boot, backups = copy a file. If deployment needs a wiki, we failed.
3. **Predictable economics.** BYO API key, no meters, no credits. Agencies see exactly what each chatbot spends.
4. **Agency-first multi-tenancy.** Clients see only their world; agencies see everything. Scoping is enforced server-side, always.
5. **Safe by default.** Encrypted keys at rest, rate limits, domain allowlists, audit log. Self-hosted must not mean insecure.
6. **Honest AI.** Business facts in the system prompt — no retrieval, no hallucinated prices. The bot admits ignorance and escalates to a human path.

## 5. V1 feature set

### 5.1 Platform (invisible but critical)

| Feature | Notes |
| --- | --- |
| Roles: `agency` / `client`, enforced server-side on every query | Ownership chain: user → assignment → chatbot |
| Per-chatbot domain allowlist | Widget only answers when embedded on allowed origins |
| Global AI key, encrypted at rest, never sent to any browser | Resolved per request; env fallback |
| Rate limits (per-visitor, auth), CSRF, security headers, audit log | Port of proven v1 approach |
| SSRF-filtered scrape-to-draft import | Admin-only, setup-time helper |
| Single container, SQLite volume, migrations on boot, health endpoint | Deployment story in one command |

### 5.2 Agency surface

| Feature | Notes |
| --- | --- |
| First-run setup wizard: account → AI key → first chatbot → embed snippet | Competitors win on "<1 hour to live"; so do we |
| Chatbot CRUD + pause/archive | Pause stops token spend without deleting history |
| Client management: invite owners, assign chatbots, reset access | The reseller infrastructure SaaS lacks |
| Facts editor (sections + FAQ pairs) with live prompt preview | The core editing experience; must feel excellent |
| Conversation browser across bots + global lead inbox | Table stakes |
| Analytics: conversations/leads trends, top questions, knowledge gaps, token spend | Knowledge gaps tell owners what to add next |
| White-label branding: agency name/logo/color across dashboard and widget | Free here; $39–199/mo elsewhere |

### 5.3 Owner surface

| Feature | Notes |
| --- | --- |
| Edit own business facts, welcome message, appearance + in-editor Test preview | Decided: clients edit directly, no approval queue |
| Chat history, lead list, CSV export | Table stakes |
| Instant email notification when a lead is captured | SMTP configured by the agency; email-only for v1 |
| Stats view: conversations/leads trend, popular questions | Owners must *see* ROI or they churn |

### 5.4 Widget

| Feature | Notes |
| --- | --- |
| Dependency-free `embed.js` mounted in Shadow DOM | Style isolation from host pages; auditable supply chain |
| Streaming replies, optimistic bubbles, typing indicator | Proven in v1; table stakes |
| Brand color, name, avatar; dark-mode aware; mobile-first | "Match colors, look modern" is a hard requirement |
| Quick-reply chips, optional proactive nudge after N seconds | Engagement lifters, standard in category |
| Replies in the visitor's language | Prompt-level; costs nothing |
| Escalation behavior: surface phone/contact, offer human follow-up | Full live-agent inbox is out of scope; prompt-level covers local-business needs |
| Accessibility: keyboard nav, focus trap, ARIA, reduced motion | Nobody in this category does it well; we will |
| Powered-by badge, toggleable | Free everywhere it exists in competitors |

## 6. Non-goals for v1

- RAG, embeddings, vector databases, runtime site retrieval
- Webhooks / Zapier / CRM integrations
- Live human takeover inbox
- Billing, subscriptions, hosted SaaS
- Attachments, voice, images
- Automated custom-domain provisioning

## 7. Definition of done

v1.0 ships when all of these are true:

- [ ] An agency can go from `docker compose up -d` to a live chatbot on a client site in under an hour, following only the README
- [ ] A client account can edit their facts, read history, and see stats — and can touch nothing else
- [ ] Lead capture triggers an email; analytics show trends, top questions, gaps, and token spend
- [ ] Widget matches brand colors, streams replies, works on mobile, passes keyboard/ARIA checks
- [ ] Removing SiteLift branding requires zero code changes
- [ ] All surfaces pass the style bar (principle 1) — reviewed as a release gate, not an afterthought
- [ ] Security checklist (SECURITY.md) passes: encrypted key, allowlist enforcement, rate limits, audit log
- [ ] Fresh-install E2E test green in CI; backup/restore documented and tested
