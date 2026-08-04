import { formatCurrency } from "@/lib/utils/format-currency";
import {
  computeTaxBreakdown,
  dppLabel,
  formatPercent,
  hasPpn,
  type TaxSettings,
} from "@/features/documents/tax";

type TaxBreakdownProps = {
  hargaJual: number;
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
  settings,
  dense = false,
}: TaxBreakdownProps) {
  const b = computeTaxBreakdown(hargaJual, settings);
  const rowClass = dense ? "py-1" : "py-1.5";
  const ppn = hasPpn(settings);

  return (
    <dl className="w-full text-[13px]">
      <Row
        className={rowClass}
        label="Total Harga Jual"
        value={formatCurrency(b.hargaJual)}
      />
      {ppn && settings.show_dpp && (
        <Row
          className={rowClass}
          label={dppLabel(settings)}
          value={formatCurrency(b.dppAmount)}
        />
      )}
      {/* Label carries no rate: the PPN percentage is a regulation
          constant here, not a per-document negotiation like PPH and
          Retensi, so printing it invites questions it can't answer. The
          rate still drives the amount. */}
      {ppn && (
        <Row
          className={rowClass}
          label="PPN"
          value={formatCurrency(b.ppnAmount)}
        />
      )}
      {settings.pph_percent !== null && (
        <Row
          className={rowClass}
          label={`Potong PPH Final ${formatPercent(settings.pph_percent)}%`}
          value={`(${formatCurrency(b.pphAmount)})`}
        />
      )}
      {settings.retensi_percent !== null && (
        <Row
          className={rowClass}
          label={`Potong Retensi ${formatPercent(settings.retensi_percent)}%`}
          value={`(${formatCurrency(b.retensiAmount)})`}
        />
      )}
      <div className="mt-1 flex items-baseline justify-between gap-3 border-t-2 border-double pt-2">
        <dt className="text-[11px] font-semibold uppercase tracking-wider">Total</dt>
        <dd className="whitespace-nowrap text-base font-bold tabular-nums">
          {formatCurrency(b.total)}
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
    // gap-3 and nowrap on the amount: in the detail page's totals panel
    // the block is ~300px wide, and a wrapped "(Rp 16.274.038.462)" reads
    // as two different figures.
    <div className={`flex items-baseline justify-between gap-3 ${className}`}>
      <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="whitespace-nowrap tabular-nums">{value}</dd>
    </div>
  );
}
