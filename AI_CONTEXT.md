# AI_CONTEXT.md — orientation for a new Claude session

This file exists so a fresh session can become productive on this codebase
in minutes instead of hours. Read this first; it links to the deeper docs
(`docs/design-system.md`) rather than duplicating them.

**Current branch: `claude/session-coq5f0`** (not `main`). Working tree is
clean as of this writing — everything described below is committed and
pushed. Check `git log --oneline -15` on session start to confirm nothing
has moved since.

**Files to read first, in order**: this file → `docs/design-system.md`
(visual language) → `src/features/invoices/components/invoice-builder.tsx`
(the reference implementation everything else is measured against) →
whichever feature's `queries.ts`/`actions.ts` you're about to touch.

---

## The redesign program (what happened this session)

The product had complete business logic but read as a generic admin panel.
The work was a full presentation-layer redesign — **zero schema, RPC,
route, validation, or business-logic changes anywhere** — done in two
phases: (1) a whole-app visual/compositional pass, then (2) a from-scratch
rebuild of the Invoice/Quotation Builder as the flagship reference
implementation of a new design language.

### Phase 1 — completed milestones (whole app)

- **Design tokens & shell**: ink sidebar in both light/dark themes, accent
  rail on active nav, tactile button press physics, elevation tokens
  (`--shadow-overlay`, `--shadow-modal`), motion doctrine in `globals.css`
  (150ms micro-interactions, 250–350ms entrances, `prefers-reduced-motion`
  zeroes all of it).
- **Dashboard**: recomposed from scattered KPI tiles into a unified metrics
  ribbon + a revenue hero (chart + headline figure) + a persistent activity
  rail. KPI values count up on mount; ribbon tiles link into their module.
- **Detail pages** (invoice, quotation, client — the "Record" archetype):
  rebuilt around a hero band (headline value + primary actions) with a
  subject-left / context-rail-right body. This predates and directly
  informed the Focus-archetype builder work below.
- **Fulfillment cockpit**: animated progress bars, panel transitions, KPI
  styling brought in line with the rest of the app.
- **Lists, tables, forms**: consistent toolbar/filter patterns, save-status
  pill, tinted totals footers — the groundwork the builder redesign then
  built on top of.

### Phase 2 — the Invoice/Quotation Builder rebuild (the reference implementation)

This was **not an incremental redesign** — the old form (a 9-column input
grid: type/desc/qty/unit/price/disc%/tax%/total/delete, every field always
visible, categories behind tabs) was rebuilt from first principles as a
**document editor**. Full design rationale and the build-ready redline
(exact type scale, spacing, motion timings, keyboard map) is preserved in
`/root/.claude/plans/i-want-to-build-glittery-pascal.md` if you need the
"why" behind any specific number — the sections below are the "what."

**Milestones M1–M8, all shipped and mirrored to both builders:**

| # | What shipped |
|---|---|
| M1 | `DisclosureRow` — the line-item atom, reads as typography at rest, not a form grid |
| M2 | Enter-to-compose (commit line → spawn next, caret follows) + Backspace-to-delete-empty |
| M3 | Document-level Tax & Discount control with following/pinned semantics |
| M4 | Unified `InsertPalette` (⌘K) replacing two separate catalog/template picker dialogs |
| M5 | Letterhead + Bill To recipient-as-address-block + property rows |
| M6 | Totals redline + Notes/Terms as opt-in disclosure chips |
| M7 | Readiness dot + `ReviewSendOverlay` (the send moment) + draft-only redirect |
| M8 | Full language mirrored to the Quotation Builder |

**Then, after first real use, two interaction-design corrections** (the
most recent commits): the row amount was showing a tax-inclusive figure —
fixed to always show the **pre-tax, post-discount line subtotal** (tax is a
document-level concept, shown only in the Tax/Discount control and the
totals block, never in a row). And **Unit was relocated** from the
row-expand into the always-visible row, beside Quantity (they describe
"how much of what" together); Discount/Tax/Category remain true per-line
exceptions behind the expand (⌄).

### Design philosophy established this session

