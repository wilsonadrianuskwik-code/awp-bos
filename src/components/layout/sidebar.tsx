"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  UserCheck,
  FileText,
  Receipt,
  CreditCard,
  Package,
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

export const NAV_GROUPS = [
  {
    label: null,
    items: [{ label: "Dashboard", href: "", icon: LayoutDashboard, color: "#6366f1" }],
  },
  {
    label: "CRM",
    items: [
      { label: "Leads", href: "/leads", icon: Users, color: "#a855f7" },
      { label: "Clients", href: "/clients", icon: UserCheck, color: "#ec4899" },
    ],
  },
  {
    label: "Sales",
    items: [
      { label: "Catalog", href: "/catalog", icon: Package, color: "#f59e0b" },
      { label: "Quotations", href: "/quotations", icon: FileText, color: "#06b6d4" },
      { label: "Invoices", href: "/invoices", icon: Receipt, color: "#10b981" },
      { label: "Payments", href: "/payments", icon: CreditCard, color: "#14b8a6" },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Fulfillment", href: "/fulfillment", icon: PackageCheck, color: "#f97316" },
    ],
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
      <span
        className={cn(
          "grid h-8 w-8 place-items-center rounded-lg transition-all duration-150",
          !active &&
            "text-sidebar-foreground/70 group-hover:text-[var(--nav-color)] group-hover:bg-[color-mix(in_srgb,var(--nav-color)_16%,transparent)] group-hover:shadow-[0_0_0_1px_color-mix(in_srgb,var(--nav-color)_28%,transparent),0_0_10px_2px_color-mix(in_srgb,var(--nav-color)_38%,transparent)]"
        )}
        style={
          active
            ? {
                backgroundColor: `${color}2e`,
                color,
                boxShadow: `0 0 0 1px ${color}40, 0 0 14px 2px ${color}66, 0 0 28px 8px ${color}33`,
              }
            : undefined
        }
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
      "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-all duration-100",
      isActive(href)
        ? "text-sidebar-accent-foreground"
        : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
    );

  const navIconClass = (href: string) =>
    cn(
      "grid h-7 w-7 shrink-0 place-items-center rounded-md transition-all duration-100",
      !isActive(href) &&
        "text-sidebar-foreground/70 group-hover:text-[var(--nav-color)] group-hover:bg-[color-mix(in_srgb,var(--nav-color)_16%,transparent)] group-hover:shadow-[0_0_0_1px_color-mix(in_srgb,var(--nav-color)_28%,transparent),0_0_10px_2px_color-mix(in_srgb,var(--nav-color)_38%,transparent)]"
    );

  const navIconStyle = (href: string, color: string): CSSProperties | undefined =>
    isActive(href)
      ? {
          backgroundColor: `${color}2e`,
          color,
          boxShadow: `0 0 0 1px ${color}40, 0 0 14px 2px ${color}66, 0 0 28px 8px ${color}33`,
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
