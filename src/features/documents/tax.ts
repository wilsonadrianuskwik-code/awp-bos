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
  ppn_percent: number;
  /** null = not applicable; omitted from the document entirely. */
  pph_percent: number | null;
  retensi_percent: number | null;
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
  const ppnAmount = round2((dppAmount * settings.ppn_percent) / 100);
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

/** e.g. "DPP 11/12" — the fraction is shown, since it's the legal basis. */
export function dppLabel(settings: Pick<TaxSettings, "dpp_numerator" | "dpp_denominator">) {
  return `DPP ${settings.dpp_numerator}/${settings.dpp_denominator}`;
}

/** Trims trailing zeros so 12.000 prints as "12". */
export function formatPercent(value: number) {
  return `${Number(value)}`;
}
