"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";
import { createSimpleLookup, deleteSimpleLookup } from "@/features/master-data/actions";
import type { LookupType, SimpleLookup } from "@/features/master-data/queries";

const SECTIONS: { type: LookupType; label: string; extraField?: { key: string; label: string; placeholder: string } }[] = [
  { type: "unit_of_measure", label: "Units of Measure", extraField: undefined },
  { type: "tax_rate", label: "Tax Rates", extraField: { key: "rate_percent", label: "Rate %", placeholder: "11" } },
  { type: "payment_term", label: "Payment Terms", extraField: { key: "net_days", label: "Net Days", placeholder: "30" } },
  { type: "brand", label: "Brands", extraField: undefined },
];

function LookupSection({
  workspaceId,
  type,
  label,
  extraField,
  initial,
}: {
  workspaceId: string;
  type: LookupType;
  label: string;
  extraField?: { key: string; label: string; placeholder: string };
  initial: SimpleLookup[];
}) {
  const [rows, setRows] = useState(initial);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [extraValue, setExtraValue] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleAdd() {
    if (!code || !name) return;
    startTransition(async () => {
      const extra = extraField && extraValue ? { [extraField.key]: Number(extraValue) } : {};
      const result = await createSimpleLookup(workspaceId, { lookup_type: type, code, name, extra });
      if (result.data) {
        setRows((prev) => [...prev, result.data as SimpleLookup]);
      }
      setCode("");
      setName("");
      setExtraValue("");
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteSimpleLookup(workspaceId, id);
      setRows((prev) => prev.filter((r) => r.id !== id));
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-1">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between rounded-md px-2 py-1.5 text-[13px] hover:bg-muted/40">
              <span>
                <span className="font-mono text-[12px] text-muted-foreground">{row.code}</span>{" "}
                {row.name}
                {extraField && row.extra?.[extraField.key] != null && (
                  <span className="ml-2 text-muted-foreground">
                    ({String(row.extra[extraField.key])}{extraField.key === "rate_percent" ? "%" : ""})
                  </span>
                )}
              </span>
              <Button variant="ghost" size="icon" className="h-6 w-6" disabled={isPending} onClick={() => handleDelete(row.id)}>
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </li>
          ))}
          {rows.length === 0 && <li className="px-2 py-1.5 text-[13px] text-muted-foreground">None yet.</li>}
        </ul>
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Input placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} className="w-24" />
          <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className="w-40" />
          {extraField && (
            <Input placeholder={extraField.placeholder} value={extraValue} onChange={(e) => setExtraValue(e.target.value)} className="w-24" />
          )}
          <Button size="sm" disabled={isPending || !code || !name} onClick={handleAdd}>
            Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function MasterDataPanel({ workspaceId, initialByType }: { workspaceId: string; initialByType: Record<LookupType, SimpleLookup[]> }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {SECTIONS.map((section) => (
        <LookupSection
          key={section.type}
          workspaceId={workspaceId}
          type={section.type}
          label={section.label}
          extraField={section.extraField}
          initial={initialByType[section.type] ?? []}
        />
      ))}
    </div>
  );
}
