"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { TaxBreakdownBlock } from "@/features/documents/components/tax-breakdown";
import { dppLabel, hasPpn, type TaxSettings } from "@/features/documents/tax";

type TaxBreakdownEditorProps = {
  hargaJual: number;
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
  settings,
  onChange,
  disabled,
}: TaxBreakdownEditorProps) {
  return (
    <div className="space-y-3 self-end">
      <TaxBreakdownBlock
        hargaJual={hargaJual}
        settings={settings}
      />

      <div className="space-y-2 border-t pt-3">
        {/* PPN-exclusive pricing is a real case, so PPN is a per-document
            choice like the withholdings — not a constant. */}
        <Toggle
          label="PPN"
          value={settings.ppn_percent}
          defaultRate={12}
          disabled={disabled}
          onChange={(ppn_percent) => onChange({ ...settings, ppn_percent })}
        />
        {/* Show/hide only — the DPP amount is still computed either way,
            since PPN is derived from it. DPP has nothing to explain when
            no PPN is charged, so the choice only appears alongside it. */}
        {hasPpn(settings) && (
        <label className="flex items-center gap-2 text-[13px]">
          <Checkbox
            checked={settings.show_dpp}
            disabled={disabled}
            onCheckedChange={(checked) =>
              onChange({ ...settings, show_dpp: checked === true })
            }
          />
          Show {dppLabel(settings)}
        </label>
        )}
        <Toggle
          label="Potong PPH Final"
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
