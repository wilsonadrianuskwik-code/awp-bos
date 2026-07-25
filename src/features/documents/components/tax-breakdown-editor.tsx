"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { TaxBreakdownBlock } from "@/features/documents/components/tax-breakdown";
import type { TaxSettings } from "@/features/documents/tax";

type TaxBreakdownEditorProps = {
  hargaJual: number;
  currency: string;
  settings: TaxSettings;
  onChange: (settings: TaxSettings) => void;
  disabled?: boolean;
};

/**
 * The totals block as it appears while drafting: the same breakdown the
 * document will print, with the two optional withholdings togglable
 * inline so the total updates as you decide them.
 *
 * DPP fraction and PPN rate aren't exposed here — they're regulation
 * defaults that rarely change per document, and are editable on the
 * document's detail page when they do.
 */
export function TaxBreakdownEditor({
  hargaJual,
  currency,
  settings,
  onChange,
  disabled,
}: TaxBreakdownEditorProps) {
  return (
    <div className="space-y-3 self-end">
      <TaxBreakdownBlock
        hargaJual={hargaJual}
        currency={currency}
        settings={settings}
      />

      <div className="space-y-2 border-t pt-3">
        <Toggle
          label="Potong PPH"
          value={settings.pph_percent}
          defaultRate={2}
          disabled={disabled}
          onChange={(pph_percent) => onChange({ ...settings, pph_percent })}
        />
        <Toggle
          label="Potong Retensi"
          value={settings.retensi_percent}
          defaultRate={5}
          disabled={disabled}
          onChange={(retensi_percent) => onChange({ ...settings, retensi_percent })}
        />
      </div>
    </div>
  );
}

function Toggle({
  label,
  value,
  defaultRate,
  disabled,
  onChange,
}: {
  label: string;
  value: number | null;
  defaultRate: number;
  disabled?: boolean;
  onChange: (value: number | null) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-[13px]">
      <label className="flex items-center gap-2">
        <Checkbox
          checked={value !== null}
          disabled={disabled}
          onCheckedChange={(checked) => onChange(checked ? defaultRate : null)}
        />
        {label}
      </label>
      <span className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          step="0.001"
          disabled={disabled || value === null}
          value={value ?? ""}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          aria-label={`${label} percent`}
          className="h-8 w-16 rounded-md border border-input bg-card px-2 text-right text-sm tabular-nums focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/25 disabled:opacity-50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        %
      </span>
    </div>
  );
}
