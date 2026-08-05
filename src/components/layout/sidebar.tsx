"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  UserCheck,
  Files,
  FileText,
  FileSpreadsheet,
  Receipt,
  CreditCard,
  Package,
  Truck,
  ClipboardList,
  PackageCheck,
  BarChart3,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { useState, type CSSProperties } from "react";

// Google's four brand colours. The nav used a continuous spectrum ramp
// before, which meant adjacent items differed by a few degrees of hue and
// the whole rail read as one wash — Quotations rose against Proforma
// orange is not a distinction you can see at 18px. Four widely separated
// colours, cycled, give every neighbour real contrast.
//
// Yellow carries its own foreground: white on #F9AB00 is about 2.3:1,
// well under the 4.5:1 an icon glyph needs to stay readable on the active
// tile. The other three take white.
const NAV_BLUE = "#4285F4";
const NAV_RED = "#EA4335";
const NAV_YELLOW = "#F9AB00";
const NAV_GREEN = "#34A853";

// The glyph colour on the white tile. Normally the item's own hue, which
// reads cleanly on white — except yellow, where #F9AB00 on white is about
// 1.9:1 and effectively invisible at 16px. Yellow draws in a darker amber
// instead; its identity comes from the bloom behind the tile either way.
const NAV_INK: Record<string, string> = {
  [NAV_YELLOW]: "#B26A00",
};

function navColorVar(color: string): CSSProperties {
  return {
    "--nav-color": color,
    "--nav-ink": NAV_INK[color] ?? color,
  } as CSSProperties;
}

type SidebarProps = {
  workspaceSlug: string;
  workspaceName: string;
};

// Construction BOS navigation — "Command Deck" (Concept B): one flat
// sidebar, no mode-switching rail. Projects is promoted to its own group
// at the top since it's the operational spine, but every other module
// stays a normal, always-visible, cross-project list — the ⌘K command
// palette (command-palette.tsx, sharing this same NAV_GROUPS export) is
// the fast-navigation layer instead of a second navigation surface.
export const NAV_GROUPS = [
  {
    label: null,
    items: [{ label: "Dashboard", href: "", icon: LayoutDashboard, color: NAV_BLUE }],
  },
  {
    label: "Projects",
    items: [
      { label: "Projects", href: "/projects", icon: Building2, color: NAV_RED },
      // Every document type in one filterable list — the cross-cutting
      // view the per-type list pages can't give you.
      { label: "Documents", href: "/documents", icon: Files, color: NAV_YELLOW },
    ],
  },
  {
    label: "Sales",
    items: [
      { label: "Clients", href: "/clients", icon: UserCheck, color: NAV_BLUE },
      { label: "Quotations", href: "/quotations", icon: FileText, color: NAV_GREEN },
      { label: "Proforma Invoices", short: "Proforma", href: "/proforma-invoices", icon: FileSpreadsheet, color: NAV_RED },
      { label: "Invoices", href: "/invoices", icon: Receipt, color: NAV_YELLOW },
      { label: "Payments", href: "/payments", icon: CreditCard, color: NAV_GREEN },
    ],
  },
  {
    label: "Procurement",
    items: [
      { label: "Suppliers", href: "/suppliers", icon: Truck, color: NAV_BLUE },
      { label: "Purchase Orders", short: "Purchase", href: "/purchase-orders", icon: ClipboardList, color: NAV_RED },
    ],
  },
  {
    label: "Operations",
    items: [
      // Delivery Orders are the whole delivery story: the documents
      // themselves, and the per-line delivered/remaining tally they roll
      // up to (shown on the invoice they belong to).
      { label: "Delivery Orders", short: "Delivery", href: "/delivery-orders", icon: PackageCheck, color: NAV_GREEN },
    ],
  },
  {
    label: "Catalog",
    items: [{ label: "Items & Materials", short: "Items", href: "/catalog", icon: Package, color: NAV_YELLOW }],
  },
  {
    label: "Insights",
    items: [{ label: "Reports", href: "/reports", icon: BarChart3, color: NAV_BLUE }],
  },
] as const;

export const BOTTOM_ITEMS = [
  { label: "Settings", href: "/settings", icon: Settings, color: NAV_RED },
] as const;

