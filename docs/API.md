# API Reference

All endpoints return JSON. This is a design spec; routes will be implemented later.

## Conventions

- **Base URL:** the SiteLift server, e.g. `https://chat.example.com`.
- **Content type:** `application/json` for request bodies and responses.
- **Public routes** require no auth.
- **Admin routes** require auth only if `ADMIN_TOKEN` is set (see [SECURITY.md](SECURITY.md) for the exact header/token semantics).
- **Errors** use a consistent shape:

```json
{
  "error": {
    "code": "CHATBOT_NOT_FOUND",
    "message": "Chatbot not found."
  }
}
```

- **API key redaction:** admin responses never include the decrypted key. They include only `apiKeyHint` (last 4 chars) and `hasApiKey` (boolean).

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

Sends a visitor message and returns the AI reply.

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
| 410 | `CHATBOT_DISABLED` | Chatbot disabled. |
| 502 | `AI_PROVIDER_ERROR` | The AI provider call failed (see [SECURITY](SECURITY.md) for error handling). |

**Behavior:** creates the conversation if needed, stores the user message, calls the provider, stores the reply, returns it. Details in [ARCHITECTURE.md](ARCHITECTURE.md) §3.2.

---

## Admin

Auth note: the endpoints below require `Authorization: Bearer <ADMIN_TOKEN>` **only if** `ADMIN_TOKEN` is configured. When empty, they are unauthenticated (single global admin).

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
      "hasApiKey": true,
      "apiKeyHint": "a3f9",
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
  "businessFacts": "We sell widgets. Hours: Mon–Fri 9–5. Shipping is free over $50.",
  "model": "gpt-4o-mini",
  "baseUrl": "https://api.openai.com/v1",
  "apiKey": "sk-...",        // required
  "temperature": 0.7,
  "maxTokens": 512
}
```

**201** — returns the created chatbot (redacted, like the list item above).

**Errors:** `400 VALIDATION` for missing/incorrect fields.

### `GET /api/admin/chatbots/:chatbotId`

Returns a single chatbot (redacted). **404** if missing.

### `PUT /api/admin/chatbots/:chatbotId`

Updates a chatbot. All fields optional — only provided fields are changed.

**Request body** — same shape as create, but everything optional. `apiKey` behavior:

- If `apiKey` is **omitted or empty**: the existing key is kept unchanged.
- If `apiKey` is **non-empty and different** from the current key: it is re-encrypted and stored; `apiKeyHint` and `updatedAt` update.
- The response **never** echoes the key.

**200** — returns the updated chatbot (redacted). **404** if missing.

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
      "status": "open",
      "messageCount": 4,
      "createdAt": "2026-08-19T12:00:00.000Z",
      "updatedAt": "2026-08-19T12:00:00.000Z"
    }
  ]
}
```

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

---

## Status

### `GET /health`

Simple liveness check. **200** `{ "status": "ok" }`.
