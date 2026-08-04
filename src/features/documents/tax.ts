/**
 * Indonesian tax breakdown shared by Invoices and Proforma Invoices.
 *
 * Mirrors recompute_invoice_totals / recompute_proforma_invoice_totals
 * (00082) so the builder can preview the same figures the database will
 * store. The server remains the source of truth — this is display only.
 */

export type TaxSettings = {
  dpp_numerator: number;
  dpp_denominator: number;
  /**
   * null = this document carries no PPN (a PPN-exclusive price). Zero
   * would print "PPN Rp 0", which says something different.
   */
  ppn_percent: number | null;
  /** null = not applicable; omitted from the document entirely. */
  pph_percent: number | null;
  retensi_percent: number | null;
  /**
   * Whether the DPP line is printed. Presentational only — dpp_amount is
   * always computed regardless, because PPN is derived from it.
   */
  show_dpp: boolean;
};

export type TaxBreakdown = {
  hargaJual: number;
  dppAmount: number;
  ppnAmount: number;
  pphAmount: number;
  retensiAmount: number;
  total: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeTaxBreakdown(
  hargaJual: number,
  settings: TaxSettings
): TaxBreakdown {
  const denominator = settings.dpp_denominator || 1;
  const dppAmount = round2((hargaJual * settings.dpp_numerator) / denominator);
  const ppnAmount = round2((dppAmount * (settings.ppn_percent ?? 0)) / 100);
  const pphAmount = round2((hargaJual * (settings.pph_percent ?? 0)) / 100);
  const retensiAmount = round2(
    (hargaJual * (settings.retensi_percent ?? 0)) / 100
  );

  return {
    hargaJual,
    dppAmount,
    ppnAmount,
    pphAmount,
    retensiAmount,
    // Withholdings reduce what's actually collected; PPN adds to it.
    total: round2(hargaJual + ppnAmount - pphAmount - retensiAmount),
  };
}

/**
 * Whether this document charges PPN at all. The DPP row exists only to
 * show how PPN was derived, so it follows the same answer.
 */
export function hasPpn(settings: Pick<TaxSettings, "ppn_percent">) {
  return settings.ppn_percent !== null && settings.ppn_percent > 0;
}

/** e.g. "DPP 11/12" — the fraction is shown, since it's the legal basis. */
/**
 * What the DPP row is called on the document.
 *
 * A DPP computed from a fraction of the selling price rather than the
 * price itself is a "nilai lain" (other value) basis in Indonesian tax
 * law — the 11/12 basis PMK 131/2024 introduced for 2025 is exactly
 * that. So the row is named for the basis rather than printed as a bare
 * fraction, which is what the term is on a faktur and in the register.
 *
 * A 1/1 fraction is not a nilai lain: the DPP is the full selling price,
 * which is the ordinary basis and the one every pre-2025 document used.
 * It stays plain "DPP" so a 2024 document doesn't claim a rule that did
 * not exist when it was issued.
 */
export function dppLabel(settings: Pick<TaxSettings, "dpp_numerator" | "dpp_denominator">) {
  const isOtherValue =
    settings.dpp_numerator !== settings.dpp_denominator;
  return isOtherValue ? "DPP Nilai Lain" : "DPP";
}

/** Trims trailing zeros so 12.000 prints as "12". */
export function formatPercent(value: number) {
  return `${Number(value)}`;
}

/**
 * The breakdown as printed rows, in document order. Every print view
 * builds its totals from this, so a change to what the breakdown shows
 * (PPN becoming optional, say) lands on all five document types at once
 * rather than in four near-identical copies.
 *
 * DPP and PPN drop out entirely when the document carries no PPN, the
 * same way PPH and Retensi do when not applicable — a zero row asserts
 * something the document doesn't mean.
 */
export function taxTotalRows(
  breakdown: TaxBreakdown,
  settings: TaxSettings,
  format: (amount: number) => string
): { label: string; value: string }[] {
  const rows = [{ label: "Total Harga Jual", value: format(breakdown.hargaJual) }];

  if (hasPpn(settings)) {
    if (settings.show_dpp) {
      rows.push({ label: dppLabel(settings), value: format(breakdown.dppAmount) });
    }
    // No rate on the PPN label: it's a regulation constant, unlike PPH
    // and Retensi which are negotiated per document.
    rows.push({ label: "PPN", value: format(breakdown.ppnAmount) });
  }

  if (settings.pph_percent !== null) {
    rows.push({
      label: `Potong PPH Final ${formatPercent(settings.pph_percent)}%`,
      value: `(${format(breakdown.pphAmount)})`,
    });
  }
  if (settings.retensi_percent !== null) {
    rows.push({
      label: `Potong Retensi ${formatPercent(settings.retensi_percent)}%`,
      value: `(${format(breakdown.retensiAmount)})`,
    });
  }

  return rows;
}
