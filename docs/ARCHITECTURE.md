# Architecture

This document describes how SiteLift Chatbots works end-to-end. It is a design spec: it should be precise enough to implement from directly.

## 1. Big picture

SiteLift Chatbots is a single server with three jobs:

1. **Serve the embed widget** — a small vanilla-JS file (`embed.js`) that target websites load to get a floating chat bubble.
2. **Proxy chat to an AI provider** — receive visitor messages from the widget, prepend the chatbot's system prompt, call an OpenAI-compatible API, and return the reply.
3. **Run the admin dashboard** — a single HTML page where the admin creates chatbots, edits system prompts, manages the global AI key, and reads conversation history.

There is **one admin** (a trusted single person) and **many chatbots**, each tied to a different website. The admin owns all of them.

### The data boundary

- **Public API** — reachable from anywhere. Serves the widget, the chatbot's *public* metadata, and the chat endpoints. Never exposes API keys or system prompts.
- **Admin API** — reachable only by the admin. Serves the dashboard and full chatbot management. Protected by an optional `ADMIN_TOKEN` (see [Security](SECURITY.md)).

## 2. Components

### 2.1 The embed widget (`embed.js`)

A self-contained, dependency-free JavaScript file. Loaded on a target website with:

```html
<script
  src="https://chat.example.com/embed.js"
  data-chatbot-id="ch_abc123"
  data-position="bottom-right"
></script>
```

Responsibilities:

- On load, fetch the chatbot's **public metadata** (`GET /api/chatbots/:id`) to get display name, welcome message, and brand color.
- Render a floating chat bubble in the bottom-right corner of the page.
- Open a small chat panel when clicked; show the welcome message as the first message.
- Maintain a local conversation: it tracks a `conversationId` and a `visitorId` in `localStorage` so returning visitors continue the same thread.
- Send each visitor message to `POST /api/chat/:chatbotId/messages` and render the AI reply.
- Degrade gracefully if the chatbot is missing or the server is down (show a friendly error inside the panel).

Constraints:

- No framework, no build step, no external dependencies.
- Must not break the host page (scoped CSS with a unique prefix, no global variable pollution beyond a single `window.SiteLift` namespace).

### 2.2 The API server

An Express application. It owns the SQLite database and all business logic. The widget and the admin dashboard are just thin clients.

Routes (full reference in [API.md](API.md)):

| Area | Routes | Auth |
| --- | --- | --- |
| Embed | `GET /embed.js` | none |
| Public chat | `GET /api/chatbots/:id` · `POST /api/chat/:chatbotId/messages` | none |
| Admin | `GET/POST /api/admin/chatbots` · `GET/PUT/DELETE /api/admin/chatbots/:id` · `GET /api/admin/chatbots/:id/conversations` · `GET /api/admin/conversations/:id/messages` · `GET/PUT /api/admin/settings` · `POST /api/admin/chatbots/:chatbotId/scrape` | optional `ADMIN_TOKEN` |

### 2.3 The admin dashboard (`admin.html`)

A single self-contained HTML page served at `/admin`. Uses plain `fetch()` against the admin API. No framework, no build step.

Views:

- **Chatbot list** — table of all chatbots with quick links to conversations.
- **Chatbot form** — create/edit a chatbot. Fields: name, target website URL, welcome message, brand color, **business facts** (5 labeled textareas — hours, contact, FAQ, products, misc — assembled into the system prompt), model, base URL, extra settings (temperature, max tokens). A one-time **website import** button scrapes the target site into a draft business-facts textarea to review and trim.
- **Settings** — set the single global AI provider key (base URL optional). Shows only a hint of the key, never the key itself.
- **Conversation view** — timeline of messages for one visitor thread, read-only.

### 2.4 The AI provider

Any API that implements the **OpenAI-compatible** `POST /v1/chat/completions` contract. Examples: OpenAI, OpenRouter, Azure OpenAI, Groq, Ollama (local), LM Studio.

The server builds this request:

```json
{
  "model": "<chatbot's model, e.g. gpt-4o-mini>",
  "messages": [
    {
      "role": "system",
      "content": "<chatbot's business facts>"
    },
    ...previous messages from this conversation...,
    {
      "role": "user",
      "content": "<visitor's new message>"
    }
  ],
  "temperature": 0.7,
  "max_tokens": 512
}
```

Important design points:

