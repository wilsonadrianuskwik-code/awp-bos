"use client";

import { useMemo, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/providers/toast-provider";
import { upsertNumberingTemplate } from "@/features/numbering/actions";
import {
  NUMBERING_DOCUMENT_TYPES,
  RESET_CADENCES,
  SEQUENCE_SCOPES,
  type NumberingDocumentType,
  type NumberingTemplate,
  type ResetCadence,
  type SequenceScope,
} from "@/features/numbering/types";

const DOCUMENT_TYPE_LABEL: Record<NumberingDocumentType, string> = {
  quotation: "Quotation",
  proforma_invoice: "Proforma Invoice",
  invoice: "Invoice",
  purchase_order: "Purchase Order",
  delivery_order: "Delivery Order",
  payment: "Payment",
};

/**
 * The built-in standard, and it must stay identical to the fallback in
 * generate_document_number (00091). This panel prefills unsaved rows
 * with it, so any drift between the two silently becomes a different
 * numbering scheme the moment someone saves a row — which is exactly how
 * the project code went missing once already (see 00090).
 */
const DEFAULT_TEMPLATE = "{PREFIX}/AWP/{DD}{MM}{YYYY}-{SEQ:3}";
const DEFAULT_CADENCE: ResetCadence = "yearly";
const DEFAULT_SCOPE: SequenceScope = "workspace";

/**
 * The prefix each create_* RPC passes as {PREFIX} (00078). Kept here so
 * the preview shows the number that type will really produce, rather
 * than one hardcoded prefix for every row.
 */
const DOCUMENT_TYPE_PREFIX: Record<NumberingDocumentType, string> = {
  quotation: "QT",
  proforma_invoice: "PI",
  invoice: "INV",
  purchase_order: "PO",
  delivery_order: "DO",
  payment: "PAY",
};

const CADENCE_LABEL: Record<ResetCadence, string> = {
  never: "Never",
  yearly: "Yearly",
  monthly: "Monthly",
  daily: "Daily",
};

const SCOPE_LABEL: Record<SequenceScope, string> = {
  workspace: "Workspace-wide",
  project: "Per project",
};

/**
 * Live, client-side-only preview of the next number a template would
 * produce — mirrors generate_document_number's placeholder substitution
 * (supabase/migrations/00067_document_numbering_v2.sql) but never touches
 * the database counter, so typing in this field costs nothing server-side.
 */
function previewNumber(template: string, prefix: string): string {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const yy = yyyy.slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");

  let result = template;
  result = result.replaceAll("{PREFIX}", prefix);
  result = result.replaceAll("{PROJECT_CODE}", "PRJ001");
  result = result.replaceAll("{YYYY}", yyyy);
  result = result.replaceAll("{YY}", yy);
  result = result.replaceAll("{MM}", mm);
  result = result.replaceAll("{DD}", dd);
  result = result.replace(/\{SEQ:(\d+)\}/g, (_, width) => "1".padStart(Number(width), "0"));
  result = result.replace(/\{RANDOM:(\d+)\}/g, (_, width) => "X".repeat(Number(width)));
  return result;
}

type RowState = {
  template: string;
  reset_cadence: ResetCadence;
  sequence_scope: SequenceScope;
};

type NumberingSettingsPanelProps = {
  workspaceId: string;
  templates: NumberingTemplate[];
};

// One row per document type in the registry, each independently editable
// and saved via upsertNumberingTemplate — mirrors the Company
// Profile/Payment Details settings forms' one-section-per-concept layout.
export function NumberingSettingsPanel({ workspaceId, templates }: NumberingSettingsPanelProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [savingType, setSavingType] = useState<NumberingDocumentType | null>(null);

  const byType = useMemo(() => {
    const map = new Map<NumberingDocumentType, NumberingTemplate>();
    for (const t of templates) map.set(t.document_type, t);
    return map;
  }, [templates]);

  const [rows, setRows] = useState<Record<NumberingDocumentType, RowState>>(() => {
    const initial = {} as Record<NumberingDocumentType, RowState>;
    for (const type of NUMBERING_DOCUMENT_TYPES) {
      const existing = byType.get(type);
      initial[type] = {
        template: existing?.template ?? DEFAULT_TEMPLATE,
        reset_cadence: existing?.reset_cadence ?? DEFAULT_CADENCE,
        sequence_scope: existing?.sequence_scope ?? DEFAULT_SCOPE,
      };
    }
    return initial;
  });

  function updateRow(type: NumberingDocumentType, patch: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [type]: { ...prev[type], ...patch } }));
  }

  function handleSave(type: NumberingDocumentType) {
    const row = rows[type];
    setSavingType(type);
    startTransition(async () => {
      const result = await upsertNumberingTemplate(workspaceId, {
        document_type: type,
        template: row.template,
        reset_cadence: row.reset_cadence,
        sequence_scope: row.sequence_scope,
      });
      setSavingType(null);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast(`${DOCUMENT_TYPE_LABEL[type]} numbering saved`, "success");
    });
  }

  return (
    <div className="space-y-4">
      {NUMBERING_DOCUMENT_TYPES.map((type) => {
        const row = rows[type];
        return (
          <Card key={type}>
            <CardHeader>
              <CardTitle className="text-base">{DOCUMENT_TYPE_LABEL[type]}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor={`template-${type}`}>Template</Label>
                <Input
                  id={`template-${type}`}
                  value={row.template}
                  onChange={(e) => updateRow(type, { template: e.target.value })}
                  placeholder={DEFAULT_TEMPLATE}
                  className="font-mono text-sm"
                />
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  {row.template !== DEFAULT_TEMPLATE && (
                    <button
                      type="button"
                      onClick={() =>
                        updateRow(type, {
                          template: DEFAULT_TEMPLATE,
                          reset_cadence: DEFAULT_CADENCE,
                          sequence_scope: DEFAULT_SCOPE,
                        })
                      }
                      className="rounded-full border px-2 py-0.5 text-[11px] transition-colors duration-100 hover:border-primary/40 hover:text-foreground"
                    >
                      Restore standard
                    </button>
                  )}
                  <span>
                  Preview:{" "}
                  <span className="font-mono text-foreground">{previewNumber(row.template, DOCUMENT_TYPE_PREFIX[type])}</span>
                  </span>
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Reset cadence</Label>
                  <Select
                    value={row.reset_cadence}
                    onValueChange={(v) => updateRow(type, { reset_cadence: v as ResetCadence })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RESET_CADENCES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {CADENCE_LABEL[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Sequence scope</Label>
                  <Select
                    value={row.sequence_scope}
                    onValueChange={(v) => updateRow(type, { sequence_scope: v as SequenceScope })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SEQUENCE_SCOPES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {SCOPE_LABEL[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={() => handleSave(type)}
                  disabled={isPending && savingType === type}
                >
                  {isPending && savingType === type ? "Saving..." : "Save"}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