Three named principles that now govern every surface, stated explicitly so
they don't erode over time:

1. **The row/field answers one question; the totals/summary answer a
   different one.** Line-level UI answers *"what am I billing/looking
   at?"*; document-level UI (totals, tax) answers *"what does this add up
   to?"* Never blend the two into one number.
2. **The honesty rule.** Anything hidden behind progressive disclosure that
   still affects a total must leave a visible trace at rest (the discount/
   tax "honesty badges" on a collapsed row) — hiding a value is fine,
   hiding its *effect* is not.
3. **Motion means something or it doesn't exist.** Rolling numbers signal
   *recomputation*, stagger signals *arrival*, entrance signals *a new
   surface*. There is no decorative/ambient motion anywhere in the app —
   this was a deliberate, repeated design decision, not an oversight.

### Three-archetype page language ("Meridian" extends to layout, not just tokens)

Every page in the app is now one of three shapes — a new page should pick
one, not invent a fourth:

- **Overview** (lists/dashboards): toolbar → metrics → content → optional
  rail.
- **Record** (detail pages): hero band (headline value + actions) → subject
  (left) + context/history rail (right). *Shipped*: invoice/quotation/
  client detail.
- **Focus** (compose & commit): sticky command bar (live answer + actions)
  → centered "sheet" (the artifact) → progressive disclosure. *Shipped*:
  the two document builders. This is the newest archetype and the one most
  likely to need a fourth example (a settings/edit form) to prove it
  generalizes beyond documents.

### Shared primitives created this session

New, reusable, and **not yet used anywhere they could be** (see roadmap):

| Primitive | File | Reused by |
|---|---|---|
| `BuilderCommandBar` | `src/features/documents/components/builder-command-bar.tsx` | Invoice + Quotation builders |
| `DisclosureRow` | `src/features/documents/components/disclosure-row.tsx` | Invoice + Quotation builders (via `LineItemsEditor`) |
| `InsertPalette` | `src/features/documents/components/insert-palette.tsx` | Invoice + Quotation builders |
| `ReviewSendOverlay` | `src/features/documents/components/review-send-overlay.tsx` | Invoice + Quotation builders |
| `useRollingAmount` | `src/features/documents/hooks/use-rolling-amount.ts` | Command bar total, every row amount |

None of these are extracted into `src/components/shared/` yet — they're
still living under `src/features/documents/` because they were purpose-
built for the builders first. If you generalize any of them for reuse
outside quotations/invoices (e.g. a fulfillment line-item list, a payment
allocation editor), that's the point they should move.

### Business rules that must never change

These survived the entire redesign untouched, verified by diff at every
milestone. Any future UI work must preserve them exactly:

- Autosave: 2.5s debounce after the last edit + a 30s safety-net interval,
  both gated on `isDirty`/`isEditable`.
- `beforeunload` warns on navigating away with unsaved changes (native
  browser confirm — the one place that isn't the app's own dialog, on
  purpose, since it must fire even if React has unmounted).
- Keyboard: `⌘S`/`Ctrl+S` saves, `⌘⏎`/`Ctrl+Enter` sends — global,
  independent of whatever's focused.
- `createInvoiceSchema`/`createQuotationSchema` (Zod) is the only
  validation gate before a save reaches the server.
- Blank line-item rows (empty description) are filtered out of what's
  submitted/validated — `submittableLineItems`, not `lineItems` — so a
  half-typed row never fails validation or gets persisted.
- `isEditable` gating: only `draft` (and, for quotations,
  `revision_requested`) may be edited; anything else redirects to the
  detail page (see "draft-only" below).
- Create-vs-update branching and the exact `router.push`/`router.replace`
  targets after each action.
- Currency follows the selected client (`client.preferred_currency`, falls
  back to `workspace.default_currency`) — never asked for independently
  until after a client is chosen.
- `computeLineItemTotals()` in `src/features/line-items/helpers.ts` is the
  **single** source of truth for subtotal/discount/tax/total math — client
  live-preview and server persistence must never diverge from it.

### Known compromises / technical debt (be honest about these)

