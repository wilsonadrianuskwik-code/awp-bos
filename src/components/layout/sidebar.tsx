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
import { useState } from "react";

type SidebarProps = {
  workspaceSlug: string;
  workspaceName: string;
};

export const NAV_GROUPS = [
  {
    label: null,
    items: [{ label: "Dashboard", href: "", icon: LayoutDashboard }],
  },
  {
    label: "CRM",
    items: [
      { label: "Leads", href: "/leads", icon: Users },
      { label: "Clients", href: "/clients", icon: UserCheck },
    ],
  },
  {
    label: "Sales",
    items: [
      { label: "Catalog", href: "/catalog", icon: Package },
      { label: "Quotations", href: "/quotations", icon: FileText },
      { label: "Invoices", href: "/invoices", icon: Receipt },
      { label: "Payments", href: "/payments", icon: CreditCard },
    ],
  },
  {
    label: "Operations",
    items: [{ label: "Fulfillment", href: "/fulfillment", icon: PackageCheck }],
  },
  {
    label: "Insights",
    items: [{ label: "Reports", href: "/reports", icon: BarChart3 }],
  },
] as const;

export const BOTTOM_ITEMS = [
  { label: "Settings", href: "/settings", icon: Settings },
] as const;

function NavIcon({
  icon: Icon,
  active,
  label,
  collapsed,
}: {
  icon: LucideIcon;
  active: boolean;
  label: string;
  collapsed: boolean;
}) {
  return (
    <span className="relative flex flex-col items-center gap-0.5">
      <span
        className={cn(
          "grid h-8 w-8 place-items-center rounded-lg transition-all duration-150",
          active
            ? "bg-sidebar-primary/20 text-sidebar-primary-foreground shadow-[0_0_12px_3px_rgba(255,255,255,0.12)]"
            : "text-sidebar-foreground/70 group-hover:bg-sidebar-accent group-hover:text-sidebar-accent-foreground"
        )}
      >
        <Icon className="h-[18px] w-[18px]" />
      </span>
      {collapsed && (
        <span
          className={cn(
            "text-[10px] leading-tight transition-colors duration-100",
            active ? "text-sidebar-accent-foreground font-medium" : "text-sidebar-foreground/60"
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
                >
                  <NavIcon
                    icon={item.icon}
                    active={isActive(item.href)}
                    label={item.label}
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
            >
              <NavIcon
                icon={item.icon}
                active={isActive(item.href)}
                label={item.label}
                collapsed
              />
            </Link>
          ))}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(false)}
            className="mt-1 h-7 w-7 text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
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
        ? "bg-sidebar-primary/15 text-sidebar-accent-foreground shadow-[0_0_10px_2px_rgba(255,255,255,0.06)]"
        : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
    );

  const navIconClass = (href: string) =>
    cn(
      "grid h-7 w-7 shrink-0 place-items-center rounded-md transition-all duration-100",
      isActive(href)
        ? "bg-sidebar-primary/20 text-sidebar-primary-foreground shadow-[0_0_8px_2px_rgba(255,255,255,0.08)]"
        : "text-sidebar-foreground/70 group-hover:text-sidebar-accent-foreground"
    );

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
                >
                  <span className={navIconClass(item.href)}>
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
          >
            <span className={navIconClass(item.href)}>
              <item.icon className="h-4 w-4" />
            </span>
            <span className="truncate">{item.label}</span>
          </Link>
        ))}
      </div>
    </aside>
  );
}
