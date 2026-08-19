# Embedding the Widget

This document explains how a website owner installs and configures the SiteLift chat widget. It is a spec for the widget's public interface and the docs the admin sees in the dashboard.

## How the admin installs it

From the admin dashboard, the admin copies an embed snippet for a chatbot and pastes it into the target website, just before the closing `</body>` tag:

```html
<script
  src="https://chat.example.com/embed.js"
  data-chatbot-id="ch_abc123"
  data-position="bottom-right"
></script>
```

That is the entire integration. The widget:

- loads itself asynchronously and does **not** block page rendering,
- injects a styled chat bubble in the bottom-right corner,
- opens a chat panel on click,
- works without any framework or build tool on the host site.

## Available `data-*` attributes

| Attribute | Required | Values | Default | Description |
| --- | --- | --- | --- | --- |
| `src` | yes | widget URL | — | Where `embed.js` is hosted. |
| `data-chatbot-id` | yes | chatbot public id | — | Which chatbot this widget represents. |
| `data-position` | no | `bottom-right` / `bottom-left` | `bottom-right` | Which corner the bubble sits in. |
| `data-visitor-id` | no | string | auto-generated | Optional caller-provided visitor id. If absent, the widget generates one and persists it in `localStorage`. |

The rest of the widget's appearance (welcome message, brand color, model) is pulled from the chatbot's **public metadata** at load time — the admin does not hard-code it in the snippet.

## What the widget looks like

1. A floating circular button with a chat icon, positioned at the chosen corner.
2. On click, a small panel (~380px wide) slides up above the button.
3. The panel shows:
   - a header with the chatbot's `name` and a close button,
   - a message area seeded with the `welcomeMessage`,
   - a text input and send button at the bottom.
4. The bubble is tinted with the chatbot's `brandColor`.

## Public behavior

- **No script tag in the middle of content** — the snippet must be placed so it does not block render. The script uses `defer`-like semantics (or injects an element on DOM ready).
- **Graceful offline state:** if the server is unreachable or the chatbot is disabled, the widget shows a small offline notice rather than erroring or breaking the page.
- **Isolation from the host page:** all injected styles use a unique `sitelift-` prefix and are scoped so they do not leak into the host site's CSS, and the host site's CSS does not leak into the panel.

## Visitor identity and continuity

- On first visit, the widget generates a `visitorId` (a random string) and stores it in `localStorage` under a key scoped to the chatbot id.
- It also stores the current `conversationId`. On return visits, the widget resumes the most recent conversation for that visitor/chatbot, so the visitor sees their prior thread.
- `data-visitor-id` lets an advanced site supply its own id (e.g. the site's logged-in user id) instead of the anonymous one.

## Chat message flow

```
Visitor types → POST /api/chat/{chatbotId}/messages
                body: { conversationId?, visitorId, content }
                response: { conversationId, reply, messageId }

Widget shows an optimistic "typing…" indicator while waiting.
Widget appends the assistant reply to the panel.
```

Full details in [ARCHITECTURE.md](ARCHITECTURE.md) and [API.md](API.md).

## Disabling a chatbot

If the admin disables a chatbot (`enabled = 0`), the widget still loads but shows an "offline" message and does not send messages. This lets the admin take a bot down without editing the website.

## Anti-corruption & security notes

- The widget never sees the chatbot's API key or system prompt — it only receives public metadata and chat replies.
- `data-chatbot-id` is unguessable (random), but it is still public (it appears in the page source). The server must not rely on it for security; see [SECURITY.md](SECURITY.md).
- CORS is configured to allow the widget (running on the target site's origin) to call the API from any origin.