- **`ReviewSendOverlay` does not use the real themed `DocumentRenderView`.**
  It shows a document-styled preview built from live builder state
  instead, because the themed renderer needs template/theme data
  (`src/features/templates/`) that the builder pages don't currently fetch.
  Follow-up: thread the workspace's default template + theme into
  `invoice-builder.tsx`/`quotation-builder.tsx` and swap the overlay to
  render the actual `DocumentRenderView`. This is the single biggest gap
  between the shipped builder and the original design spec.
- **The apply-tax cascade rolls simultaneously, not staggered.** The
  original spec called for each affected line to roll in sequence
  (`index * 40ms` stagger) when a document-level tax/discount default is
  applied, as a "consent" animation. Implemented as a simultaneous roll
  instead — staggering would have meant staggering the underlying state
  writes too, which risked leaking partially-applied payloads into
  autosave mid-cascade. Revisit only with a non-state-driven animation
  approach (e.g. animate a visual overlay, not the committed value).
  Nothing is wrong today; the visual "all lines just changed" signal is
  just less pronounced than originally specced.
- **`DisclosureRow`'s expand state is keyed by array index, not a stable
  row id.** `LineItemInput` has no client-side stable id. A mid-list
  insert (rare — Enter-to-compose always inserts at the end of a category
  group) can hand a still-expanded row's `expanded` state to whatever row
  slides into that index. Cosmetic only (never affects saved data); fix by
  giving `LineItemInput` a client-only `_key` (not persisted) if it starts
  to matter.
- **`src/features/audit-log/` has no UI.** `log_audit_entry(...)` writes
  structured before/after diffs from every mutation RPC, but there's no
  query layer or component surfacing them. Pre-existing gap, not touched
  this session, but worth knowing before someone assumes there's an audit
  trail view somewhere.
- **New builder primitives aren't extracted to `src/components/shared/`
  yet** — see the primitives table above. Deliberate: the plan
  (`i-want-to-build-glittery-pascal.md`) calls for extracting reusable
  primitives *after* the reference implementation is proven exceptional in
  real use, not preemptively. Don't generalize them speculatively.

### Remaining redesign roadmap

In the order the design-language plan lays out (see the plan file for full
rationale), **not started yet**:

1. **Propagate the Focus archetype's primitives** to any other
   create/edit forms in the app (settings forms, catalog item forms, etc.)
   — right now only the two document builders use `BuilderCommandBar` /
   `DisclosureRow`-style patterns.
2. **Extract shared primitives** from `src/features/documents/` into
   `src/components/shared/` once a second non-document use case proves
   they generalize (see technical debt above).
3. **Write the formal design-language doc** (principles, three archetypes,
   token table, governance rules — "if the accent appears outside these
   three places, that's a bug") as a companion to `docs/design-system.md`.
   Right now that knowledge lives only in this file and the plan file.
4. **Wire the themed `DocumentRenderView` into `ReviewSendOverlay`** (see
   technical debt above) — the most concrete next fix.
5. Optional/lower priority per the plan: a builder "focus mode" that
   collapses the app sidebar while composing (Linear-style), a real
   staggered apply-tax cascade via a non-state-driven animation approach.

Nothing in the Overview archetype (lists, reports, payments, leads,
catalog) was touched by the Focus-archetype rebuild — those pages reflect
Phase 1 only.

---

## What this is

**CRM-tracker** — a multi-tenant Business Operating System for small
service/agency businesses: leads → clients → quotations → invoices →
payments → fulfillment, plus reporting and a branded client portal.
Indonesian business context (PPN 11% tax is a first-class concept; IDR is
the common default currency, but the app is multi-currency per-document).

**Stack**: Next.js 16 (App Router, React 19 Server Components + Server
Actions), Supabase (Postgres + Auth + RLS), Tailwind v4, shadcn/radix
primitives, Zod validation, TanStack Table, TipTap rich text, Recharts.

**Where things live**:
- `src/app/` — routes only (thin pages that fetch + compose feature
  components). No business logic here.
- `src/features/<domain>/` — the real code, one folder per business domain.
- `src/components/ui/` — shadcn primitives (Button, Input, Dialog, …).
- `src/components/shared/` — the product's own shared patterns (PageHeader,
  DataTable, StatusBadge, DetailHeader, form system, …).
