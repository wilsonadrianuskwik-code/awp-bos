# Customer Portal 2.0 — Architecture Proposal

Status: **proposal for review — not yet approved, no implementation started.**

## 1. Context — where Portal 1.0 stands

Today the "portal" is a set of **per-document capability URLs**:

- Each quotation/invoice carries a random `share_token`. The URL
  `/portal/quotations/{token}` (or `/invoices/{token}`) *is* the access
  control — possession of the unguessable link grants access. There is no
  customer login and no customer identity.
- Reads go through `createAdminClient()` (Supabase **service role**), which
  bypasses RLS to fetch exactly one document by its token. There are no
  customer-facing RLS policies.
- Customer write actions (approve / reject / request-revision / record-view)
  are `SECURITY DEFINER` RPCs keyed by `p_share_token`.
- Consequence: a customer with five invoices and three quotations receives
  **eight unrelated links**. There is no "their account", no history, no
  cross-document view.

**What's already in our favor for 2.0:**

- `clients` already has `email` and `billing_email` — a natural customer
  identity.
- `fulfillment_items` carries `client_id` **directly**; `payments` reach a
  client via `invoice_id → invoices.client_id`; quotations/invoices carry
  `client_id`. Everything is `workspace_id`-scoped and soft-deleted.
- Migration `00014_extend_activity_audit_for_customer_actions` already models
  a **customer** actor type in the `activities`/`audit_logs` tables, so the
  audit trail for portal actions is already designed for.
- The block renderer already produces branded, printable document HTML/PDF —
  reusable verbatim for portal viewing and downloads.

## 2. Vision & principles

Portal 2.0 turns per-document links into a **per-client, authenticated
workspace** — one place where a customer signs in and sees everything the
vendor has shared with them: quotations to act on, invoices and payment
status, service fulfillment progress, downloadable documents, and their
complete history.

Principles:

1. **Identity, not just possession.** Access is tied to a verified customer
   **email**, not only to holding a URL. This is what makes a durable
   "workspace" (and a revocable one) possible.
2. **Real row-level security, not service-role bypass.** Customers get
   proper RLS SELECT policies scoped to their own records — the same
   security discipline the staff app uses, instead of a service-role escape
   hatch.
3. **Workspace-scoped.** The portal is per-vendor: `/portal/{workspaceSlug}`.
   A customer signs into *this vendor's* portal and sees *this vendor's*
   history with them. (Cross-vendor unification is deliberately out of scope
   — see §9.)
4. **Read-mostly, with a few safe writes.** The only customer mutations are
   the ones that already exist as a business concept: approve/reject/request-
   revision on a quotation, and recording a view. Everything else is
   read-only.
5. **Reuse the frozen design system and the renderer.** The portal is its own
   vendor-branded shell but is built from the same tokens, primitives, and
   document renderer.
6. **Backward compatible.** The existing per-document `share_token` links keep
   working for quick one-off shares; the authenticated workspace is additive.

## 3. Access & identity model (the pivotal decision)

**Recommendation: passwordless email one-time-code (OTP) via Supabase Auth,
producing a short-lived portal session scoped to the client's email.**

Flow: customer enters their email → Supabase sends a 6-digit code / magic
link → on verify, they get a Supabase session whose JWT carries their
`email` claim. We map that email to the `clients` row(s) that own it and
gate all data on that mapping.

Why this model:

- **No passwords** to manage for customers (matches Stripe/Xero/Zoho client
  portals). Low friction, high security (email possession + expiring,
  single-use codes, built-in rate limiting).
- **Reuses the platform's auth** (Supabase Auth) rather than inventing a
  bespoke session/token table, so we inherit CSRF-safe httpOnly cookies,
  refresh handling, and SSR integration we already use for staff.
- **Gives real RLS.** A verified email → a `get_portal_client_ids()` helper →
  customer SELECT policies. The service-role bypass goes away for the
  authenticated experience.

Alternatives considered:

- **Per-client capability link (one long-lived token per client).** Lower
  friction (no code entry) but a single forever-URL that exposes a client's
  entire financial history is a serious liability if forwarded or leaked, and
  it can't be re-verified. Rejected as the primary model; may be offered as
  an opt-in "quick access" link with short expiry.
- **Full customer passwords / accounts.** Heaviest; unnecessary for this
  audience. Rejected.

**Staff-app isolation is automatic:** a customer's `auth.users` row has **no
`workspace_members` row**, so every staff-side RLS policy
(`get_user_workspace_ids()` / `get_user_role()`) and `withWorkspace()` check
returns nothing/So the dashboard is inaccessible to customers even though
both use the same Supabase Auth project.

## 4. UX flows

