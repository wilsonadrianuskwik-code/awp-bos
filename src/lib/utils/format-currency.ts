// Deterministic currency formatting, independent of the host's ICU/Intl
// data (which varies across Node/browser versions and can silently change
// symbol placement or spacing). Each supported currency has an explicit
// prefix and number style so output is exactly the same everywhere.
type CurrencyFormat = {
  /** Shown immediately before the number, e.g. "Rp " or "$". */
  prefix: string;
  /** Locale used only for grouping/decimal digit rendering, not the symbol. */
  locale: string;
  decimals: number;
};

const CURRENCY_FORMATS: Record<string, CurrencyFormat> = {
  USD: { prefix: "$", locale: "en-US", decimals: 2 },
  EUR: { prefix: "€", locale: "en-US", decimals: 2 },
  GBP: { prefix: "£", locale: "en-US", decimals: 2 },
  SGD: { prefix: "S$", locale: "en-US", decimals: 2 },
  MYR: { prefix: "RM ", locale: "en-US", decimals: 2 },
  AUD: { prefix: "A$", locale: "en-US", decimals: 2 },
  CAD: { prefix: "C$", locale: "en-US", decimals: 2 },
  // Rupiah is conventionally shown with no decimals and a period as the
  // thousands separator (id-ID), e.g. "Rp 1.250.000".
  IDR: { prefix: "Rp ", locale: "id-ID", decimals: 0 },
};

const DEFAULT_FORMAT: CurrencyFormat = { prefix: "", locale: "en-US", decimals: 2 };

function getFormat(currency: string): CurrencyFormat {
  return CURRENCY_FORMATS[currency] ?? { ...DEFAULT_FORMAT, prefix: `${currency} ` };
}

/** Full formatted amount, e.g. formatCurrency(1250000, "IDR") -> "Rp 1.250.000". */
export function formatCurrency(amount: number, currency: string): string {
  const format = getFormat(currency);
  const number = new Intl.NumberFormat(format.locale, {
    minimumFractionDigits: format.decimals,
    maximumFractionDigits: format.decimals,
  }).format(amount);
  return `${format.prefix}${number}`;
}

/** Just the symbol/prefix, trimmed — for compact use inside input fields. */
export function getCurrencyPrefix(currency: string): string {
  return getFormat(currency).prefix.trim();
}