- **The system prompt is exactly the chatbot's "business facts" field.** There is no prompt engineering wrapper around it beyond a short, fixed prefix that instructs the model to be helpful and to say when it does not know. The admin writes plain English business facts.
- **The API key is global — one key for all chatbots.** It is stored encrypted in the `settings` table and resolved as: `settings.openai_api_key` (decrypted) → `OPENAI_API_KEY` env. The base URL resolves as: chatbot `base_url` → `settings.openai_base_url` → `OPENAI_BASE_URL` env → `https://api.openai.com/v1`. If no key is configured anywhere, chat returns `400 AI_KEY_NOT_CONFIGURED`.
- **Conversation context** is the full message history stored in SQLite for that conversation, sent back to the provider each turn (within a capped window — see [DATA_MODEL](DATA_MODEL.md) for the history limit).
- **Streaming is optional.** The simplest v1 is a non-streaming request returning the full reply as JSON. Streaming (SSE) is a later enhancement, not required for the initial build.

## 3. Request lifecycle

### 3.1 Widget boot

```
Target website loads <script src=".../embed.js" data-chatbot-id="ch_abc123">
        │
        ▼
embed.js runs → GET /api/chatbots/ch_abc123
        │                          │
        │                200 { name, welcomeMessage, brandColor }
        │                          │
        ▼                          ▼
Render bubble + panel      Show welcome message in panel
```

- If the chatbot is not found, the server returns `404` and the widget renders nothing (no bubble).
- The widget stores `conversationId` and `visitorId` in `localStorage` per chatbot id.

### 3.2 Visitor sends a message