### 4.1 Entry & sign-in
1. Customer receives a transactional email (quote sent / invoice issued) with
   a link to `/portal/{workspaceSlug}`.
2. Portal landing shows the vendor's branding (name, logo, tagline) and a
   single email field: "Sign in to {Vendor}".
3. Enter email → OTP screen → verified → portal dashboard. Non-enumerating
   copy ("If you're a customer of {Vendor}, we've sent you a code").

### 4.2 Portal dashboard (home)
An at-a-glance summary, then navigation:
- **Action needed**: quotations awaiting approval (primary CTA).
- **Outstanding balance**: total amount due across open invoices (per
  currency, never summed across currencies — matches the app's rule).
- **Active fulfillment**: count/progress of in-flight service delivery.
- **Recent activity**: last few events (quote approved, payment received,
  delivery recorded).
- Left nav: Overview · Quotations · Invoices · Payments · Fulfillment ·
  Documents · History · Profile.

### 4.3 Quotations
- List (status, total, valid-until, action-needed first).
- Detail: full rendered document + **Approve / Reject / Request revision**
  (reusing today's actions, re-authorized by session identity) + **Download
  PDF**.

### 4.4 Invoices & payments
- Invoice list (status incl. Overdue, amount due, due date).
- Invoice detail: rendered document, **payment status + history**, **Download
  PDF**. (Online payment is a future hook — §9.)
- Payments: a ledger of all payments received, linked to their invoices.

### 4.5 Fulfillment / project progress
- Per purchased item: Purchased / Delivered / Remaining / Progress %, plus the
  delivery-event history. Read-only — mirrors the staff fulfillment view.

### 4.6 Documents & history
- **Documents**: one place to download every shared quotation & invoice PDF.
- **History**: a unified, chronological timeline of everything (quote sent →
  viewed → approved → invoice issued → payment received → delivery recorded),
  sourced from the existing `activities` feed filtered to the client.

## 5. Data model impact

Additive only — no changes to existing staff tables/columns beyond one flag.

### 5.1 Columns
- `clients.portal_enabled BOOLEAN NOT NULL DEFAULT true` — vendor's switch to
  grant/revoke portal access per client.
- `clients.portal_last_login_at TIMESTAMPTZ` (nullable) — surfaced staff-side
  as engagement signal.

### 5.2 New security helper (SECURITY DEFINER, STABLE)
```
get_portal_client_ids() RETURNS SETOF UUID
  -- client ids whose lower(email) = lower(auth.jwt()->>'email')
  -- AND portal_enabled AND deleted_at IS NULL
```
The customer analogue of `get_user_workspace_ids()`. The app layer additionally
narrows to the workspace in the URL; this helper is the security floor.

### 5.3 New customer RLS SELECT policies (additive; permissive/OR-ed, so they
never affect the existing staff policies)
- `quotations`: `client_id IN (get_portal_client_ids()) AND status <> 'draft' AND deleted_at IS NULL`
- `invoices`: `client_id IN (get_portal_client_ids()) AND status <> 'draft' AND deleted_at IS NULL`
- `payments`: visible when their `invoice_id` belongs to a visible invoice
- `fulfillment_items`: `client_id IN (get_portal_client_ids()) AND deleted_at IS NULL`
- `fulfillment_events`: visible when their `fulfillment_item_id` belongs to a
  visible fulfillment item
- `line_items`: visible when the parent (`entity_type`+`entity_id`) is a
  visible quotation or invoice
- `activities`: customer-readable subset scoped to their client's entities

Drafts and soft-deleted rows are never exposed.

### 5.4 Vendor branding WITHOUT exposing the workspace row
Customers must NOT get RLS on `workspaces` — that row's `settings` JSONB holds
sensitive config (bank details, internal data). Instead, a
`get_portal_workspace_branding(p_workspace_id)` `SECURITY DEFINER` function
returns only the safe, public subset (name, logo, tagline, and the payment
info that's *meant* to appear on documents), after verifying the caller is a
portal client of that workspace.

### 5.5 Customer write RPCs (evolve existing)
Keep approve/reject/request-revision/record-view as `SECURITY DEFINER` RPCs,
but add identity-authorized variants keyed by document id that verify
`auth.jwt() email` owns the document's client (rather than only a
`share_token`). The legacy token-keyed variants remain for the standalone-link
flow.

### 5.6 Optional
- `portal_magic_links` table — only if we choose our own OTP over Supabase's
  built-in OTP. Recommendation: use Supabase OTP, so this table is **not**
  needed.

## 6. Security model

Threats and controls:

| Threat | Control |
|---|---|
| Email enumeration | Supabase OTP rate-limits; non-enumerating UI copy; only portal-enabled clients receive a working code |
| Link/OTP theft | OTP is single-use + short-lived; session cookie is httpOnly/secure; sessions expire and refresh |
| Over-exposure of records | Strict RLS scoped to `get_portal_client_ids()`; drafts + soft-deletes hidden; policies additive so staff scope is untouched |
| Cross-tenant leakage | A client of workspace A has different `client_id`s and email mapping than B; RLS + URL-workspace narrowing isolate them |
| Workspace settings leak | Customers get **no** `workspaces` RLS; branding via a whitelisted `SECURITY DEFINER` function only |
| Staff app access by a customer | Customer `auth.users` has no `workspace_members` row → all staff RLS + `withWorkspace()` deny |
| Stale/removed access | `clients.portal_enabled = false`, or client soft-delete, immediately revokes via the helper |
| Repudiation | Every portal login + action logged to `activities`/`audit_logs` with `actor_type = 'customer'` (already modeled in `00014`) |

## 7. Application architecture

- **Routing**: `/portal/{workspaceSlug}` (login) and
  `/portal/{workspaceSlug}/(app)/…` (dashboard, quotations, invoices,
  payments, fulfillment, documents, history, profile). Legacy
  `/portal/quotations/{token}` & `/portal/invoices/{token}` remain.
- **Session**: Supabase SSR auth client (separate from the staff client but
  same project); a portal middleware/guard redirects unauthenticated visitors
  to the workspace's portal login and, once authed, resolves the caller's
  client for that workspace.
- **Data access**: server components read directly under the **customer's own
  session** (RLS-enforced) — the service-role admin client is used only by the
  legacy token routes, not by the authenticated portal.
- **Feature module**: a new `src/features/portal/` (queries, actions,
  components) that composes existing domain types and the renderer; it does
  not duplicate staff queries but reads through the customer-scoped policies.
- **Reuse**: the document renderer (view + PDF), design-system primitives
  (`StatusBadge`, tables, `DetailItem`/`FieldList`, `EmptyState`, toasts,
  `useConfirm`), and the existing portal views as the seeds of the detail
  pages. The portal shell is its own vendor-branded layout.

## 8. Implementation milestones

Sequenced by risk (security foundation first), matching our usual
milestone-by-risk style.

- **M1 — Identity & security foundation (highest risk).**
  `clients.portal_enabled`/`portal_last_login_at`; Supabase email-OTP portal
  auth; `get_portal_client_ids()`; the customer RLS SELECT policies (§5.3);
  `get_portal_workspace_branding()`; portal session guard. Ships with an
  explicit RLS test matrix before any UI.
- **M2 — Portal shell & dashboard (read-only).** Workspace-scoped routes,
  branded login + OTP, portal layout, and the Overview dashboard.
- **M3 — Quotations workspace.** List + detail + Approve/Reject/Request-
  revision re-authorized by session identity; PDF download.
- **M4 — Invoices & payments.** Invoice list + detail with payment status &
  history; payments ledger; downloads.
- **M5 — Fulfillment & progress.** Per-item progress + delivery history
  (read-only).
- **M6 — Documents & history.** Document center (all downloadable docs) +
  unified activity timeline + profile.
- **M7 — Notifications.** Transactional emails: OTP/magic-link, plus
  status-change nudges (quote sent, invoice due/overdue). Depends on an email
  provider decision (§10).
- **M8 — Verification & hardening.** Full RLS/isolation test matrix
  (customer-of-A cannot read B; drafts hidden; revoked client loses access),
  end-to-end flow verification, production build.

## 9. Out of scope (candidly flagged)

- **Online payments** (Stripe/Razorpay "Pay now"). High-value but a large
  integration with its own reconciliation and webhook surface — its own phase.
  Portal 2.0 leaves a clean hook (the invoice detail page) for it.
- **Cross-vendor unified customer identity** (one login across every vendor
  using our product). Interesting network-effect play, but a different
  security and product model; 2.0 stays per-vendor.
- **Multiple contacts per client / client teams**, client file uploads, and
  in-portal messaging — future.

## 10. Decisions needed before implementation

1. **Auth model** — confirm passwordless email OTP (recommended) vs. keeping
   capability-link-only.
2. **Identity email** — match `clients.email` only, or also `billing_email`?
   (Affects who can sign in.)
3. **Portal scope** — per-vendor-workspace portal (recommended) — confirmed?
4. **Online payments** — defer to a later phase (recommended) or in scope now?
5. **Email provider** — magic-link + notifications need transactional email.
   Is Supabase's built-in SMTP acceptable for the pilot, or do we wire a
   provider (Resend/Postmark) now? (Gates M7.)
6. **Legacy share links** — keep the per-document token links alongside the
   authenticated portal (recommended) — confirmed?