/** What the collapsed rail prints under an icon — the short form when
 *  the name is too long for one line, otherwise the name itself. */
function railLabel(item: { label: string; short?: string }) {
  return item.short ?? item.label;
}

function NavIcon({
  icon: Icon,
  active,
  label,
  collapsed,
  color,
}: {
  icon: LucideIcon;
  active: boolean;
  label: string;
  collapsed: boolean;
  color: string;
}) {
  return (
    <span className="relative isolate flex w-full flex-col items-center gap-1.5">
      {/* The bloom lives on its own blurred layer rather than being a
          box-shadow on the tile. Two reasons: a blurred element can be
          scaled and faded on the compositor, where a shadow has to be
          re-rasterised every frame; and a real bloom spreads past the
          tile's edge, which is what makes the colour feel lit rather
          than merely applied.

          It burns at rest, not only on hover — that is the whole of the
          ClickUp look this is modelled on. The sidebar is a deep ink
          surface in both themes (see globals.css), so a lit tile reads
          the same way whichever theme is on. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-1/2 top-[18px] -z-10 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[16px]",
          "transition-[opacity,transform] duration-300 [transition-timing-function:var(--spring-standard)] motion-reduce:transition-none",
          active
            ? "scale-[1.7] opacity-100"
            : "scale-[1.3] opacity-70 group-hover:scale-[1.5] group-hover:opacity-95"
        )}
        style={{ backgroundColor: color }}
      />
      <span
        className={cn(
          "relative grid h-9 w-9 place-items-center rounded-[11px] transition-[transform,box-shadow,background-color] duration-200 [transition-timing-function:var(--spring-standard)] group-active:scale-90",
          // A bright tile with the glyph in the item's own hue, sitting on
          // the bloom — rather than a coloured tile with a white glyph.
          // At 18px the colour reads far better as a lit halo around a
          // legible mark than as a wash behind one.
          "bg-white text-[var(--nav-ink)]",
          active ? "shadow-[0_2px_10px_-2px_rgba(0,0,0,0.55)]" : "shadow-[0_1px_4px_-1px_rgba(0,0,0,0.4)]"
        )}
      >
        <Icon className="h-[18px] w-[18px]" />
      </span>
      {collapsed && (
        // Single line, always: a wrapped label made every other item a
        // different height and broke the rail's rhythm. Long names get a
        // short form in NAV_GROUPS; the full one stays as the tooltip.
        <span
          className={cn(
            "max-w-[68px] truncate text-center text-[11px] leading-none tracking-tight transition-colors duration-100",
            active
              ? "font-semibold"
              : "font-medium text-sidebar-foreground/75"
          )}
          style={active ? { color: "#fff" } : undefined}
        >
          {label}
        </span>
      )}
    </span>
  );
}

export function Sidebar({ workspaceSlug, workspaceName }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(true);
  const basePath = `/${workspaceSlug}`;

  function isActive(href: string) {
    const fullPath = `${basePath}${href}`;
    if (href === "") return pathname === basePath || pathname === `${basePath}/`;
    return pathname.startsWith(fullPath);
  }

  if (collapsed) {
    return (
      <aside className="flex h-full w-[72px] flex-col items-center border-r bg-sidebar text-sidebar-foreground">
        {/* Workspace badge */}
        <div className="flex h-14 w-full items-center justify-center">
          <Link
            href={basePath}
            className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-sidebar-primary to-indigo-500 text-xs font-bold text-sidebar-primary-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.2)] transition-transform hover:scale-105"
          >
            {workspaceName.charAt(0).toUpperCase()}
          </Link>
        </div>

        {/* Nav items */}
        <nav className="flex flex-1 flex-col items-center gap-0.5 overflow-y-auto px-1 pt-1 pb-2">
          {NAV_GROUPS.map((group, groupIndex) => (
            <div key={group.label ?? "root"} className="flex flex-col items-center w-full">
              {group.label && groupIndex > 0 && (
                <div className="mx-3 my-1.5 w-8 border-t border-sidebar-border" />
              )}
              {group.items.map((item) => (
                <Link
                  key={item.label}
                  href={`${basePath}${item.href}`}
                  className="group flex w-full justify-center py-[9px]"
                  title={item.label}
                  style={navColorVar(item.color)}
                >
                  <NavIcon
                    icon={item.icon}
                    active={isActive(item.href)}
                    label={railLabel(item)}
                    color={item.color}
                    collapsed
                  />
                </Link>
              ))}
            </div>
          ))}
        </nav>

        {/* Bottom items + expand */}
        <div className="flex flex-col items-center gap-0.5 border-t border-sidebar-border px-1 py-2 w-full">
          {BOTTOM_ITEMS.map((item) => (
            <Link
              key={item.label}
              href={`${basePath}${item.href}`}
              className="group flex w-full justify-center py-[9px]"
              title={item.label}
              style={navColorVar(item.color)}
            >
              <NavIcon
                icon={item.icon}
                active={isActive(item.href)}
                label={railLabel(item)}
                color={item.color}
                collapsed
              />
            </Link>
          ))}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(false)}
            className="mt-1 h-7 w-7 text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            aria-label="Expand sidebar"
          >
            <PanelLeftOpen className="h-3.5 w-3.5" />
          </Button>
        </div>
      </aside>
    );
  }

  // Expanded sidebar
  const navItemClass = (href: string) =>
    cn(
      "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all duration-100",
      isActive(href)
        ? "text-sidebar-accent-foreground"
        : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
    );

  // The expanded rail gets the same lit tile as the collapsed one, one
  // size down — keeping the two views on different markup is how they
  // drifted apart before.
  const NavTile = ({
    href,
    color,
    icon: Icon,
  }: {
    href: string;
    color: string;
    icon: LucideIcon;
  }) => {
    const active = isActive(href);
    return (
      <span className="relative isolate grid h-7 w-7 shrink-0 place-items-center">
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute left-1/2 top-1/2 -z-10 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[13px]",
            "transition-[opacity,transform] duration-300 [transition-timing-function:var(--spring-standard)] motion-reduce:transition-none",
            active
              ? "scale-[1.7] opacity-100"
              : "scale-[1.3] opacity-70 group-hover:scale-[1.5] group-hover:opacity-95"
          )}
          style={{ backgroundColor: color }}
        />
        <span
          className={cn(
            "relative grid h-7 w-7 place-items-center rounded-[9px] bg-white text-[var(--nav-ink)] transition-transform duration-200 [transition-timing-function:var(--spring-standard)] group-active:scale-90",
            active
              ? "shadow-[0_2px_8px_-2px_rgba(0,0,0,0.55)]"
              : "shadow-[0_1px_3px_-1px_rgba(0,0,0,0.4)]"
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      </span>
    );
  };

  return (
    <aside className="flex h-full w-60 flex-col border-r bg-sidebar text-sidebar-foreground transition-all duration-200">
      <div className="flex h-14 items-center justify-between px-3">
        <Link
          href={basePath}
          className="-ml-1 flex min-w-0 items-center gap-2.5 rounded-lg py-1 pl-1 pr-2 transition-colors duration-100 hover:bg-sidebar-accent/60"
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-sidebar-primary to-indigo-500 text-[11px] font-bold text-sidebar-primary-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.2)]">
            {workspaceName.charAt(0).toUpperCase()}
          </span>
          <span className="truncate text-sm font-semibold text-sidebar-accent-foreground">
            {workspaceName}
          </span>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(true)}
          className="h-7 w-7 shrink-0 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          aria-label="Collapse sidebar"
        >
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        {NAV_GROUPS.map((group, groupIndex) => (
          <div key={group.label ?? "root"}>
            {group.label ? (
              <div className="px-2.5 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/45">
                {group.label}
              </div>
            ) : (
              groupIndex === 0 && <div className="pt-1" />
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <Link
                  key={item.label}
                  href={`${basePath}${item.href}`}
                  className={navItemClass(item.href)}
                  style={navColorVar(item.color)}
                >
                  <NavTile href={item.href} color={item.color} icon={item.icon} />
                  <span className="truncate">{item.label}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-2">
        {BOTTOM_ITEMS.map((item) => (
          <Link
            key={item.label}
            href={`${basePath}${item.href}`}
            className={navItemClass(item.href)}
            style={navColorVar(item.color)}
          >
            <NavTile href={item.href} color={item.color} icon={item.icon} />
            <span className="truncate">{item.label}</span>
          </Link>
        ))}
      </div>
    </aside>
  );
}
