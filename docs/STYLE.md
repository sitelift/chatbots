# Style Guide

The design contract for every SiteLift surface. This operationalizes PRODUCT.md principle 1: **style is the product.** If a surface doesn't meet this spec, it isn't done.

Token values live in [`apps/dashboard/src/styles/globals.css`](../apps/dashboard/src/styles/globals.css) (Tailwind v4 + shadcn-compatible, OKLCH, light/dark parity). Components consume tokens only — hardcoded colors and pixel values are bugs.

## 1. North stars

| Surface | Reference | What we steal |
| --- | --- | --- |
| Agency dashboard | **Linear** | Restraint, speed-as-aesthetic, ⌘K palette, keyboard-first, dense-but-breathable tables, hierarchy via type weight |
| Analytics views | **Plausible / Fathom** | Big honest numbers, flat sparklines, zero chart junk, plain-language labels |
| Facts editor | **Notion** | Editing feels like writing a doc; prompt preview as a first-class side pane |
| Inbox / conversations | **Intercom inbox + Attio** | Thread-list + detail split; clean rows, hover actions, side-panel records |
| Widget | **Intercom Messenger + HelpScout Beacon** | Tiny footprint, spring open animation, iMessage-feel messages; our edge: perfect brand theming + accessibility |
| Overall vibe | **Vercel (Geist)** | Monochrome precision, typographic clarity, empty states that teach, dark mode as equal citizen |

## 2. The DNA — rules that never bend

1. **One accent color.** Indigo (`--primary`). Everything else is zinc neutrals plus semantic green/red/amber used only for meaning (success/error/warning), never decoration.
2. **Typography does the work.** Hierarchy comes from size and weight — never from boxes, dividers, or color fills.
3. **Motion ≤200ms in the dashboard.** Ease-out, opacity/transform only. The widget bubble is the one springy exception.
4. **Borders over shadows.** Flat surfaces; elevation = border + subtle fill. Shadows exist at two levels max.
5. **Empty states teach.** Every empty view shows icon + one-line explanation + the action that fixes it ("No conversations yet — embed your first widget").
6. **Dark mode parity from day one.** Every screen is designed and reviewed in both modes. Driven entirely by CSS variables.

## 3. Color system

Base: zinc neutrals (OKLCH). Accent: indigo ~277° hue. Full values in `globals.css`.

| Role | Token | Usage |
| --- | --- | --- |
| Page background / text | `background` / `foreground` | Canvas and default text |
| Raised surfaces | `card`, `popover` | Cards, dropdowns, dialogs |
| Accent | `primary` / `primary-foreground` | Primary buttons, active states, links, focus ring, brand moments |
| Subtle surfaces | `muted` / `muted-foreground` | Secondary text, hover fills, skeletons, metadata |
| Semantic | `success` · `warning` · `destructive` | Status only: lead captured, paused bot, delete actions |
| Charts | `chart-1…5` | Fixed series order; never introduce new chart hues |
| Lines | `border` / `input` | All borders and input strokes |

Rules:

- Never hardcode hex/oklch in components — tokens only.
- Opacity variants of tokens (`primary/10`) are allowed for tints; new hues are not.
- Text on `muted` backgrounds must use `muted-foreground` minimum contrast (AA).

## 4. Typography

Font stack: **Geist Sans** (UI), **Geist Mono** (ids, code, token values). System fallbacks declared in tokens.

| Level | Size/weight | Use |
| --- | --- | --- |
| Display | 30px / semibold / tracking-tight | Page titles only |
| Heading | 20px / semibold | Section titles, dialog titles |
| Subheading | 16px / medium | Card titles, group labels |
| Body | 14px / regular | Default UI text, table cells |
| Small | 13px / regular | Secondary descriptions, helper text |
| Micro | 12px / medium | Badges, table metadata, overline labels |

Rules:

- Sentence case everywhere. ALL CAPS only for 12px overline labels with letter-spacing.
- `tnum` (tabular numerals) on every numeric column, stat, and timestamp.
- Prose measure ≤70ch. Line-height 1.5 body, 1.2 headings.

## 5. Spacing & layout

