# API Reference

> **Status: legacy v1 reference (Express implementation). Pending revision for the v2 architecture — see [ARCHITECTURE.md](ARCHITECTURE.md).**

All endpoints return JSON. This is a design spec; routes will be implemented later.

## Conventions

- **Base URL:** the SiteLift server, e.g. `https://chat.example.com`.
- **Content type:** `application/json` for request bodies and responses.
- **Public routes** require no auth.
- **Auth routes** (`/api/auth/*`) are rate-limited (5/15min). `POST /setup` only when no users exist.
- **Admin routes** require cookie session (`sitelift_session`, `credentials:include`) + CSRF; legacy `ADMIN_TOKEN` only when no users + `ALLOW_ADMIN_TOKEN_FALLBACK=1`.
- **Errors** use a consistent shape:

```json
{
  "error": {
    "code": "CHATBOT_NOT_FOUND",
    "message": "Chatbot not found."
  }
}
```

- **API key redaction:** there is one global AI-provider API key for the whole server (not per-chatbot). The key is never returned by any endpoint. `GET /api/admin/settings` exposes only `hasApiKey` and `apiKeyHint` (last 4 chars). Admin chatbot objects no longer include key fields.

---

## Embed

### `GET /embed.js`

Serves the widget script (JavaScript, `Content-Type: application/javascript`, cacheable).

**Query/response:** none (script only).

---

## Public (chat)

### `GET /api/chatbots/:chatbotId`

Returns a chatbot's **public metadata** for the widget.

**200**

```json
{
  "id": "ch_abc123",
  "name": "Acme Support",
  "welcomeMessage": "Hi! How can I help you today?",
  "brandColor": "#0f172a",
  "enabled": true
}
```

**Errors:** `404 CHATBOT_NOT_FOUND` · `410 CHATBOT_DISABLED` (enabled = 0).

> Never returns `businessFacts`, `apiKey*`, `baseUrl`, or `model`. The widget only needs name/welcome/color/enabled.

### `POST /api/chat/:chatbotId/messages`

Sends a visitor message and returns the AI reply (non-streaming, fallback).

**Request body**

```json
{
  "conversationId": "cv_xyz789",   // optional; omit/empty to start a new conversation
  "visitorId": "v_88dK2...",       // required
  "content": "What are your hours?"
}
```

**200**

```json
{
  "conversationId": "cv_xyz789",
  "messageId": "msg_bbb",
  "reply": "We're open Monday through Friday, 9am to 5pm."
}
```

**Errors:**

| Status | Code | When |
| --- | --- | --- |
| 400 | `INVALID_CONTENT` | `content` empty or > 2000 chars. |
| 400 | `VISITOR_REQUIRED` | `visitorId` missing. |
| 403 | `CONVERSATION_MISMATCH` | Supplied `conversationId` belongs to a different chatbot. |
| 404 | `CHATBOT_NOT_FOUND` | Chatbot id doesn't exist. |
| 400 | `AI_KEY_NOT_CONFIGURED` | No global API key set (settings or `OPENAI_API_KEY`) and no chatbot `baseUrl`. |
| 410 | `CHATBOT_DISABLED` | Chatbot disabled. |
| 429 | `TOO_MANY_REQUESTS` | Per-visitor rate limit exceeded (~20 msgs/min; see ARCHITECTURE §7). |
| 502 | `AI_PROVIDER_ERROR` | The AI provider call failed (see [SECURITY](SECURITY.md) for error handling). |

**Behavior:** creates the conversation if needed, stores the user message, calls the provider **without** `stream:true`, stores the reply, returns it. The provider is called using the **global** API key from `GET /api/admin/settings` (falling back to `OPENAI_API_KEY`); there is no per-chatbot key. `baseUrl` resolves as chatbot's `baseUrl` → settings `baseUrl` → `OPENAI_BASE_URL` → `https://api.openai.com/v1`. Optimistic DB and cached WAL pragmas keep TTFB low. Details in [ARCHITECTURE.md](ARCHITECTURE.md) §3.2.

### `POST /api/chat/:chatbotId/messages/stream`

Streams the AI reply via Server-Sent Events (SSE). **Preferred** by `embed.js` and the admin Test Widget (optimistic UI).

**Request body** — same as `POST /api/chat/:id/messages`:

```json
{
  "conversationId": "cv_xyz789",
  "visitorId": "v_88dK2...",
  "content": "What are your hours?"
}
```

**200 `text/event-stream`** — sequence of SSE events (each `event:` + `data: JSON` + blank line):

