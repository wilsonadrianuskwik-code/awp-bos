"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/providers/toast-provider";
import { setDocumentTaxSettings } from "@/features/documents/actions";
import { TaxBreakdownBlock } from "@/features/documents/components/tax-breakdown";
import type { TaxSettings } from "@/features/documents/tax";

type TaxSettingsCardProps = {
  workspaceId: string;
  documentType: "invoice" | "proforma_invoice";
  documentId: string;
  hargaJual: number;
  currency: string;
  settings: TaxSettings;
  /** Issued documents keep the rates they were issued under. */
  editable: boolean;
};

/**
 * Edits the tax settings behind the totals block, with a live preview of
 * the resulting figures. PPH and Retensi are checkboxes rather than a
 * "0%" default because "not applicable" and "0%" are different statements
 * on the printed document.
 */
export function TaxSettingsCard({
  workspaceId,
  documentType,
  documentId,
  hargaJual,
  currency,
  settings,
  editable,
}: TaxSettingsCardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<TaxSettings>(settings);

  const dirty =
    draft.dpp_numerator !== settings.dpp_numerator ||
    draft.dpp_denominator !== settings.dpp_denominator ||
    draft.ppn_percent !== settings.ppn_percent ||
    draft.pph_percent !== settings.pph_percent ||
    draft.retensi_percent !== settings.retensi_percent;

  function patch(next: Partial<TaxSettings>) {
    setDraft((prev) => ({ ...prev, ...next }));
  }

  function handleSave() {
    startTransition(async () => {
      const result = await setDocumentTaxSettings(
        workspaceId,
        documentType,
        documentId,
        draft
      );
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Tax settings updated", "success");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Totals</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <TaxBreakdownBlock
          hargaJual={hargaJual}
          currency={currency}
          settings={draft}
        />

        {editable && (
          <div className="space-y-3 border-t pt-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="DPP fraction">
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min={1}
                    className="h-8"
                    value={draft.dpp_numerator}
                    onChange={(e) =>
                      patch({ dpp_numerator: Number(e.target.value) || 0 })
                    }
                  />
                  <span className="text-muted-foreground">/</span>
                  <Input
                    type="number"
                    min={1}
                    className="h-8"
                    value={draft.dpp_denominator}
                    onChange={(e) =>
                      patch({ dpp_denominator: Number(e.target.value) || 1 })
                    }
                  />
                </div>
              </Field>

              <Field label="PPN %">
                <Input
                  type="number"
                  min={0}
                  step="0.001"
                  className="h-8"
                  value={draft.ppn_percent}
                  onChange={(e) =>
                    patch({ ppn_percent: Number(e.target.value) || 0 })
                  }
                />
              </Field>
            </div>

            <ToggleRate
              label="Potong PPH"
              value={draft.pph_percent}
              defaultRate={2}
              onChange={(v) => patch({ pph_percent: v })}
            />
            <ToggleRate
              label="Potong Retensi"
              value={draft.retensi_percent}
              defaultRate={5}
              onChange={(v) => patch({ retensi_percent: v })}
            />

            <Button
              size="sm"
              disabled={!dirty || isPending}
              loading={isPending}
              onClick={handleSave}
            >
              Save totals
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

function ToggleRate({
  label,
  value,
  defaultRate,
  onChange,
}: {
  label: string;
  value: number | null;
  defaultRate: number;
  onChange: (value: number | null) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <label className="flex flex-1 items-center gap-2 text-[13px]">
        <Checkbox
          checked={value !== null}
          onCheckedChange={(checked) => onChange(checked ? defaultRate : null)}
        />
        {label}
      </label>
      <Input
        type="number"
        min={0}
        step="0.001"
        className="h-8 w-24"
        disabled={value === null}
        value={value ?? ""}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        aria-label={`${label} percent`}
      />
    </div>
  );
}