- 4px base grid; all padding/margin/gap in multiples of 4.
- App shell: sidebar 240px (collapsible to icons), content max-width 1200–1400px, page padding 24px (32px ≥xl).
- Card padding 16px (compact) / 24px (feature cards). Table row height 44px.
- Related controls 8px apart; groups 16–24px; sections 32–48px.

## 6. Radius & elevation

- Radius tokens from `--radius` (10px base): inputs/buttons `md`, cards/dialogs `lg`, badges/chips/avatars pill.
- Elevation levels: **flat** (bordered surface) → **overlay** (`shadow-md`, popovers/dropdowns) → **modal** (`shadow-lg`, dialogs). Nothing else floats.

## 7. Motion

| Token | Value | Use |
| --- | --- | --- |
| `--duration-fast` | 150ms | Hovers, fades, color changes |
| `--duration-normal` | 200ms | Panels, dialogs, page transitions |
| `--ease-out` | cubic-bezier(0.25, 1, 0.5, 1) | Everything in the dashboard |
| `--ease-spring` | cubic-bezier(0.34, 1.56, 0.64, 1) | Widget bubble open/close only |

Rules:

- Animate opacity and transform only — never layout properties.
- Loading = skeleton shimmer (`animate-skeleton`), never spinners, except inline button spinners.
- `prefers-reduced-motion` disables all nonessential motion (handled globally in `globals.css`).

## 8. Component conventions

- **Buttons:** one primary per view. Variants: primary (accent fill), secondary (muted fill), ghost, destructive (red, confirm-first actions). Height 36px (32px dense tables).
- **Focus:** always visible — `ring-2 ring-ring ring-offset-2 ring-offset-background`. Never remove outlines without replacement.
- **Tables:** sticky header, `hover:bg-muted/50` rows, right-aligned numeric columns with `tnum`, row actions revealed on hover, density toggle where tables dominate.
- **Forms:** label above field, helper below, errors in `destructive` with icon; validate on blur, submit on enter; never disable submit without explaining why.
- **Dialogs:** centered, `popover` background, overlay `black/40`; destructive confirmations name the object ("Delete chatbot Acme HVAC?").
- **Toasts:** sonner, bottom-right, one accent usage per toast max.
- **Empty states:** icon in muted circle, title, one-line hint, CTA button. Designed for every list view before it ships.
- **Badges:** pill, tinted (`bg-primary/10 text-primary`) — status colors reserved for status.

## 9. Widget design language

All widget styles are scoped in Shadow DOM with `--sl-*` prefixed tokens mapped from chatbot config (brand color, name, avatar) — see ARCHITECTURE.md §4.3.

- **Bubble:** 56px circle, brand accent fill, white icon; bottom-right default; hover scale 1.05 (150ms).
- **Panel:** 380px wide (100% mobile), max-height 640px, radius `lg`, shadow-lg, header with avatar + name + powered-by slot.
- **Open animation:** scale 0.95→1 + translateY 8px→0, 250ms `--ease-spring`. Close reverses at 150ms ease-out.
- **Messages:** visitor right-aligned accent bubbles; assistant left-aligned card surfaces; 12px gap; streaming cursor = blinking block in brand color.
- **Quick replies:** outline pills under the last assistant message; dismiss after tap.
- **Proactive nudge:** small card above bubble after configured idle seconds; dismissible; default off.
- **Theme:** follows host page `prefers-color-scheme` unless the embed config forces a mode; brand color must pass AA against white text (auto-adjust lightness if not).
- **Accessibility:** full keyboard nav, focus trap in panel, ARIA live region for streaming tokens, visible focus rings per §8.

## 10. Style bar — release gate

Every surface ships only when:

- [ ] Reviewed in light **and** dark mode
- [ ] No hardcoded colors/sizes — tokens only
- [ ] Keyboard-navigable with visible focus states
- [ ] Empty, loading (skeleton), and error states designed — not just the happy path
- [ ] Motion audit: ≤200ms dashboard, transform/opacity only, reduced-motion respected
- [ ] Type hierarchy follows §4; sentence case; `tnum` on numbers
- [ ] Contrast passes WCAG AA (including brand-color widget bubbles)