```
Visitor types "What are your hours?"
        │
        ▼
Widget → POST /api/chat/ch_abc123/messages
        body: { conversationId?: string, visitorId: string, content: string }
        │
        ▼
Server:
  1. Load chatbot ch_abc123 by id. If missing → 404.
  2. Validate content (non-empty, max length ~2000 chars).
  3. Rate-limit check per visitorId (see §7) → 429 if exceeded.
  4. If no conversationId: create a new conversation for this chatbot.
     Otherwise: verify the conversation exists and belongs to this chatbot → else 403.
  5. Insert the user message row.
     If the visitor has volunteered a name/email in this message, capture them on the conversation (see §8).
  6. Load recent message history for the conversation (capped at 20 messages).
  7. Resolve the global AI key (`settings.openai_api_key` decrypted, else `OPENAI_API_KEY` env) and the base URL (chatbot `base_url` → `settings.openai_base_url` → `OPENAI_BASE_URL` env → default `https://api.openai.com/v1`). No key anywhere → 400 `AI_KEY_NOT_CONFIGURED`.
  8. Call the AI provider:
         POST {baseUrl}/chat/completions   (baseUrl already includes the version path, e.g. https://api.openai.com/v1)
         Authorization: Bearer <decrypted key>
        body = system prompt + history + new user message
  9. If provider errors → 502 with a generic message; log details server-side.
  10. Insert the assistant reply row.
  11. Respond 200:
        { conversationId, reply, messageId }
        │
        ▼
Widget appends the reply to the panel
```

### 3.3 Admin edits a chatbot

```
Admin edits business facts (5 labeled textareas) or trims an imported site draft
        │
        ▼
PUT /api/admin/chatbots/ch_abc123
body: { name, websiteUrl, welcomeMessage, brandColor,
        facts?, businessFacts?, model, baseUrl, temperature, maxTokens }
        │
        ▼
Server:
  1. Validate fields.
  2. If structured facts are provided: store them in `facts_json` and assemble
     `business_facts` from the non-empty sections.
     If a raw `businessFacts` string is provided instead: store it directly
     (`facts_json` stays null).
  3. Update the row. Respond 200 with the updated chatbot.
```

No API-key handling happens here — the AI key is global and managed in **Settings** (see §2.3, §2.4).

## 4. Key design decisions and rationale

| Decision | Choice | Why |
| --- | --- | --- |
| Storage | SQLite (single file) | One admin, low traffic, zero ops. Backups = copy a file. |
| Widget language | Vanilla JS, no build | Embedding code must be trivially auditable and have no supply-chain surface. |
| Admin UI | Single HTML page, no framework | Deliberate simplicity; the whole UI is ~one file. |
| AI provider contract | OpenAI-compatible `/v1/chat/completions` | Works with OpenAI, OpenRouter, Groq, Ollama, Azure, LM Studio — one code path. |
| Key handling | Single global AI key in `settings.openai_api_key`, AES-256-GCM encrypted at rest with `ENCRYPTION_KEY`; `OPENAI_API_KEY` env fallback; base URL in `settings.openai_base_url` with env fallback | One key for all chatbots, set once by the admin. See [Security](SECURITY.md). |
| Auth | None by default + optional `ADMIN_TOKEN` | Single trusted admin; token exists to make public hosting safe enough. |
| System prompt | Plain-text business facts | The core product promise: "edit a textarea, restart not needed." |
| Business facts | Structured `facts_json` (`hours`, `contact`, `faq`, `products`, `misc`) assembled into the `business_facts` system prompt; raw `businessFacts` string still accepted | Five labeled textareas are easier to maintain than one free-form block. |
| Website import | One-time scrape-to-draft, admin-only (`POST /api/admin/chatbots/:id/scrape`) | Extracts readable site text (~20k chars) as a draft the admin trims before saving. Never runs at chat time. |
| Streaming | Out of scope for v1 | Adds SSE complexity for marginal UX gain at this size. |
| CORS | Allow all origins for public routes | The widget is loaded on arbitrary target sites and calls back to the API. |
| Context window | Cap at the last 20 messages per turn | Bounds token use; doubles as abuse prevention against long threads. |
| Abuse prevention (v1) | 20-message cap + max message length (2000 chars) + per-visitor rate limit (~20 msgs/min) | Cheap, simple cost protection. See [Abuse prevention](#7-abuse-prevention). |
| Usage/cost visibility | Deferred — **not in v1** | Working and simple first; front end built later. |
| Lead capture | The AI asks for name/email when it naturally comes up, steering toward calling the business | Optional; visitor can decline. See [Lead capture](#8-lead-capture-and-call-conversion). |
| Deployment | **Docker** (Dockerfile + docker-compose) | Portable self-hosting on any VPS/home server/PaaS. |

## 5. Open questions (to dial in)

The core design questions for v1 are now **settled** (see the table in §4 and the new sections below). Remaining items are small and non-blocking for implementation:

1. **Exact rate-limit numbers** — the ~20 messages/min per-visitor figure and the 2000-char message cap are starting points; tune after real traffic. Defaults live in [Abuse prevention](#7-abuse-prevention).
2. **`visitorId` expiry** — whether a visitor's stored id/conversation should rotate after N days of inactivity.
3. **Deployment specifics** — final Docker image base, volume layout, and reverse-proxy example to include in `docs/DEPLOYMENT.md` (to be written during implementation).

## 6. Non-goals (explicitly out of scope for v1)

- Vector databases, embeddings, query-time RAG.
- **Runtime retrieval from the target website** (fetching the site on demand during chat) — out of scope. The only site access is a one-time, admin-only **scrape-to-draft import helper** at setup time: the admin scrapes the site, reviews/trims the extracted text (~20k chars), and saves it into the business facts. It never runs at chat time.
- Multiple admin accounts or roles.
- Webhooks, Slack/email integrations, CRM sync.
- Attachments, voice, or images.
- Hosted SaaS billing or usage limits.
- A mobile app.
- Usage/cost dashboards (deferred — "working and simple" first).

## 7. Abuse prevention

The public chat endpoint is unauthenticated by design (the widget runs on arbitrary third-party sites), so **anyone can send messages** and spend the admin's AI quota. v1 ships a minimal, cheap set of guardrails — enough to stop casual abuse without much code:

1. **Context cap:** only the last 20 messages are sent to the provider per turn (see §4 and DATA_MODEL). A visitor cannot build up an unboundedly expensive thread.
2. **Max message length:** visitor `content` is limited to ~2000 chars. Longer messages are rejected with `400 INVALID_CONTENT`.
3. **Per-visitor rate limit:** a visitor (`visitorId`) may send at most ~20 messages per minute. Excess requests get `429 TOO_MANY_REQUESTS`.

These are enforced in-memory (simple sliding-window keyed by `visitorId`), no extra dependencies. Per-IP limits and daily budgets are **explicitly deferred** — revisit only if abuse becomes a real problem. Tune the numbers after real traffic.

## 8. Lead capture and call conversion

The widget is **anonymous by default** — visitors are never asked for a name or email upfront. Instead, the system prompt guides the AI to naturally collect contact details and steer the visitor toward calling the business:

- The `business_facts` system prompt includes guidance like: *"After you've been helpful for a turn or two, politely ask for the visitor's name and email so we can follow up, and encourage them to call us at [phone] for anything time-sensitive."*
- If the visitor volunteers a name/email, they are stored on the **conversation** (see DATA_MODEL: `visitor_name`, `visitor_email`).
- The visitor can decline; this is fine — the bot moves on.
- The admin sees captured name/email in the conversation view in the dashboard.

This keeps the widget frictionless (no forced form) while still capturing leads and driving calls. The exact phrasing lives in the admin-editable business facts, so the admin controls how assertive the bot is.
