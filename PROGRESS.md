# PROGRESS — Working Session Handoff

> **Living document.** Update this at every stable point so any session/device can pick up cold.
> Read [`AGENTS.md`](AGENTS.md) (working rules) and [`docs/PRODUCT.md`](docs/PRODUCT.md) (scope contract) first.
>
> **Last updated:** after the multi-page import crawl (same-origin pages combined) and the import now using the chatbot's model.

---

## Snapshot

| | |
| --- | --- |
| **Product** | Open-source, self-hosted AI chatbot platform for web agencies. One Docker container, unlimited client chatbots, agency-branded, BYO OpenAI-compatible key. |
| **Stack** | TypeScript strict · pnpm monorepo · Hono + Drizzle + SQLite (server) · React 19 + Vite + Tailwind v4 + TanStack Router/Query (dashboard) · dependency-free Shadow-DOM widget · better-auth · Biome/Vitest/GitHub Actions |
| **Tests** | 60 passing (38 server · 22 dashboard) — gate: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` before every commit |
| **Runs on** | Server `:3000` (`pnpm dev`) · Dashboard `:5173` (`pnpm dev:dashboard`, proxies API) |

## What works today (expand per area)

<details>
<summary><strong>Milestone 0 — foundation (DONE)</strong></summary>

- Legacy Express app removed; greenfield TS monorepo per ARCHITECTURE.md §3
- Hono server: `/health`, `/api/chatbots/:id` public meta, SSE streaming chat
  (`POST /api/chat/:id/messages/stream` → `meta/token/done/error`), non-stream fallback,
  rate limits (~20/min per visitor), domain allowlist (Origin/Referer), SSRF-filtered scrape stub
- Drizzle + better-sqlite3, WAL pragmas, migrations auto-run on boot (`drizzle/` folder)
- Widget: TS source → single 13.7 kB `embed.js`, Shadow DOM, spring-open panel, streaming text
  with caret, typing dots, quick replies, brand-color theming via `--sl-*`, localStorage thread ids,
  accessible (keyboard/focus/ARIA/reduced-motion)
- Dashboard shell on the design-token system; dark mode parity
- Multi-stage Dockerfile + compose; CI workflow (lint/typecheck/test/build)
</details>

<details>
<summary><strong>Milestone 1 — auth, roles, CRUD (DONE)</strong></summary>

- better-auth (email+password, drizzle adapter, cookie prefix `sitelift.session_token`),
  mounted at `/api/auth/*`; **first sign-up becomes `agency`, later ones are `clients`**
- `GET /api/auth/me`; `requireRole()` middleware guards `/api/admin/*`
- Chatbot CRUD (`/api/admin/chatbots[/:id]`) with shared Zod validation
- `client_assignments` table + `/api/admin/clients` endpoints (agency-only)
- ADMIN_TOKEN fully removed (was legacy v1); admin API open-by-default until UI logins landed — now session-guarded
- Login/signup page; app shell gated on session; role badge + sign-out in topbar
</details>

<details>
<summary><strong>Routing & UX (DONE)</strong></summary>

- **TanStack Router**, code-based tree: `/login` · `/` · `/chatbots(?new=1)` ·
  `/chatbots/$botId` · `/settings`; auth-guarded layout;
  prod basepath `/admin` (Hono SPA-fallbacks `/admin/*`)
- Refresh / back / forward / deep links work everywhere
- Overview: live counts from API, working buttons, recent-bots list
- Chatbots list: create/pause/delete (two-step confirm), rows deep-link to editor
- ChatbotEditor: full field editing incl. structured facts + FAQ pairs + prompt preview,
  danger-zone delete, jump-to-playground
- Test tab: interactive widget preview answering from draft facts; Playground page removed
- Settings: provider presets (OpenAI/OpenRouter/Groq/DeepSeek/Ollama/custom),
  AES-256-GCM encrypted key storage w/ hint, model catalog browsing
  (`GET /api/admin/models?baseUrl=` — cached 10 min, forwards stored key, SSRF allowlist)
- Design system: `lib/ui.ts` field tokens (filled inputs, muted labels), custom ColorField picker,
  native-style scrollbars, STYLE.md release-gate checklist
- **Auth page (polish):** split-screen brand panel (Linear/Vercel-style) + form column; segmented
  Sign in / Create account toggle; field-level validation (email format, 10-char min, password
  confirmation) with inline errors; show/hide password + monochrome strength meter; redirect to `/`
  after successful auth (was: stuck on `/login`); session check on mount redirects authed users;
  `GET /api/auth/bootstrap` → `{ hasUsers }` and **fresh installs land on sign-up** (sign-in hidden
  until an account exists); `skeleton` shimmer utility + `inputInvalidClass` added to design system
- **Rebrand:** robot-in-box logo replaced by the SiteLift wordmark (`Logo.tsx`, `currentColor`,
  theme-adaptive) in sidebar + login; old robot icon saved at `assets/bot-icon.svg` for later reuse
</details>

<details>
<summary><strong>Tabbed chatbot editor + website import (DONE)</strong></summary>

- **ChatbotEditor rebuilt as four tabs** — **Leads** (default), **Knowledge**, **Test**, **Settings**.
  Cleaner split: set-once fields (name, domains, color, model, status, embed snippet, delete)
  live behind Settings; Knowledge owns welcome/quick replies + the facts; Leads proves value on load.
- **Test tab**: an interactive widget preview styled like the real embed — bubble button in the
  bot's brand color, panel with avatar/name/online dot, welcome message, quick-reply chips and a
  composer that answers from the *draft* facts via `POST /api/admin/chatbots/:id/test` (nothing
  persisted). The separate Playground page/route/sidebar item and the `/demo` page are gone.
- **Leads tab**: `GET /api/admin/chatbots/:id/leads` — recent conversations with captured
  name/email, last message, message count. Empty state teaches what a lead is.
- **Knowledge tab**: fact sections labeled by topic with the visitor question folded into the hint
  ("Who are you? — What you do, since when, what makes you different."), one-click example
  templates; numbered FAQ pairs ("01/02/…") with a running `n/50` count; coverage checklist
  ("3 of 7 covered"); a plain **Misc** textarea at the bottom that goes straight into the facts JSON.
- **Website import**: `POST /api/admin/import` — SSRF-safe crawl (DNS + private-range blocking,
  redirect caps, text extraction) → LLM reads the site and fills the `businessFactsSchema` JSON
  (incl. up to 20 FAQ pairs, `maxTokens` 8000). Dashboard shows what was read and applies it as an
  editable draft.
- **Facts schema reworked**: `products`→`services`, `misc`→`policies`, new `location`, `pricing`,
  and a big `misc` freeform field (12k cap, bottom of the form); `composeSystemPrompt` sections
  updated to match (ABOUT US / HOURS / LOCATION & SERVICE AREA / CONTACT / SERVICES / PRICING /
  POLICIES & NOTES / MISC). **Raw-prompt mode removed** — facts-only editing, no "edit as plain
  prompt".
- All-LLM extraction (no deterministic parsers): provider `completeJson()` (non-streaming,
  `response_format: json_object`), one retry with error feedback.
- `temperature`/`maxTokens`/per-bot `baseUrl` remain schema-only — deliberately no UI (global-only).
</details>

<details>
<summary><strong>Leads graphs + editor taste pass (DONE)</strong></summary>

- **Activity stats on the Leads tab** (above the inbox): new `GET /api/admin/chatbots/:id/stats?days=30`
  buckets conversations/leads/messages per local day (7–90 window, clamped); shared
  `chatbotStatsSchema`. Dashboard renders an `ActivityCard` (dependency-free CSS bars —
  conversations in muted gray, leads in ink; hover tooltips; sparse x labels) plus four stat tiles
  (conversations · leads · lead rate · msgs/conversation). Skeleton loading, teaching empty state,
  and silent-hide if stats fetch fails (inbox never breaks because of it).
- **Editor taste/copy pass**: unified `StatusBadge` component (dot + tint) across list + editor;
  dirty tracking with a floating Unsaved-changes pill (Save / Discard) replacing the always-on
  header button; "Saved" toast bottom-right instead of layout-shifting banner;
  beforeunload + confirm-on-back guards; skeleton page/list/inbox loading (spinners only inline);
  leads rows use human initials avatars + `tnum`; "latest 25" cap note; empty-state icons in muted
  circles; content width 1200px on Overview/Chatbots/editor.
- **Knowledge tab**: "Show example" hides once a field has content (no more silent overwrite);
  coverage checklist items jump-and-focus their field; FAQ add explains the 50-cap; quick-reply
  placeholder reads naturally ("Opening hours, Pricing, Book a visit"); Misc hint no longer leaks
  "prompt JSON"; ImportReview button says "Use these facts".
- **Knowledge redesign (Notion-doc)**: dropped the per-field boxes and the quoted primary-color
  questions. Sections are now plain hairline-separated groups — topic label as the heading, the
  visitor question folded into a one-line hint, textareas directly beneath. Numbered FAQ pairs
  ("01 / 02 / …") with a live `n/50` counter. The collapsible "Preview final prompt" is gone —
  the assembled prompt now lives in the right sticky pane as a first-class card (with a Copy
  button) next to the coverage checklist ("Visitors will ask"), which was restored after an
  experiment folding it into the facts header as jump-to pills proved less discoverable.
- **Fresh-bot default tab**: bots without facts open on Knowledge (not an empty inbox).
- **Test tab stage**: fake browser chrome dropped for a believable mini client-site mock on a dotted
  canvas ("Your client's website" caption); widget-sim palette extracted to a named `WIDGET` const
  (light-locked by design — the widget renders on host pages, not in our token system).
- **Robustness**: `lib/uid.ts` falls back when `crypto.randomUUID` is missing (plain-HTTP LAN
  deployments have no secure context); model-picker empty state no longer references a removed
  custom-id field.
</details>

## Known gaps / tech debt (honest)

<details>
<summary><strong>Open items we deliberately deferred</strong></summary>

- `temperature` / `maxTokens` / per-bot `base_url` still exist in the DB & API but have **no UI**
  (global-only by design for now). Decide later: settings-level sampling config or leave defaults.
- OpenAI org-header support (`OpenAI-Organization`) not implemented — add optional field if needed.
- Knowledge-gap detection, token-spend analytics: schema has usage columns, no aggregation yet.
- No E2E browser tests yet (Playwright recommended next to lock the login→create→chat loop).
- CI workflow exists but repo has no pushed branch/Actions run verified yet.
</details>

## Roadmap — what to build next (in order)

1. **Client accounts UI** — invite owners, assign chatbots. Endpoints already exist:
   `GET /api/admin/clients`, `PUT /api/admin/clients/:userId/chatbots`.
   Needs: Clients page (list/invite/assign), client-role login landing that shows only assigned
   bots (server-side scoping for client role on chatbots/conversations is NOT implemented yet —
   add `requireRole('agency')` alternatives + ownership filters).
2. **Lead-capture emails** — SMTP settings surface, `nodemailer`, trigger when visitor name/email
   captured (detect in chat route), digest option later. The editor's Leads tab already lists
   captured leads; the email notification is the missing push.
3. **Conversations browser + analytics** — per-bot thread view, leads inbox, trends/top-questions/
   knowledge-gaps cards; token spend from stored usage columns.
4. **White-label polish** — agency branding tokens, powered-by default toggle wiring.
5. **E2E tests** — Playwright: install→wizard→create→chat happy path; then CI publish workflow.

## Environment & commands

```bash
corepack enable && pnpm install        # node >= 22
pnpm approve-builds                    # allow better-sqlite3 + esbuild native scripts (first time)
pnpm dev            # API server :3000  (serves /demo?chatbot=ch_demo, /admin/, /embed.js)
pnpm dev:dashboard  # Vite :5173     (proxies /api, /demo, /embed.js)
pnpm test && pnpm lint && pnpm typecheck && pnpm build
docker compose -f docker/docker-compose.yml up -d --build
```

`.env` keys: `ENCRYPTION_KEY` (required to save API keys), `OPENAI_API_KEY` + `OPENAI_BASE_URL`
(or set inside Settings UI), `AI_MODEL`. Demo bot `ch_demo` is seeded on boot.

## Gotchas learned (do not rediscover the hard way)

<details>
<summary><strong>Click to expand — each one cost real debugging time</strong></summary>

- **Keep local stuff local — never commit what shouldn't be in the repo.** Real-world lesson:
  `apps/server/data/*.db` was committed to GitHub (the `.gitignore` `data/*.db` pattern only matched a
  root-level `data/` dir, not `apps/server/data/`). Cloning the repo shipped a pre-existing SQLite DB
  with someone else's account to a fresh machine. Fix: gitignore the dir, `git rm --cached` any tracked
  data, verify with `git check-ignore <path>`, and check `git status` before every commit.
- **better-sqlite3 native build**: pnpm blocks postinstall by default — needs
  `pnpm.onlyBuiltDependencies` in root package.json + `pnpm rebuild better-sqlite3` if missed.
- **dotenv**: resolves `.env` from cwd — server runs from `apps/server`, so env.ts walks UP
  directories to find the root `.env`.
- **ESM import hoisting**: never set `process.env` below imports in test setup files —
  use `vitest.config.ts → test.env` instead (bit us twice).
- **`new URL().pathname`** percent-encodes spaces — always `fileURLToPath(...)` it.
- **Biome**: needs `css.parser.tailwindDirectives: true` for Tailwind v4 `@apply`;
  `it.only`/`describe` interplay — prefer exact `-t "full name"` filters when debugging.
- **TanStack Router tests**: render through the REAL tree with memory history
  (`tests/router.tsx → renderAtLocation`); jsdom lacks `matchMedia` (polyfilled in setup);
  navigate dynamic routes with `{ to: '/chatbots/$botId', params }` form;
  fetch stubs match by **exact string path + method** (`stubApi` in tests/router.tsx).
- **better-auth v1.7**: account table requires an `issuer` column; pass ALL core tables
  (user/session/account/verification) to the drizzle adapter explicitly.
- **OpenAI-compatible providers**: some need auth even for `GET /models` — catalog proxy
  forwards the stored key; OpenRouter's is public.
- **Production paths**: dashboard mounts at `/admin` (router basepath must match); widget served
  at `/embed.js` with 600 s cache — hard-refresh during development.
</details>

## Commit trail (this rebuild)

```
<uncommitted> feat: import section hides once facts exist; "Clear all facts" danger zone returns it
<uncommitted> feat: import extraction — terse direct facts, no missing-info commentary, booking URLs kept verbatim
<uncommitted> feat: import crawls same-origin pages (up to 5, 60k chars) and uses the chatbot's model
<uncommitted> design: restore "Visitors will ask" checklist beside the Final prompt preview
<uncommitted> design: knowledge tab — coverage checklist becomes jump-to pills in the facts header; preview owns the right pane w/ copy button
<uncommitted> feat: system prompt now embeds facts as JSON — composeSystemPrompt + preview show the exact JSON block
<uncommitted> feat: import pushes 15–20 FAQ pairs (was effectively ~5); dropped the wand icon from the Import button
<uncommitted> feat: import accepts scheme-less URLs — normalized to https at the schema edge, SSRF checks unchanged
<uncommitted> design: knowledge editor as Notion-doc — hairline sections, numbered FAQs, side-pane prompt preview
<uncommitted> feat: import up to 20 FAQ pairs (maxTokens 8000)
<uncommitted> feat: leads activity graphs (stats endpoint, tiles, 30-day bars)
<uncommitted> design: editor taste pass — dirty bar, skeletons, badges, copy
<uncommitted> feat: tabbed chatbot editor (Leads/Knowledge/Test/Settings) + all-LLM website import
<uncommitted> refactor: remove Playground + raw-prompt mode, add Test tab + Misc field
01010ce docs: document URL routing architecture and routes table
833509a feat: real URL routing — TanStack Router across the dashboard
f82136b feat: live model catalog browsing per provider
bdeeb18 feat: provider presets + structured business-facts editor with prompt preview
39102a4 feat: functional overview, full chatbot editor, playground bot selector
da6cc89 feat: dashboard login + session gating
2643539 feat: M1 auth — better-auth with agency/client roles + chatbot CRUD
3400c94 docs: remove all legacy v1 material
2a2f867 design: remove accent colors — full monochrome system
c8c2c0c feat: admin settings surface + playground
333cc7a feat: v2 rebuild — TypeScript monorepo (Milestone 0)
```