| Event | Data | When |
| --- | --- | --- |
| `meta` | `{"conversationId":"cv_...","messageId":"msg_..."}` | Immediate — TTFB 6-10ms. Client stores `conversationId` and shows streaming bubble. |
| `token` | `{"text":" ..."}` | One per provider `delta.content` chunk. Widget appends to bubble; Test Widget shows `TTFB` + char count. |
| `done` | `{"conversationId":"cv_...","messageId":"msg_...","reply":"full text"}` | After provider `[DONE]`; server has Persisted assistant row in single `WAL` transaction. |
| `error` | `{"code":"AI_PROVIDER_ERROR","message":"..."}` | Provider failure after headers; client shows error bubble. |

**Headers:** `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no`; CORS `*` (like other public routes). Client should `Accept: text/event-stream`.

**Fallback:** if the client lacks `ReadableStream` or gets `404` (old server), retry `POST /api/chat/:id/messages`.

**Errors before streaming:** if validation/rate-limit/auth fails before SSE headers, returns normal JSON error (e.g., `429 TOO_MANY_REQUESTS`) with same codes as above — client should handle non-`text/event-stream` response as error.

**Behavior:** same as non-stream for steps 1-7, but step 8 flushes `meta` immediately, step 9 calls provider with `stream:true` and proxies tokens live, step 11 persists the full reply. `GET /embed.js` and the Test Widget both prefer this endpoint.

---

## Auth

### `GET /api/auth/status`

Returns `{ hasUsers: bool, user: {id,email,name,role} | null }`.

### `POST /api/auth/setup`

Creates the first owner. Only when `admin_users` is empty. Body `{ email, password (≥8), name? }` → 201 + sets cookie. 403 if already set up.

### `POST /api/auth/login`

Body `{ email, password }` → sets `sitelift_session` cookie. 401 on bad creds, 429 on rate limit.

### `POST /api/auth/logout`

Clears cookie. Always 200.

### `GET /api/auth/me`

Returns current user. 401 if not authed.

### `POST /api/auth/webauthn/register/options` · `POST /api/auth/webauthn/register/verify`

Authenticated. Create a passkey for the current user. Uses `simplewebauthn`.

### `POST /api/auth/webauthn/login/options` · `POST /api/auth/webauthn/login/verify`

Unauthenticated (rate-limited). Body `{ email? }` for options, then WebAuthn assertion to verify → sets cookie.

### `GET /api/auth/webauthn/credentials` · `DELETE /api/auth/webauthn/credentials/:id`

Authenticated. Manage own passkeys.

---

## Admin

Auth: cookie session (`sitelift_session`) required (see above). All below return 401 if unauthenticated.

### `GET /api/admin/chatbots`

Lists all chatbots.

**200**

```json
{
  "chatbots": [
    {
      "id": "ch_abc123",
      "name": "Acme Support",
      "websiteUrl": "https://acme.com",
      "welcomeMessage": "Hi! How can I help you today?",
      "brandColor": "#0f172a",
      "model": "gpt-4o-mini",
      "baseUrl": "https://api.openai.com/v1",
      "temperature": 0.7,
      "maxTokens": 512,
      "enabled": true,
      "createdAt": "2026-08-19T12:00:00.000Z",
      "updatedAt": "2026-08-19T12:00:00.000Z"
    }
  ]
}
```

### `POST /api/admin/chatbots`

Creates a chatbot.

**Request body**

```json
{
  "name": "Acme Support",
  "websiteUrl": "https://acme.com",
  "welcomeMessage": "Hi! How can I help you today?",
  "brandColor": "#0f172a",
  "facts": {
    "hours": "Mon–Fri 9–5",
    "contact": "support@acme.com",
    "faq": "Shipping is free over $50.",
    "products": "We sell widgets.",
    "misc": ""
  },
  "model": "gpt-4o-mini",
  "baseUrl": "https://api.openai.com/v1",
  "temperature": 0.7,
  "maxTokens": 512
}
```

`facts` is optional — its five string fields (`hours`, `contact`, `faq`, `products`, `misc`) are normalized and the server assembles `businessFacts` from them. A raw `businessFacts` string is also accepted instead (in which case the structured `facts` are cleared). There is **no `apiKey`**: all chatbots use the global key from `/api/admin/settings` (or the `OPENAI_API_KEY` env fallback).

**201** — returns the created chatbot (admin shape, including `facts` and `businessFacts`).

**Errors:** `400 VALIDATION` for missing/incorrect fields.

### `GET /api/admin/chatbots/:chatbotId`

Returns a single chatbot with its full admin shape, including `facts` and the assembled `businessFacts` (both omitted from the list endpoint).

