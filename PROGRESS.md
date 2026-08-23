# PROGRESS — Working Session Handoff

> **Living document.** Update this at every stable point so any session/device can pick up cold.
> Read [`AGENTS.md`](AGENTS.md) (working rules) and [`docs/PRODUCT.md`](docs/PRODUCT.md) (scope contract) first.
>
> **Last updated:** after commit `01010ce` + uncommitted polish: split-screen sign-on, password confirmation, fresh-install signup routing, bootstrap endpoint, **rebrand to wordmark logo**.

---

## Snapshot

| | |
| --- | --- |
| **Product** | Open-source, self-hosted AI chatbot platform for web agencies. One Docker container, unlimited client chatbots, agency-branded, BYO OpenAI-compatible key. |
| **Stack** | TypeScript strict · pnpm monorepo · Hono + Drizzle + SQLite (server) · React 19 + Vite + Tailwind v4 + TanStack Router/Query (dashboard) · dependency-free Shadow-DOM widget · better-auth · Biome/Vitest/GitHub Actions |
| **Tests** | 42 passing (26 server · 16 dashboard) — gate: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` before every commit |
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
  `/chatbots/$botId` · `/playground?bot=` · `/settings`; auth-guarded layout;
  prod basepath `/admin` (Hono SPA-fallbacks `/admin/*`)
- Refresh / back / forward / deep links work everywhere
- Overview: live counts from API, working buttons, recent-bots list
- Chatbots list: create/pause/delete (two-step confirm), rows deep-link to editor
- ChatbotEditor: full field editing incl. structured facts + FAQ pairs + prompt preview,
  danger-zone delete, jump-to-playground
- Playground: bot selector bound to URL, embed-snippet copy, iframe keyed remount
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
   captured (detect in chat route), digest option later.
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
