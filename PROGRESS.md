# PROGRESS — Working Session Handoff

> **Living document.** Update this at every stable point so any session/device can pick up cold.
> Read [`AGENTS.md`](AGENTS.md) (working rules) and [`docs/PRODUCT.md`](docs/PRODUCT.md) (scope contract) first.
>
> **Last updated:** client-portal polish rounds 1–4 committed and pushed. Round 4: empty-domain
> guardrails (DomainsList warning callout + active-bot status warning; note empty allowlist means
> "answers from any website" server-side) and relative lead timestamps. Rounds 1–3 covered preview
> banner fix, role-aware copy, live stats, a11y rows, session dedupe, discard dialog, invite flow.
> Next up: keep refining, then lead-capture emails.

---

## Snapshot

| | |
| --- | --- |
| **Product** | Open-source, self-hosted AI chatbot platform for web agencies. One Docker container, unlimited client chatbots, agency-branded, BYO OpenAI-compatible key. |
| **Stack** | TypeScript strict · pnpm monorepo · Hono + Drizzle + SQLite (server) · React 19 + Vite + Tailwind v4 + TanStack Router/Query (dashboard) · dependency-free Shadow-DOM widget · better-auth · Biome/Vitest/GitHub Actions |
| **Tests** | 134 passing (76 server · 58 dashboard) — gate: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` before every commit |
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
<summary><strong>Guided create wizard — creation rewritten to mirror settings (DONE)</strong></summary>

- **Old create form removed.** It was a flat dump with a raw "Business facts · the system prompt"
  textarea (a leftover of removed raw-prompt mode) and comma-separated domains — it contradicted the
  tabbed editor. It lived inline on the list page via `?new=1`.
- **New `/chatbots/new` wizard** (static route; deep-linkable, "URL param is the state" kept):
  1. **Basics** — name (required), website URL
  2. **Knowledge** — import-from-website front and center (when no facts), then structured facts,
     FAQ pairs, misc, coverage checklist + final-prompt panes
  3. **Look & greet** — welcome, quick replies, brand color, logo + widget toggles with a **live
     widget preview** (same `WidgetSim` as the editor's Test tab, static mode)
  4. **Launch** — allowed-domains line list, model picker, status → **Create**, then lands in the
     editor (defaults to Leads like clicking the row during normal use)
- **Shared chatbot components extracted** so create and settings can never drift
  (`apps/dashboard/src/components/chatbot/`): `state.ts` (FormState + helpers), `GreetingFields`,
  `KnowledgeEditor` (facts/FAQ/misc/import/coverage/prompt), `WidgetFields` (logo + toggles),
  `DomainsList`, `ModelPicker` (now self-contained — owns its own fetch/state), `WidgetSim`
  (presentational widget preview shared by Test tab + wizard).
- `ChatbotEditor` tabs now consume the same components; Settings keeps basics/embed/danger inline.
- **Knowledge step polish:** `keepImportVisible` prop — the wizard keeps the import card put even
  after facts exist (no more jarring vanish when you click "Show example"); "Show example" is now
  reversible via a "Clear example" link on the field (shown while the field still holds the sample
  text), so sample facts never feel permanent.
- Tests: wizard suite (`tests/NewChatbot.test.tsx` — name-gate, import-first, import stays put +
  example-clear, create → editor leads, status in payload); `Chatbots.test.tsx` updated for the new
  route. 28 dashboard tests green.
</details>

<details>
<summary><strong>Create wizard — two-panel Linear-style redesign (DONE)</strong></summary>

- **Layout:** the four-step flow is now a split view — a centered, typographic form column on the
  left and an **always-visible live `WidgetSim` preview rail** (sticky on `lg+`) on the right that
  updates as you type (name in the header, welcome message, quick replies, brand color, logo).
  Old left-hugging "card-in-a-card" shell replaced by open typography (no nested boxes / dividers
  around a two-field step).
- **Step chrome:** the icon-plus-slash stepper is gone — replaced by a whisper "Step N of 4" plus
  four thin progress segments (current = short ink accent, completed clickable to jump back).
  Each step gets its own display heading + one-line subtitle (`STEP_META`).
- **Micro-delights:** name field autofocuses; Enter advances on the Basics step; pasting a website
  URL **auto-derives the name** from the domain; a **"Skip — finish later"** text escape appears
  once a name exists (creates with what's there) — optimized for agencies creating their Nth bot.
- **Knowledge step:** `KnowledgeEditor` gained an `aside` prop (default `true`, so the tabbed
  editor is unchanged). The wizard passes `aside={false}` so facts render in the left column while
  the widget preview holds the rail; a lightweight "Review what it knows" collapsible (coverage bar
  + assembled-prompt) replaces the editor's sticky coverage/prompt pane.
  (`apps/dashboard/src/components/chatbot/KnowledgeEditor.tsx`)
- "Cancel"/"Back" (left) and "Continue"/"Create chatbot" (right) footer nav, with a one-line
  "You can change everything later in the editor" reassurance. Old wizard saved at
  `apps/dashboard/NewChatbot.wizard-old.bak` for rollback; git HEAD also contains it.
- Tests: `tests/NewChatbot.test.tsx` unchanged and green (name-gate, import-first, example-clear,
  create → editor leads, status in payload) — 28 dashboard tests pass.
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

<details>
<summary><strong>Zero-config encryption — auto-generated app secret (DONE)</strong></summary>

- **`ENCRYPTION_KEY` is now optional.** New `lib/secrets.ts` resolves the app secret at boot:
  `ENCRYPTION_KEY` env → `data/encryption.key` in the volume → auto-generates a random 32-byte key
  and persists it (chmod 600). No env setup needed; power users can still pin their own key.
- better-auth's session secret now uses the same resolved secret (kept `BETTER_AUTH_SECRET`
  override; dropped the hardcoded `dev-secret-do-not-use-in-prod` fallback) — sessions stay valid
  across restarts.
- Settings API/UI: `encryptionAvailable` is always true; Settings page shows where the key lives
  instead of the old "set ENCRYPTION_KEY" warning. Old stored keys silently fall back to env if a
  previously-set env key stops matching (graceful, no crash).
- `docker-compose.yml` passes `ENCRYPTION_KEY` through (optional override).
- Gotcha: key sits next to the DB in the volume — protects backup copies, not someone who steals
  the whole volume (accepted tradeoff for this tier). Tests: `tests/secrets.test.ts` covers
  env/file/generated resolution + 600 perms.
</details>

<details>
<summary><strong>No default model — explicit per-bot or global (DONE)</strong></summary>

- **Removed the hardcoded `gpt-4o-mini` default everywhere** (schema default, create-route
  fallback, `env.defaultModel`/`AI_MODEL`). `chatbots.model` is now nullable; the migration
  (`0008`) nulls existing rows that only ever had the old implicit default.
- **Model resolution** (`services/settings.ts → resolveModel`): per-bot override → Settings
  **Default model** (new `ai_default_model` setting, editable in the Settings page via the model
  picker) → else a clear `MODEL_NOT_CONFIGURED` error. Applies to chat (streaming + non-stream),
  the editor Test tab, and website import.
- Chat/import/test refuse to guess — no model configured anywhere returns an explicit
  `MODEL_NOT_CONFIGURED` code/message instead of silently calling the provider.
- Dashboard: Settings gains a **Default model** field; the bot ModelPicker shows
  "Use global default" when unset and offers a "Use global default instead" reset; chatbot list
  shows `Default` for bots without an override; create/editor copy updated.
- Tests: settings.test.ts covers save/clear of the default and the `MODEL_NOT_CONFIGURED` path;
  chat/importer tests set a global default via `setDefaultModel()`.
</details>

<details>
<summary><strong>Import speed — crawl parallelized (DONE)</strong></summary>

- **Parallel crawl:** sub-pages are fetched concurrently (`Promise.allSettled`) instead of sequentially — worst case drops from ~50s (5 × 10s timeout) to ~10s. Same 5-page cap, same-origin + junk-path filters, text budget applied after.
- **Smaller extraction prompt:** combined site text capped at 30k chars (was 60k), per-page 24k (was 40k) — faster prefill, fewer tokens billed.
- **Timing logs:** `import: crawl complete` and `import: extraction complete` (pino) show ms per phase, so slow imports are diagnosable.
- Tests: importer suite green (50 server tests pass).
</details>

<details>
<summary><strong>Import speed — reasoning disabled + empty-result guard (DONE)</strong></summary>

- **Root cause of slow imports:** `deepseek-v4-flash` is a reasoning model. Without `reasoning: { effort: "none" }` every call emitted a long thinking trace that exploded on big inputs (300s timeouts). Disabling reasoning took a full-site extraction from timeout → ~18-50s depending on OpenRouter provider routing.
- **Prompt is the goldilocks zone:** short extract prompt (terse rules, no 15-20-FAQ demand) produced rich, fast output (30 FAQs, all fields filled). The old verbose prompt + reasoning ON was the worst of both worlds.
- **No max-tokens cap on extraction** — the model decides output length (the earlier 4096 cap truncated JSON and caused the retry loop).
- **Empty-result guard:** empty/`{}`/unparseable extractions now throw `EXTRACTION_FAILED` instead of returning a blank draft that would wipe dashboard fields.
- **Parallel crawl + phase timing logs** retained from earlier: sub-pages fetched concurrently, `import: crawl complete` / `import: extraction complete` pino logs with ms.
- **Provider pin (OpenRouter only):** optional Settings field — `provider: { only: [slug], allow_fallbacks: false }` routes every request to one specific OpenRouter upstream for consistent speed. Hidden unless OpenRouter base URL is selected. Verified working: `only` (not `order`) is the reliable field with `~`-prefixed model slugs; `sort: 'latency'` also works (~1.5s vs 11s on this model). Tests: 52 server tests pass.
</details>

<details>
<summary><strong>Client-role ownership scoping (DONE — Phase 1 of portal work)</strong></summary>

- `/api/admin/*` now accepts client sessions via `requireRole('agency','client')`; agency-only
  surfaces (clients mgmt, settings, models, import, chatbot create/delete) stay 403-guarded.
- **Ownership chain enforced in the query layer** (`hasBotAccess` / `assignedChatbotIds`):
  clients see only assigned bots in `GET /chatbots`; `GET/PUT /chatbots/:id`, leads, stats and
  the draft-facts test endpoint return **404 for unassigned bots** (no existence leak).
- **Client PUT field allowlist:** welcomeMessage, quickReplies, brandColor, avatarUrl,
  showLogo/showName/showOnlineStatus/poweredBy, facts. Agency-only fields (name, status,
  model, domains, baseUrl, systemPrompt raw) are silently dropped from client payloads.
- Fixed latent bug: partial PUTs without `facts` used to wipe `systemPrompt` to '' — the prompt
  is now only recomputed when `facts` is present in the payload (null clears it).
- Tests: `tests/scoping.test.ts` (13 tests) covers list/read/edit scoping, forbidden-field drops,
  cross-tenant 404s, test/leads/stats access and agency-only 403s; auth role-guard test updated.
</details>

<details>
<summary><strong>Clients management + owner portal (DONE)</strong></summary>

- **Invite flow with zero password handling:** `POST /api/admin/clients` creates the user and
  stores a better-auth reset-password-shaped token (`identifier: "reset-password:<token>",
  value: userId`); the copyable setup link opens `/accept/<token>` which calls better-auth's own
  public `POST /api/auth/reset-password {newPassword, token}`. Hashing, credential-account
  upsert, single-use consumption — all native. Hand-rolled hashing was tried first and abandoned:
  the exported `better-auth/crypto` hashPassword does NOT match what credential sign-in verifies.
- Agency endpoints: create (409 on duplicate email), `POST /clients/:id/reset` (invalidates prior
  tokens via `delete where value=userId and identifier like 'reset-password:%'`), DELETE removes
  user + cascades (agency accounts protected). Unknown chatbot ids in assignment → 400.
- **Session context:** `lib/session.tsx` provider (fetches `/api/auth/me`, exposes useSession);
  Topbar reads it; Sidebar filters nav by role (`Clients`+`Settings` agency-only). Client role is
  redirected away from `/settings` & `/chatbots/new`; Chatbots/Overview hide create CTAs and row
  controls (pause/delete/model) for clients.
- **ChatbotEditor role-gating:** client owners see Leads/Knowledge/Test only; Knowledge tab gets
  an OwnerLookFields section (brand color + WidgetFields w/ owner copy variant); Settings tab and
  its fields are gone exactly matching the server allowlist.
- **Preview mode:** `/chatbots/:id?as=owner` (validateSearch-typed) renders the gated view for
  agencies under a labeled banner w/ Exit; real clients get the same gating permanently.
- New pages/components: `pages/Clients.tsx` (list, bot chips jump to editor, Add-client dialog →
  SetupLink dialog w/ copy + open, Assign-bots checkbox dialog, two-step Remove),
  `components/Dialog.tsx` (Escape/backdrop close), `pages/AcceptInvite.tsx` (password + confirm,
  field validation, success card).
- Tests: server `tests/clients.test.ts` (8: create/duplicate/accept+signin/token-reuse/expiry/
  reset-invalidation/reassign/remove/guards); dashboard `Clients.test.tsx` (4) +
  `OwnerPortal.test.tsx` (preview tab strip, gating redirects).
</details>

<details>
<summary><strong>Client portal polish rounds 1–2 (DONE)</strong></summary>

- **Preview/consumer split:** ChatbotEditor now distinguishes `isClient`, `previewingOwner` and
  `ownerView` — the "Previewing the owner portal" banner + Exit button render only for agency
  preview mode (`?as=owner`), never for signed-in clients (the flag that previously
  produced the bug ignores `?as=owner` for clients too). Regression-tested.
- **Copy de-agencified for client eyes:** chatbots subtitle, sidebar footer ("for agencies"),
  overview empty hint, topbar role badge casing; knowledge import card hidden from clients &
  preview (`canImport`) since `/api/admin/import` is agency-only — no more 403 dead-ends.
- **Live Overview counters:** new role-scoped `GET /api/admin/stats`
  (`dashboardStatsSchema`: chatbotsTotal/Active, conversations, leads, messages) replacing
  placeholder zeros; teaching hints flip once numbers > 0; graceful fallback to zeros if stats
  fail. Recent-bots rows deep-link into each editor instead of the list page.
- **Valid chatbot rows:** list rows no longer nest interactive `<button>` elements inside a
  button (invalid HTML / broken AT navigation); open-editor target and pause/delete controls are
  siblings in one flex row, stopPropagation hacks removed.
- **Fresh-bot orientation:** empty Knowledge tab opens with a short "Teach your chatbot about X"
  intro (why knowledge matters, three fill paths, import mentioned only where available).
- Tests: OwnerPortal client-journey regressions (no banner/no settings/no import; ?as=owner
  ignored), scoping.test gains /stats scoping block (76), Overview.test counters/hints/fallback
  (42 dashboard total).
</details>

<details>
<summary><strong>Client portal polish round 3 — session, safety, invite flow (DONE)</strong></summary>

- **One auth round-trip per load:** layout guard + SessionProvider + Login's mounted-check all
  share a memoized `fetchMe()` promise in `lib/session.tsx` (was 2–3 fetches on a cold load).
  Cache invalidated via `resetSessionCache()` on sign-in/sign-up/sign-out and between tests
  (setup.ts); Session.test pins exactly one `/api/auth/me` across deep links and SPA navigation.
- **In-app discard confirmation:** leaving a dirty editor opens the shared Dialog (Keep editing /
  Discard changes) instead of native `window.confirm`; clean back leaves immediately. Tests for
  both states in ChatbotEditor.test.
- **AcceptInvite to standard:** extracted `components/auth/fields.tsx` (Field, PasswordField with
  show/hide, StrengthMeter, aria-describedby wiring) now shared by Login + AcceptInvite; errors
  clear per keystroke; strength meter shown; confirm placeholder; post-success is SPA navigation
  (cache-reset before routing). AcceptInvite.test: happy path posts token+password to better-auth's
  reset-password endpoint, validation gating blocks submit, mismatch message, server-rejected link.
</details>

<details>
<summary><strong>Client portal polish round 4 — domain guardrails + inbox feel (DONE)</strong></summary>

- **Empty-domain guardrails:** server behavior confirmed — an empty allowlist means the widget
  answers from ANY origin (`originAllowed` returns true), so both surfaces warn instead of block:
  `DomainsList` empty state is a warning callout (wizard + editor share it), and the editor's
  Settings status picker shows "Live and open to any website" while status=active and no domain
  has a value. Tests cover warn-clears-when-typed and paused-state silence.
- **Relative lead timestamps:** new pure `lib/reltime.ts` (just now / Nm / Nh / yesterday / Nd /
  short-date fallback, future-skew clamp) unit-tested; leads rows show relative time with full
  datetime on hover via title attr.
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

1. **Lead-capture emails** — SMTP settings surface, `nodemailer`, trigger when visitor name/email
   captured (detect in chat route), digest option later. The editor's Leads tab already lists
   captured leads; the email notification is the missing push. (Client accounts + portal are DONE:
   invites via copyable setup links, assignment, owner-scoped UI, preview mode + polish rounds.)
3. **Conversations browser + analytics** — per-bot thread view, leads inbox, trends/top-questions/
   knowledge-gaps cards; token spend from stored usage columns.
4. **White-label polish** — agency branding tokens, powered-by default toggle wiring.
5. **E2E tests** — Playwright: install→wizard→create→chat happy path; then CI publish workflow.

## Environment & commands

```bash
corepack enable && pnpm install        # node >= 22
pnpm approve-builds                    # allow better-sqlite3 + esbuild native scripts (first time)
pnpm dev            # API server :3000  (serves /admin/, /embed.js)
pnpm dev:dashboard  # Vite :5173     (proxies /api, /embed.js)
pnpm test && pnpm lint && pnpm typecheck && pnpm build
docker compose -f docker/docker-compose.yml up -d --build
```

`.env` keys: `OPENAI_API_KEY` + `OPENAI_BASE_URL` (or set inside Settings UI).
There is **no default model** — the owner sets it either globally in Settings (Default model) or
per chatbot; chatbots with no model refuse to answer with a clear "MODEL_NOT_CONFIGURED" error.
`ENCRYPTION_KEY` is optional — if unset, the server auto-generates one on first launch and persists
it as `data/encryption.key` inside the volume (chmod 600), so no env setup is needed. Setting it
explicitly overrides the generated key (and lets you manage/rotate it yourself). No demo bot is
seeded — fresh installs start with a blank chatbot list.

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
166d238 style: biome formatting
a8f92cc design: leads inbox reads like an inbox — relative timestamps (reltime.ts) with short-date fallback + hover datetime
194a45b feat: empty-domain guardrails — DomainsList warning callout + active-bot status warning when no domains configured
bdd2322 feat: accept-invite page reaches login-page standard — shared auth field components (fields.tsx), strength meter, keystroke-clearing errors, SPA hand-off
f26ead8 design: in-app discard confirmation — Dialog replaces native window.confirm on dirty-editor back
b7ec5bb perf: single /api/auth/me round-trip per load — memoized fetchMe() shared by guard/provider/login, invalidated on auth transitions
0f0bcf3 docs: PROGRESS.md — polish rounds 1-2 snapshot, tests 118, commit trail synced to pushed history (stale uncommitted entries resolved); biome formatting touch-ups
59e9e88 design: fresh-bot knowledge orientation — teaching intro card on empty Knowledge tab
684495b fix: chatbot list rows no longer nest interactive buttons — open-editor button and pause/delete controls are siblings, stopPropagation hacks removed
7566a16 feat: real overview counters — role-scoped GET /api/admin/stats (chatbotsTotal/Active, conversations, leads, messages) + live Overview cards, deep-linked recent rows
f76be3a feat: owner portal UI — session context, Clients management page, accept-invite page, role-filtered sidebar, ChatbotEditor gating + ?as=owner preview mode; client-view copy polish (no preview banner for real clients)
4224e52 feat: client accounts & ownership scoping — client sessions scoped to assigned bots (404 not 403), PUT field allowlist, clients endpoints with setup tokens; partial-PUT systemPrompt wipe fixed
5b248f3 docs: PROGRESS.md — commit trail entries for ColorField hex + URL schema fixes
8268726 fix: wizard invalid-URL dead-end — normalize scheme-less website/avatar URLs in shared schema
1e7b5ab fix: shared ColorField hex typing works everywhere (wizard + settings)
a4009e7 design: create wizard — two-panel Linear-style redesign
ae742ef perf: import speed + OpenRouter provider pin
b874657 fix: capitalize chatbot status labels (Active/Paused/Archived) everywhere — shared label map
9e12972 feat: explicit model config + zero-config secrets — no implicit model default (Settings default or per-bot, else MODEL_NOT_CONFIGURED), auto-generated app secret, no demo seed on boot
d38464d feat: guided create wizard (/chatbots/new) — shared chatbot components extracted, post-create lands in editor
db55828 design: widget header — chevron right-aligned in all configs, bare overlay header (transparent, no border, welcome text aligned with chevron) when logo/name/status are all off; preview mirrors including header border
2693855 feat: widget settings round 2 — logo upload, hide business name, responsive header
291e353 feat: widget settings — logo on/off + custom image, online-now toggle, powered-by badge
7abb87f docs: PROGRESS.md — settings editor polish, test count refresh, clean commit trail
92e4ca4 feat: chatbot settings editor — typeable brand color, domain line list, status dropdown
16193ef fix: chat replies — plain-text facts, brevity guardrails, unwrap JSON replies, markdown widget, temp 0.4
5759fdf feat: knowledge editor + import UX — Notion-doc facts, clear-all-facts, leads graphs
7df0684 feat: import engine — multi-page crawl, chatbot-model extraction, JSON facts prompt
e149abd design: wordmark logo replaces robot mark — theme-adaptive SVG
232a70c feat: polished sign-on — password confirmation, fresh-install signup, post-auth redirect
ed7fd4d docs: add gotcha — never commit local data to GitHub
84de3c0 chore: stop tracking SQLite data files — gitignore apps/server/data
bc63e86 docs: PROGRESS.md — session handoff with expandable architecture
01010ce docs: document URL routing architecture and routes table
2316961 chore: final lint cleanups after routing migration
7a33e26 refactor: drop obsolete intent-clearing effect — URL param is the state
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
