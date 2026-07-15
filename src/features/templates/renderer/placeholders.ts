import { formatCurrency } from "@/lib/utils/format-currency";
import type { DocumentRenderData } from "@/features/templates/renderer/types";

// Builds the flat dot-notation context object that {{placeholder}}
// syntax resolves against — company/client/document/workspace/meta
// namespaces merged from DocumentRenderData, per the architecture's
// namespace list. `address.full` is a virtual field concatenating
// non-empty address parts with commas.
function addressToFull(address?: { line1?: string; line2?: string; city?: string; state?: string; postal_code?: string; country?: string }): string {
  if (!address) return "";
  return [address.line1, address.line2, address.city, address.state, address.postal_code, address.country]
    .filter((part) => part && part.trim() !== "")
    .join(", ");
}

function buildContext(data: DocumentRenderData): Record<string, unknown> {
  return {
    company: {
      name: data.company.name,
      email: data.company.email ?? "",
      phone: data.company.phone ?? "",
      website: data.company.website ?? "",
      tax_id: data.company.tax_id ?? "",
      registration: data.company.registration_number ?? "",
      address: {
        line1: data.company.address?.line1 ?? "",
        line2: data.company.address?.line2 ?? "",
        city: data.company.address?.city ?? "",
        state: data.company.address?.state ?? "",
        postal_code: data.company.address?.postal_code ?? "",
        country: data.company.address?.country ?? "",
        full: addressToFull(data.company.address),
      },
    },
    client: {
      name: data.client.name,
      company: data.client.company ?? "",
      email: data.client.email ?? "",
      phone: data.client.phone ?? "",
      tax_id: data.client.tax_id ?? "",
      address: {
        line1: data.client.address?.line1 ?? "",
        city: data.client.address?.city ?? "",
        full: addressToFull(data.client.address),
      },
    },
    document: {
      number: data.document.number,
      title: data.document.title ?? "",
      status: data.document.status,
      date: data.document.date,
      due_date: data.document.due_date ?? "",
      expiry_date: data.document.expiry_date ?? "",
      version: data.document.version ?? "",
      subtotal: data.document.subtotal,
      discount_amount: data.document.discount_amount,
      tax_amount: data.document.tax_amount,
      total: data.document.total,
      amount_paid: data.document.amount_paid ?? "",
      amount_due: data.document.amount_due ?? "",
      currency: data.document.currency,
      notes: data.document.notes ?? "",
      terms: data.document.terms ?? "",
      payment_terms: data.document.payment_terms ?? "",
    },
    workspace: {
      name: data.company.name,
      currency: data.document.currency,
    },
    meta: {
      current_date: data.meta.current_date,
      current_year: data.meta.current_year,
    },
  };
}

function getByPath(context: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, context);
}

function applyFilter(value: unknown, filterExpr: string, currency: string): string {
  const [name, arg] = filterExpr.split(":").map((s) => s.trim().replace(/^"|"$/g, ""));

  switch (name) {
    case "uppercase":
      return String(value ?? "").toUpperCase();
    case "lowercase":
      return String(value ?? "").toLowerCase();
    case "currency": {
      const amount = typeof value === "number" ? value : Number(value ?? 0);
      return formatCurrency(amount, currency);
    }
    case "date": {
      if (!value) return "";
      const date = new Date(String(value));
      if (Number.isNaN(date.getTime())) return String(value);
      const format = arg || "DD MMM YYYY";
      return formatDate(date, format);
    }
    default:
      return String(value ?? "");
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDate(date: Date, format: string): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  const MMM = MONTHS[date.getMonth()];

  return format
    .replace(/DD/g, dd)
    .replace(/MMM/g, MMM)
    .replace(/MM/g, mm)
    .replace(/YYYY/g, yyyy);
}

const PLACEHOLDER_PATTERN = /\{\{\s*([\w.]+)\s*(?:\|\s*([^}]+))?\}\}/g;

// Resolves every {{namespace.field}} / {{namespace.field | filter:"arg"}}
// occurrence in `text` against `data`. Missing values resolve to an
// empty string — never "undefined"/"null" leaking into rendered output.
export function resolvePlaceholders(text: string, data: DocumentRenderData): string {
  const context = buildContext(data);

  return text.replace(PLACEHOLDER_PATTERN, (_match, path: string, filterExpr?: string) => {
    const value = getByPath(context, path);
    if (filterExpr) return applyFilter(value, filterExpr, data.document.currency);
    if (value === undefined || value === null) return "";
    return String(value);
  });
}