```json
{
  "id": "ch_abc123",
  "name": "Acme Support",
  "websiteUrl": "https://acme.com",
  "welcomeMessage": "Hi! How can I help you today?",
  "brandColor": "#0f172a",
  "businessFacts": "Business hours:\nMon–Fri 9–5\n\nContact:\nsupport@acme.com",
  "facts": {
    "hours": "Mon–Fri 9–5",
    "contact": "support@acme.com",
    "faq": "",
    "products": "We sell widgets.",
    "misc": ""
  },
  "model": "gpt-4o-mini",
  "baseUrl": "https://api.openai.com/v1",
  "temperature": 0.7,
  "maxTokens": 512,
  "enabled": true,
  "createdAt": "2026-08-19T12:00:00.000Z",
  "updatedAt": "2026-08-19T12:00:00.000Z"
}
```

**404** if missing.

### `PUT /api/admin/chatbots/:chatbotId`

Updates a chatbot. All fields optional — only provided fields are changed.

**Request body** — same shape as create, but everything optional. There is no `apiKey`. `facts`/`businessFacts` handling:

- If `facts` is provided, it is normalized into the five fields, stored as the structured facts, and `businessFacts` is reassembled from it.
- If raw `businessFacts` is provided instead, it is stored as-is and the structured `facts` are cleared.
- If neither is provided, the existing facts are kept unchanged.

**200** — returns the updated chatbot (admin shape, with `facts` + `businessFacts`). **404** if missing.

### `DELETE /api/admin/chatbots/:chatbotId`

Deletes a chatbot **and its conversations and messages** (cascade).

**200** `{ "deleted": true }`. **404** if missing.

### `GET /api/admin/chatbots/:chatbotId/conversations`

Lists conversations for a chatbot, most recent first, with a message count.

**200**

```json
{
  "conversations": [
    {
      "id": "cv_xyz789",
      "visitorId": "v_88dK2...",
      "visitorName": "Alex",        // null if not volunteered
      "visitorEmail": "alex@x.com", // null if not volunteered
      "status": "open",
      "messageCount": 4,
      "createdAt": "2026-08-19T12:00:00.000Z",
      "updatedAt": "2026-08-19T12:00:00.000Z"
    }
  ]
}
```

**Behavior:** if the visitor volunteered a name/email during the chat, they are returned here (see ARCHITECTURE §8).

### `GET /api/admin/conversations/:conversationId/messages`

Returns the full message timeline for a conversation, oldest first.

**200**

```json
{
  "conversation": {
    "id": "cv_xyz789",
    "chatbotId": "ch_abc123",
    "status": "open"
  },
  "messages": [
    { "id": "msg_aaa", "role": "user", "content": "What are your hours?", "createdAt": "..." },
    { "id": "msg_bbb", "role": "assistant", "content": "We're open Mon–Fri 9–5.", "createdAt": "..." }
  ]
}
```

**404** if the conversation is missing.

### `GET /api/admin/settings`

Returns the global AI-provider settings. The API key itself is **never** returned.

**200**

```json
{
  "hasApiKey": true,
  "apiKeyHint": "a3f9",
  "baseUrl": "https://api.openai.com/v1"
}
```

`apiKeyHint` and `baseUrl` are `null` when unset.

### `PUT /api/admin/settings`

Updates the global AI-provider settings. All fields optional.

**Request body**

```json
{
  "apiKey": "sk-...",   // optional; omitted keeps current, empty string clears
  "baseUrl": "https://api.openai.com/v1"   // optional; empty string clears
}
```

The `apiKey` is encrypted (AES-256-GCM with the server's `ENCRYPTION_KEY`) and stored in the `settings` table under `openai_api_key`, keeping only a 4-char hint; `baseUrl` is stored in plaintext. Returns the same shape as `GET /api/admin/settings`.

### `POST /api/admin/chatbots/:chatbotId/scrape`

Fetches the chatbot's website and returns a readable plain-text draft of the page, capped at ~20,000 chars — handy for pasting into `facts`.

**Request body**

```json
{
  "url": "https://acme.com"   // optional; defaults to chatbot.websiteUrl
}
```

**200**

```json
{
  "text": "Acme Support\nWe sell widgets...\n\n..."
}
```

**Errors:** `404 CHATBOT_NOT_FOUND` if the chatbot doesn't exist; `400 SCRAPE_FAILED` if the URL is unreachable or yields no readable text.

---

## Status

### `GET /health`

Simple liveness check. **200** `{ "status": "ok" }`.
