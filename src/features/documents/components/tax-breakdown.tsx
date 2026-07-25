import { formatCurrency } from "@/lib/utils/format-currency";
import {
  computeTaxBreakdown,
  dppLabel,
  formatPercent,
  type TaxSettings,
} from "@/features/documents/tax";

type TaxBreakdownProps = {
  hargaJual: number;
  currency: string;
  settings: TaxSettings;
  /** Compact spacing for the document canvas/print view. */
  dense?: boolean;
};

/**
 * The totals block Indonesian construction invoices carry, matching the
 * order and labelling of the paper document:
 *
 *   TOTAL HARGA JUAL / DPP n/d / PPN x% / POTONG PPH x% / POTONG RETENSI x% / TOTAL
 *
 * PPH and Retensi rows are omitted entirely when not applicable — a zero
 * row would read as "withheld nothing", which isn't the same statement.
 * Withheld amounts print in parentheses, the accounting convention for a
 * deduction, and every figure is tabular-nums so columns align.
 */
export function TaxBreakdownBlock({
  hargaJual,
  currency,
  settings,
  dense = false,
}: TaxBreakdownProps) {
  const b = computeTaxBreakdown(hargaJual, settings);
  const rowClass = dense ? "py-1" : "py-1.5";

  return (
    <dl className="w-full text-[13px]">
      <Row
        className={rowClass}
        label="Total Harga Jual"
        value={formatCurrency(b.hargaJual, currency)}
      />
      {settings.show_dpp && (
        <Row
          className={rowClass}
          label={dppLabel(settings)}
          value={formatCurrency(b.dppAmount, currency)}
        />
      )}
      {/* Label carries no rate: the PPN percentage is a regulation
          constant here, not a per-document negotiation like PPH and
          Retensi, so printing it invites questions it can't answer. The
          rate still drives the amount. */}
      <Row
        className={rowClass}
        label="PPN"
        value={formatCurrency(b.ppnAmount, currency)}
      />
      {settings.pph_percent !== null && (
        <Row
          className={rowClass}
          label={`Potong PPH ${formatPercent(settings.pph_percent)}%`}
          value={`(${formatCurrency(b.pphAmount, currency)})`}
        />
      )}
      {settings.retensi_percent !== null && (
        <Row
          className={rowClass}
          label={`Potong Retensi ${formatPercent(settings.retensi_percent)}%`}
          value={`(${formatCurrency(b.retensiAmount, currency)})`}
        />
      )}
      <div className="mt-1 flex items-baseline justify-between gap-6 border-t-2 border-double pt-2">
        <dt className="text-[11px] font-semibold uppercase tracking-wider">Total</dt>
        <dd className="text-base font-bold tabular-nums">
          {formatCurrency(b.total, currency)}
        </dd>
      </div>
    </dl>
  );
}

function Row({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className: string;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-6 ${className}`}>
      <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
