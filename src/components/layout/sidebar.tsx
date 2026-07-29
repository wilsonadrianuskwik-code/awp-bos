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

function navColorVar(color: string): CSSProperties {
  return { "--nav-color": color } as CSSProperties;
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
    items: [{ label: "Dashboard", href: "", icon: LayoutDashboard, color: "#6366f1" }],
  },
  {
    label: "Projects",
    items: [
      { label: "Projects", href: "/projects", icon: Building2, color: "#a855f7" },
      // Every document type in one filterable list — the cross-cutting
      // view the per-type list pages can't give you.
      { label: "Documents", href: "/documents", icon: Files, color: "#d946ef" },
    ],
  },
  {
    label: "Sales",
    items: [
      { label: "Clients", href: "/clients", icon: UserCheck, color: "#ec4899" },
      { label: "Quotations", href: "/quotations", icon: FileText, color: "#f43f5e" },
      { label: "Proforma Invoices", short: "Proforma", href: "/proforma-invoices", icon: FileSpreadsheet, color: "#fb923c" },
      { label: "Invoices", href: "/invoices", icon: Receipt, color: "#f59e0b" },
      { label: "Payments", href: "/payments", icon: CreditCard, color: "#eab308" },
    ],
  },
  {
    label: "Procurement",
    items: [
      { label: "Suppliers", href: "/suppliers", icon: Truck, color: "#84cc16" },
      { label: "Purchase Orders", short: "Purchase", href: "/purchase-orders", icon: ClipboardList, color: "#22c55e" },
    ],
  },
  {
    label: "Operations",
    items: [
      // Delivery Orders are the whole delivery story: the documents
      // themselves, and the per-line delivered/remaining tally they roll
      // up to (shown on the invoice they belong to).
      { label: "Delivery Orders", short: "Delivery", href: "/delivery-orders", icon: PackageCheck, color: "#10b981" },
    ],
  },
  {
    label: "Catalog",
    items: [{ label: "Items & Materials", short: "Items", href: "/catalog", icon: Package, color: "#14b8a6" }],
  },
  {
    label: "Insights",
    items: [{ label: "Reports", href: "/reports", icon: BarChart3, color: "#06b6d4" }],
  },
] as const;

export const BOTTOM_ITEMS = [
  { label: "Settings", href: "/settings", icon: Settings, color: "#38bdf8" },
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
      {/* The backlight lives on its own blurred layer rather than being a
          box-shadow on the tile. Two reasons: a blurred element can be
          scaled and faded on the compositor, where a shadow has to be
          re-rasterised every frame; and a real bloom spreads past the
          tile's edge, which is what makes the colour feel lit rather
          than merely applied. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-1/2 top-4 -z-10 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[11px]",
          "transition-[opacity,transform] duration-300 [transition-timing-function:var(--spring-standard)] motion-reduce:transition-none",
          active
            ? "scale-[1.45] opacity-100"
            : "scale-75 opacity-0 group-hover:scale-125 group-hover:opacity-80"
        )}
        style={{ backgroundColor: color }}
      />
      <span
        className={cn(
          "relative grid h-8 w-8 place-items-center rounded-lg transition-[transform,color,background-color,box-shadow] duration-200 [transition-timing-function:var(--spring-standard)] group-active:scale-90",
          !active &&
            "text-sidebar-foreground/75 group-hover:text-[var(--nav-color)] group-hover:bg-[color-mix(in_srgb,var(--nav-color)_22%,transparent)]"
        )}
        style={
          active
            ? {
                // Saturated fill on the active tile, in the item's own
                // hue — each module reads as its own place rather than
                // as one row highlighted in a single house colour.
                backgroundColor: color,
                color: "#fff",
                boxShadow: `inset 0 1px 0 0 rgba(255,255,255,0.28)`,
              }
            : undefined
        }
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
          style={active ? { color } : undefined}
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
                  className="group flex w-full justify-center py-1"
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
              className="group flex w-full justify-center py-1"
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
      "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-all duration-100",
      isActive(href)
        ? "text-sidebar-accent-foreground"
        : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
    );

  const navIconClass = (href: string) =>
    cn(
      "grid h-7 w-7 shrink-0 place-items-center rounded-md transition-[transform,color,background-color] duration-200 [transition-timing-function:var(--spring-standard)] group-active:scale-90",
      !isActive(href) &&
        "text-sidebar-foreground/75 group-hover:text-[var(--nav-color)] group-hover:bg-[color-mix(in_srgb,var(--nav-color)_22%,transparent)]"
    );

  const navIconStyle = (href: string, color: string): CSSProperties | undefined =>
    isActive(href)
      ? {
          backgroundColor: color,
          color: "#fff",
          boxShadow: `inset 0 1px 0 0 rgba(255,255,255,0.28), 0 0 18px 0 ${color}80`,
        }
      : undefined;

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
                  <span
                    className={navIconClass(item.href)}
                    style={navIconStyle(item.href, item.color)}
                  >
                    <item.icon className="h-4 w-4" />
                  </span>
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
            <span
              className={navIconClass(item.href)}
              style={navIconStyle(item.href, item.color)}
            >
              <item.icon className="h-4 w-4" />
            </span>
            <span className="truncate">{item.label}</span>
          </Link>
        ))}
      </div>
    </aside>
  );
}