- `src/providers/` — app-wide React context (workspace, toast, confirm,
  theme, supabase client).
- `supabase/migrations/` — the database, numbered sequentially (39+ so far).
- `docs/design-system.md` — the full visual language ("Meridian"). Read it
  before touching any UI.

## Feature module convention

Every folder under `src/features/` follows the same shape (not all files
exist in every feature — small features omit what they don't need):

| File | Responsibility |
|---|---|
| `types.ts` | Domain types (often mirroring a DB row or a query's shape) |
| `validators.ts` | Zod schemas for create/update inputs |
| `queries.ts` | Server-side Supabase reads (called from `app/` pages) |
| `actions.ts` | `"use server"` mutations — the only way client code writes data |
| `helpers.ts` | Pure functions (e.g. `computeLineItemTotals`) |
| `components/` | Client + server components for this domain |

**Isolation rule** (stated in code comments throughout): features do not
import each other's internals. Where one domain's UI needs data shaped like
another domain's (e.g. a client detail page showing that client's
quotations/invoices/payments), the consuming feature declares its own
**local, duplicate type** for that summary shape rather than importing the
other feature's `types.ts`. Cross-feature composition happens only in the
`app/` page layer, which fetches from multiple features' `queries.ts` and
passes plain data down as props. This keeps features independently
reasoned-about and prevents import cycles.

Server Actions (`actions.ts`) are the only mutation path — client
components never call Supabase directly for writes. Every action wraps its
body in `withWorkspace(workspaceId, minRole, callback)` (from
`src/lib/with-workspace.ts`), which re-checks auth + membership + role
server-side (never trusts the client), validates input against the
matching `validators.ts` Zod schema, then usually calls a single Postgres
RPC — see "RPC pattern" below. Returns `{ data } | { error }` rather than
throwing, so callers show the error inline instead of crashing.

## Multi-tenancy, auth, and permissions

- **Workspace-scoped**: every table has a `workspace_id`; every query and
  RLS policy filters by it. Routes live under
  `src/app/(dashboard)/[workspaceSlug]/...` — the slug resolves to a
  workspace, and `src/lib/workspace.ts` exports `getWorkspaceBySlug(slug)`
  (public lookup, excludes soft-deleted) and `getWorkspaceContext(slug)`
  (resolves the *current* user's membership + role, returns
  `WorkspaceContext { workspaceId, userId, role }` from
  `src/lib/types/index.ts`, or `null` if not a member).
- **Auth**: Supabase Auth (email/password + session cookies via
  `@supabase/ssr`). `src/lib/supabase/{client,server,middleware}.ts` are the
  three client constructors (browser / server component / middleware).
  `updateSession()` in the middleware refreshes the session on every
  request; public/unauthenticated paths are `/login`, `/signup`,
  `/forgot-password`, `/auth/callback`, `/invite/*` (invite-token gated),
  and all of `/portal/*` (never has a Supabase session). Everything else
  redirects to `/login` when unauthenticated.
- **Roles**: `src/lib/constants/roles.ts` — `viewer < staff < admin < owner`,
  checked with `hasMinRole(userRole, requiredRole)`. Enforced both by
  `withWorkspace(workspaceId, minRole, cb)` (app-level, in every Server
  Action) and again inside the Postgres RPC each action calls (`get_user_role`)
  — RLS is the real boundary, the app check is a UX nicety.
- **Client-facing portal**: `src/app/portal/{invoices,quotations}/[token]/`
  — share-token based (not authenticated-user) access so a client can
  view/approve a specific document via a link, entirely separate from staff
  auth.

## Database conventions

- Migrations are strictly sequential and never edited after landing
  (`00001_...sql` → `00039_...sql` currently) — always add a new file, never
  amend history.
- **Soft delete everywhere**: `deleted_at timestamptz`, queries filter
  `.is("deleted_at", null)` (Postgres side: partial unique indexes use
  `WHERE deleted_at IS NULL`). Nothing is hard-deleted from user-facing flows.
- **RLS** on every table: SELECT policies check
  `workspace_id IN (SELECT get_user_workspace_ids())` + `deleted_at IS NULL`;
  write policies check `get_user_role(workspace_id) IN (...)` with the
  role floor varying by action (e.g. reports allow `viewer`). This is the
  real enforcement boundary — app-level role checks are a UX nicety on top.
- **RPC pattern for all mutations**: every write goes through a
  `SECURITY DEFINER` Postgres function (`SET search_path = ''`, fully
  `public.`-qualified) that (1) re-checks role via `get_user_role`,
  (2) validates, (3) writes transactionally, (4) calls `log_activity(...)`
  and `log_audit_entry(...)`, (5) returns `to_jsonb(row)`. Examples:
  `create_invoice`, `duplicate_invoice`, `create_quotation_version`,
  `generate_invoice_from_quotation`, `record_payment`,
  `update_company_profile`. **Document numbering** (`00039`): one function
  `next_document_number(workspace_id, document_type, prefix, date)` backed
  by a `document_sequences` table keyed on `(workspace_id, document_type,
  period)` where period = `YYYYMMDD` — produces `PREFIX-DDMMYYYY-NNN`,
  resets daily, shared by quotations (QUO), invoices (INV), and payments
  (PAY).
- **Activity log**: `src/features/activities/` — a generic append-only feed
  (actor, description, entity refs, metadata jsonb) written by
  `log_activity(...)` inside the RPCs above, rendered via `ActivityTimeline`
  on the dashboard and every detail page.
- **Audit log**: `log_audit_entry(...)` writes structured before/after
  field diffs into an `audit_logs` table from the same RPCs — but
  `src/features/audit-log/` has **no query/component layer yet**; it's
  written to but not yet surfaced anywhere in the UI. A real gap to fill if
  asked for an audit trail view.
- **Gotcha**: some `recorded_by`/`created_by`-style columns
  (`fulfillment_events.recorded_by`, `invoices.created_by`,
  `payments.recorded_by`) reference `auth.users` directly, not a `profiles`
  table — you can't embed the actor's name via a PostgREST join and must
  resolve it with a second query.

## The document system (quotations & invoices)

This is the most architecturally deep part of the app — two parallel
concerns:

**1. Rendering/theming** (`src/features/templates/`) — a block-based
document composition system: `document_templates` (which blocks, in what
order) + `template_themes` (color/type presets) are stored per workspace,
with a preset gallery. `src/features/documents/` (the renderer side, not
the new builder side — see below) turns a quotation/invoice + its template
+ theme into the actual rendered document (`DocumentRenderView`), used on
detail pages and the client portal, and by `renderDocumentMeta` /
block-renderers for the visual output. This is what a client actually
sees. Full detail in `docs/design-system.md` isn't the renderer doc —
search `src/features/templates/` and `src/features/documents/` directly if
extending it.

**2. The builder editors** (`src/features/invoices/components/
invoice-builder.tsx`, `src/features/quotations/components/
quotation-builder.tsx`) — the staff-facing compose/edit workflow, recently
rebuilt (this session) as a **"document editor"** rather than an admin
form. Shared primitives, under `src/features/documents/components/` and
`src/features/documents/hooks/`, purpose-built for this and reused by both
builders:

| Component | Role |
|---|---|
| `BuilderCommandBar` | Sticky top bar: identity, save-status pill, live rolling total, readiness dot, Cancel/Save Draft/Review & Send |
| `DisclosureRow` | The line-item atom — reads as typography at rest (description · qty · unit · × · rate · pre-tax amount), discount/tax/category hidden behind a per-row expand (⌄), with "honesty badges" (`−10%`, `tax 12%`) surfacing any hidden value that affects the total |
| `LineItemsEditor` (in `src/features/line-items/components/` originally, now composed with `DisclosureRow`) | Groups rows by category automatically — no headers unless categories genuinely mix — Enter-to-compose (commit line → spawn next), Backspace-to-delete-empty, document-level Tax/Discount control with "following vs. pinned" semantics (a doc-level default writes through to lines that haven't been manually overridden) |
| `InsertPalette` | Unified ⌘K search over catalog items + saved templates (replaced two separate picker dialogs), ranked Recent → Catalog → Templates, currency-mismatched items shown-but-disabled with the reason inline |
| `ReviewSendOverlay` | The "send moment" — shows the document as the client will read it (pre-tax line amounts, document-level totals block) beside a commit rail, before the irreversible send action fires |
| `useRollingAmount` | Shared hook: tweens a displayed number from its old value to its new one (350ms ease-out) whenever it changes — used for the command-bar total and every row amount, so edits feel computed rather than snapped |

**Key design rule enforced in the row (fixed this session after user
feedback)**: the row amount is always the **pre-tax, post-discount line
subtotal** — tax is a document-level concept that only ever appears in the
Tax/Discount control and the bottom totals block, never baked into a row
figure. Quantity and Unit sit together in the always-visible row (they
describe "how much of what"); Discount/Tax/Category are true per-line
exceptions behind the expand.

Both builders are **draft-only** — a non-draft invoice/quotation redirects
to its (already-redesigned) detail page rather than rendering a read-only
version of the editor.

`src/features/line-items/helpers.ts` → `computeLineItemTotals()` is the
single source of truth for subtotal/discount/tax/total math, used
identically client-side (live builder totals) and to persist the final
numbers server-side.

## UI / design system

Full spec: **`docs/design-system.md`** (read before any visual work). In
short: one accent (cobalt), quiet slate-tinted neutrals, hierarchy from
weight/tone not size, `shadow-2xs` at rest, 150ms motion everywhere,
`tabular-nums` on all money/counts, multi-currency amounts never summed
across currencies.

Three page archetypes in use (a language that emerged over this session,
not yet formally documented beyond this file and code comments):
- **Overview** — list/dashboard pages: toolbar → metrics → content → rail.
- **Record** — detail pages: hero band (headline value + actions) → subject
  (left) + context/history rail (right).
- **Focus** — the document builders: sticky command bar → centered "sheet" →
  progressive disclosure.

Shared primitives: `src/components/ui/*` (shadcn-based: Button, Input,
Select, Dialog, Popover, DropdownMenu, Tabs, …) and
`src/components/shared/*` (PageHeader, DataTable, StatusBadge, EmptyState,
ListEmpty, SearchInput, Pagination, DetailHeader, DetailItem/FieldList, the
form system in `form.tsx`). `useConfirm()` from
`src/providers/confirm-provider.tsx` replaces all native `confirm()` calls.

## Routes (`src/app/`)

```
(auth)/            login, signup, forgot-password, auth/callback
(dashboard)/[workspaceSlug]/
  page.tsx                      dashboard
  leads/  clients/  catalog/    CRM + catalog
  quotations/  invoices/        the document builders + detail pages
  payments/  fulfillment/       payment records; delivery tracking
  reports/  settings/
invite/[token]/                 workspace invite acceptance
portal/{invoices,quotations}/[token]/   client-facing, token-authed, no login
```

## Notable feature: fulfillment

`src/features/fulfillment/` tracks **delivery against what was
purchased** on a per-line-item basis — e.g. a client bought "10 design
revisions" on an invoice line; fulfillment tracks how many have been
delivered so far, independent of payment status. Newer and more stateful
than most features (progress percentages, over-delivery handling,
workflow status beyond simple CRUD).

## Working conventions in this codebase

- Prefer editing files over creating new ones; only add new files for
  genuinely new components/primitives.
- No comments explaining *what* code does — only *why*, for non-obvious
  constraints (see the isolation-rule comments as the pattern to follow).
- Server Actions validate with the matching Zod schema from
  `validators.ts` before touching the database, and return `{ error }`
  strings the UI surfaces via the toast provider — never throw for
  expected/user-facing failures.
- When changing shared visual language, change it in
  `src/components/ui/*` / `src/components/shared/*` / `globals.css` — never
  restyle one page ad hoc (see design-system.md principle 1).
