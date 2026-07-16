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
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { useState } from "react";

type SidebarProps = {
  workspaceSlug: string;
  workspaceName: string;
};

// The navigation model, grouped by job-to-be-done rather than a flat
// list: users think "I'm doing sales work" / "I'm checking delivery",
// and the group labels teach the product's shape. Shared with the
// command palette so ⌘K search matches the sidebar exactly.
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

export function Sidebar({ workspaceSlug, workspaceName }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const basePath = `/${workspaceSlug}`;

  function isActive(href: string) {
    const fullPath = `${basePath}${href}`;
    if (href === "") return pathname === basePath || pathname === `${basePath}/`;
    return pathname.startsWith(fullPath);
  }

  const navItemClass = (href: string) =>
    cn(
      "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-100",
      collapsed && "justify-center px-0 py-2",
      isActive(href)
        ? "bg-primary/10 text-primary"
        : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    );

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r bg-sidebar text-sidebar-foreground transition-all duration-200",
        collapsed ? "w-14" : "w-60"
      )}
    >
      <div className={cn("flex h-14 items-center px-3", collapsed ? "justify-center px-0" : "justify-between")}>
        {!collapsed && (
          <Link
            href={basePath}
            className="flex min-w-0 items-center gap-2.5"
          >
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-primary text-[11px] font-semibold text-primary-foreground">
              {workspaceName.charAt(0).toUpperCase()}
            </span>
            <span className="truncate text-sm font-semibold text-foreground">
              {workspaceName}
            </span>
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        {NAV_GROUPS.map((group, groupIndex) => (
          <div key={group.label ?? "root"}>
            {group.label ? (
              collapsed ? (
                <div className="mx-2 my-2 border-t border-sidebar-border" />
              ) : (
                <div className="px-2.5 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  {group.label}
                </div>
              )
            ) : (
              groupIndex === 0 && <div className="pt-1" />
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <Link
                  key={item.label}
                  href={`${basePath}${item.href}`}
                  className={navItemClass(item.href)}
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
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
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </Link>
        ))}
      </div>
    </aside>
  );
}
