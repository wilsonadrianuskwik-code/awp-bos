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
      { label: "Projects", href: "/projects", icon: Building2, color: "#6366f1" },
      // Every document type in one filterable list — the cross-cutting
      // view the per-type list pages can't give you.
      { label: "Documents", href: "/documents", icon: Files, color: "#8b5cf6" },
    ],
  },
  {
    label: "Sales",
    items: [
      { label: "Clients", href: "/clients", icon: UserCheck, color: "#ec4899" },
      { label: "Quotations", href: "/quotations", icon: FileText, color: "#06b6d4" },
      { label: "Proforma Invoices", href: "/proforma-invoices", icon: FileSpreadsheet, color: "#0ea5e9" },
      { label: "Invoices", href: "/invoices", icon: Receipt, color: "#10b981" },
      { label: "Payments", href: "/payments", icon: CreditCard, color: "#14b8a6" },
    ],
  },
  {
    label: "Procurement",
    items: [
      { label: "Suppliers", href: "/suppliers", icon: Truck, color: "#eab308" },
      { label: "Purchase Orders", href: "/purchase-orders", icon: ClipboardList, color: "#f59e0b" },
    ],
  },
  {
    label: "Operations",
    items: [
      // Delivery Orders are the whole delivery story: the documents
      // themselves, and the per-line delivered/remaining tally they roll
      // up to (shown on the invoice they belong to).
      { label: "Delivery Orders", href: "/delivery-orders", icon: PackageCheck, color: "#f97316" },
    ],
  },
  {
    label: "Catalog",
    items: [{ label: "Items & Materials", href: "/catalog", icon: Package, color: "#84cc16" }],
  },
  {
    label: "Insights",
    items: [{ label: "Reports", href: "/reports", icon: BarChart3, color: "#f43f5e" }],
  },
] as const;

export const BOTTOM_ITEMS = [
  { label: "Settings", href: "/settings", icon: Settings, color: "#64748b" },
] as const;

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
    <span className="relative flex flex-col items-center gap-0.5">
      {/* On a light rail the old glow read as smudge. Active is now a
          solid accent tile; per-item colour is kept only as a hover
          tint, which is enough to keep the modules distinguishable. */}
      <span
        className={cn(
          "grid h-10 w-10 place-items-center rounded-xl transition-all duration-150",
          active
            ? "bg-primary text-primary-foreground shadow-[0_6px_16px_-6px_hsl(var(--primary)/0.7)]"
            : "text-sidebar-foreground group-hover:text-[var(--nav-color)] group-hover:bg-[color-mix(in_srgb,var(--nav-color)_12%,transparent)]"
        )}
      >
        <Icon className="h-[18px] w-[18px]" />
      </span>
      {collapsed && (
        <span
          className={cn(
            "text-[10px] leading-tight transition-colors duration-100",
            active ? "font-medium text-sidebar-accent-foreground" : "text-sidebar-foreground/60"
          )}
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
      <aside className="flex h-full w-[76px] flex-col items-center bg-sidebar text-sidebar-foreground">
        {/* Workspace badge */}
        <div className="flex h-16 w-full items-center justify-center">
          <Link
            href={basePath}
            className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-[0_8px_20px_-8px_hsl(var(--primary)/0.8)] transition-transform hover:scale-105"
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
                    label={item.label}
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
                label={item.label}
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
      "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-100",
      isActive(href)
        ? // The active item is carried by an accent bar at the rail's
          // edge plus a blue label — the reference's signature move, and
          // quieter than filling the whole row.
          "text-sidebar-accent-foreground before:absolute before:-left-2 before:top-1/2 before:h-6 before:w-1 before:-translate-y-1/2 before:rounded-r-full before:bg-primary"
        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    );

  const navIconClass = (href: string) =>
    cn(
      "grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-all duration-100",
      isActive(href)
        ? "text-primary"
        : "text-sidebar-foreground group-hover:text-[var(--nav-color)]"
    );

  // Per-item colour survives only as the hover tint (--nav-color); the
  // active state is the accent bar, so it needs no inline style.
  const navIconStyle = (): CSSProperties | undefined => undefined;

  return (
    <aside className="flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground transition-all duration-200">
      <div className="flex h-16 items-center justify-between px-4">
        <Link
          href={basePath}
          className="-ml-1 flex min-w-0 items-center gap-2.5 rounded-lg py-1 pl-1 pr-2 transition-colors duration-100 hover:bg-sidebar-accent/60"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-xs font-bold text-primary-foreground shadow-[0_8px_20px_-8px_hsl(var(--primary)/0.8)]">
            {workspaceName.charAt(0).toUpperCase()}
          </span>
          <span className="truncate text-[15px] font-semibold text-foreground">
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

      <nav className="flex-1 overflow-y-auto px-4 pb-2">
        {NAV_GROUPS.map((group, groupIndex) => (
          <div key={group.label ?? "root"}>
            {group.label ? (
              <div className="px-3 pb-1.5 pt-5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">
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
                    style={navIconStyle()}
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

      <div className="border-t border-sidebar-border p-4">
        {BOTTOM_ITEMS.map((item) => (
          <Link
            key={item.label}
            href={`${basePath}${item.href}`}
            className={navItemClass(item.href)}
            style={navColorVar(item.color)}
          >
            <span
              className={navIconClass(item.href)}
              style={navIconStyle()}
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
