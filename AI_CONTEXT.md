# AI_CONTEXT.md — orientation for a new Claude session

This file exists so a fresh session can become productive on this codebase
in minutes instead of hours. Read this first; it links to the deeper docs
(`docs/design-system.md`) rather than duplicating them.

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
