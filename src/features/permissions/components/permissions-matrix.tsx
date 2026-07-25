"use client";

import { Fragment, useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { setModulePermission } from "@/features/permissions/actions";
import type { ModulePermission } from "@/features/permissions/queries";

const ROLES = ["viewer", "staff", "admin"] as const;
const MODULES = [
  "clients", "quotations", "proforma_invoices", "invoices", "payments",
  "suppliers", "purchase_orders", "delivery_orders", "catalog", "projects", "reports",
] as const;

export function PermissionsMatrix({ workspaceId, initial }: { workspaceId: string; initial: ModulePermission[] }) {
  const [overrides, setOverrides] = useState<Map<string, { can_view: boolean; can_write: boolean }>>(
    new Map(initial.map((p) => [`${p.role}:${p.module}`, { can_view: p.can_view, can_write: p.can_write }]))
  );
  const [isPending, startTransition] = useTransition();

  function cell(role: string, module: string) {
    return overrides.get(`${role}:${module}`) ?? { can_view: true, can_write: role !== "viewer" };
  }

  function toggle(role: string, module: string, field: "can_view" | "can_write") {
    const current = cell(role, module);
    const next = { ...current, [field]: !current[field] };
    setOverrides((prev) => new Map(prev).set(`${role}:${module}`, next));
    startTransition(() => {
      setModulePermission(workspaceId, { role, module, ...next });
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Module Permissions</CardTitle>
        <p className="text-[13px] text-muted-foreground">
          Overrides the default role hierarchy per module. Unchanged cells fall back to standard behavior (staff and above can write, everyone can view).
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                <th className="pb-2 pr-3">Module</th>
                {ROLES.map((role) => (
                  <th key={role} className="pb-2 pr-3 text-center capitalize" colSpan={2}>
                    {role}
                  </th>
                ))}
              </tr>
              <tr className="border-b text-[11px] text-muted-foreground">
                <th />
                {ROLES.map((role) => (
                  <Fragment key={role}>
                    <th className="pb-1 text-center font-normal">View</th>
                    <th className="pb-1 text-center font-normal">Write</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODULES.map((module) => (
                <tr key={module} className="border-b last:border-0">
                  <td className="py-1.5 pr-3 capitalize">{module.replace(/_/g, " ")}</td>
                  {ROLES.map((role) => {
                    const state = cell(role, module);
                    return (
                      <Fragment key={`${role}-${module}`}>
                        <td className="py-1.5 text-center">
                          <Checkbox
                            checked={state.can_view}
                            disabled={isPending}
                            onCheckedChange={() => toggle(role, module, "can_view")}
                          />
                        </td>
                        <td className="py-1.5 text-center">
                          <Checkbox
                            checked={state.can_write}
                            disabled={isPending || role === "viewer"}
                            onCheckedChange={() => toggle(role, module, "can_write")}
                          />
                        </td>
                      </Fragment>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
