# Meridian — the BOS design system

The product-wide design language. Every module renders through the shared
primitives in `src/components/ui/*` and patterns in `src/components/shared/*`,
so this system **is** the product's look: change it here, and every module
changes together. Never restyle a single page ad hoc — extend the system.

## Principles

1. **Density is respect.** This is a tool people operate all day. Controls
   are 36px (32px small), table rows ~40px, body UI text 14px, table/menus
   13px. Whitespace is spent between sections, not inside controls.
2. **One accent.** Cobalt (`--primary`) carries all primary actions, active
   nav, and focus. Everything else is a slate-tinted neutral. Semantic
   status colors (green/amber/red/blue/violet) belong only to state, never
   to decoration.
3. **Hierarchy through weight and tone, not size.** Page titles are 20px
   semibold — orientation, not headline. Below that: 15px card titles,
   13px labels, 11px uppercase micro-labels. Muted foreground does the
   separating work; big-font-bold is a smell.
4. **Surfaces are quiet.** Faint gray canvas, white cards, hairline borders,
   `shadow-2xs` at rest. Elevation grows only with actual layering:
   popovers `shadow-lg`, dialogs `shadow-xl`.
5. **Motion is fast and forgettable.** 150ms ease-out for everything
   interactive; dialogs fade+scale from 98%, menus slide 4px. Nothing
   bounces. `prefers-reduced-motion` disables all of it (globals.css).
6. **Numbers are data.** Money, quantities, and IDs render `tabular-nums`
   so columns align. Multi-currency amounts are never summed across
   currencies — each currency renders separately.

## Tokens (`src/app/globals.css`)

| Token | Role |
|---|---|
| `--background` | App canvas — faint slate-tinted gray (light) / blue-black (dark) |
| `--card` | Raised surface: cards, inputs, tables, dialogs |
| `--primary` | Cobalt accent — buttons, active nav, focus rings, links |
| `--muted` / `--muted-foreground` | Quiet fills and secondary text |
| `--border` / `--input` | Hairlines; `--input` is slightly darker for control edges |
| `--sidebar-*` | Sidebar surface, one step off-canvas |
| `--radius` | 10px cards (`rounded-lg`), 8px controls (`rounded-md`), 6px menu items |

All neutrals sit at hue 220–224 with low saturation — never pure gray.

## Type scale

| Style | Usage |
|---|---|
| `text-xl font-semibold tracking-tight` | Page titles (PageHeader) and entity names on detail pages |
| `text-2xl font-semibold tracking-tight tabular-nums` | Featured numbers (stat values, balances) |
| `text-[15px] font-semibold` | Card titles (CardTitle default) |
| `text-sm` (14px) | Body UI, forms, dialogs |
| `text-[13px]` | Tables, menus, nav items, labels, secondary content |
| `text-[11px] font-medium uppercase tracking-wider text-muted-foreground` | Micro-labels: table headers, nav group labels |

Font: Geist Sans (already wired via `--font-geist-sans`).

## Components

- **Button** — primary = cobalt fill; `outline` = card bg + hairline +
  `shadow-2xs`; heights 36/32/40; focus = 2px accent ring, 1px offset.
- **Inputs** (Input/Textarea/Select) — 36px, card background, `shadow-2xs`,
  focus = accent border + soft 2px glow (`ring-ring/25`), no ring offset.
- **Card** — `rounded-lg border shadow-2xs`; CardTitle is 15px semibold.
- **Dialog** — centered fade+scale-98, 150ms, `bg-black/40` blurred overlay,
  `rounded-xl shadow-xl`, 16px title.
- **Dropdown/Popover/SelectContent** — `rounded-lg shadow-lg`, 13px items,
  6px item radius, muted icons, 150ms.
- **Tabs** — 36px segmented control, 13px medium triggers, active = card
  bg + `shadow-2xs`.
- **Badge** — soft tints (`bg-primary/10 text-primary`), never solid fills.

## Patterns (`src/components/shared/*`)

- **PageHeader** — title + optional description + right-aligned actions.
  Every page uses it; no inline `<h1>`s.
- **DataTable** — card-wrapped, `bg-muted/40` header band, 11px uppercase
  column labels, 13px cells (`px-3 py-2.5`), hairline row separators,
  `hover:bg-muted/40`, whole-row click affordance.
- **StatusBadge** — THE status system. Six semantic tones (neutral, info,
  attention, success, danger, special), each a soft tint + hairline ring +
  leading dot. Every lifecycle state maps to a tone in `STATUS_TONE`;
  add new statuses there, never as one-off colors.
- **EmptyState** — soft icon container + one-line explanation + the
  creating action. Empty states onboard, they don't apologize.

## App shell

- **Sidebar** (240px / 56px collapsed) — grouped nav: CRM, Sales,
  Operations, Insights, with 11px group labels; active item =
  `bg-primary/10 text-primary`; workspace mark = 24px cobalt initial tile.
  The nav model (`NAV_GROUPS`) is exported and shared with the palette.
- **Header** — 56px: mobile menu, ⌘K search trigger (bordered, with kbd
  hint), theme toggle, avatar menu.
- **Command palette** — ⌘K/Ctrl+K anywhere; searches nav destinations +
  quick-create actions; arrow keys + Enter; Esc closes.
- **Content** — max-width 1400px, centered; `p-4 md:p-6` gutters.

## Voice

Controls say what they do ("Record Payment", not "Submit"). Empty states
say what the space is for and how to fill it. Errors say what went wrong
and what to do next. No jargon the user didn't type first.
