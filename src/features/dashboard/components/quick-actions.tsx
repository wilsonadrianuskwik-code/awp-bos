"use client";

import Link from "next/link";
import {
  Building2,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  PackageCheck,
  Receipt,
  UserCheck,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { useWorkspace } from "@/providers/workspace-provider";

type QuickAction = {
  label: string;
  href: string;
  icon: LucideIcon;
  color: string;
  /** Only shown to members who could actually complete it. */
  minRole?: "staff" | "admin";
};

/**
 * Creating things is what people open this app to do, and until now the
 * dashboard offered no way to start any of it — every new document meant
 * navigating to its module first, then finding the New button.
 *
 * Ordered by how often the work actually happens, not by the document
 * chain: quotations and invoices lead because they're daily, projects
 * and clients trail because they're occasional. Colours match each
 * module's sidebar hue, so the shortcut and the place it leads are
 * recognisably the same thing.
 */
const ACTIONS: QuickAction[] = [
  { label: "Quotation", href: "/quotations/new", icon: FileText, color: "#f43f5e" },
  { label: "Invoice", href: "/invoices/new", icon: Receipt, color: "#f59e0b" },
  {
    label: "Proforma",
    href: "/proforma-invoices/new",
    icon: FileSpreadsheet,
    color: "#fb923c",
  },
  {
    label: "Purchase Order",
    href: "/purchase-orders/new",
    icon: ClipboardList,
    color: "#22c55e",
  },
  {
    label: "Delivery Order",
    href: "/delivery-orders/new",
    icon: PackageCheck,
    color: "#10b981",
  },
  { label: "Project", href: "/projects/new", icon: Building2, color: "#a855f7" },
  { label: "Client", href: "/clients/new", icon: UserCheck, color: "#ec4899" },
  { label: "Supplier", href: "/suppliers/new", icon: Truck, color: "#84cc16" },
];

export function QuickActions() {
  const { workspace, can } = useWorkspace();

  // Everything here creates something, so a viewer would only get a
  // permission error. Better to not offer it.
  if (!can("staff")) return null;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
      {ACTIONS.map((action) => (
        <Link
          key={action.label}
          href={`/${workspace.slug}${action.href}`}
          style={{ "--action-color": action.color } as React.CSSProperties}
          className="group relative isolate flex flex-col items-center gap-2 rounded-xl border bg-card px-2 py-3.5 text-center outline-none transition-[transform,border-color] duration-200 [transition-timing-function:var(--spring-standard)] hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--action-color)_45%,transparent)] focus-visible:ring-2 focus-visible:ring-ring/40 motion-reduce:hover:translate-y-0"
        >
          {/* Same bloom the sidebar uses, so a shortcut lights up the way
              its module does. Blurred layer, not a box-shadow: it scales
              and fades on the compositor. */}
          <span
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-5 -z-10 h-8 w-8 -translate-x-1/2 -translate-y-1/2 scale-75 rounded-full opacity-0 blur-[11px] transition-[opacity,transform] duration-300 [transition-timing-function:var(--spring-standard)] group-hover:scale-125 group-hover:opacity-80 motion-reduce:transition-none"
            style={{ backgroundColor: action.color }}
          />
          <span
            className="grid h-9 w-9 place-items-center rounded-lg transition-colors duration-200"
            style={{
              backgroundColor: `color-mix(in srgb, ${action.color} 14%, transparent)`,
              color: action.color,
            }}
          >
            <action.icon className="h-[18px] w-[18px]" />
          </span>
          <span className="truncate text-[11px] font-medium leading-none">
            {action.label}
          </span>
        </Link>
      ))}
    </div>
  );
}
