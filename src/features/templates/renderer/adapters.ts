// Thin adapters mapping domain types (QuotationDetail, InvoiceDetail)
// into the renderer's unified DocumentRenderData shape. The renderer
// never touches domain types directly — this is the only place that
// does the translation.
import type { QuotationDetail } from "@/features/quotations/types";
import type { InvoiceDetail } from "@/features/invoices/types";
import type { CompanyProfile, PaymentDetails, BrandingSettings } from "@/features/templates/types";
import type { DocumentRenderData, RenderAddress } from "@/features/templates/renderer/types";
import type { PackageItem } from "@/features/catalog/types";

// Live package breakdowns keyed by catalog_item_id (see
// getPackageBreakdowns/getPackageBreakdownsForPortal) — a line item whose
// catalog_item_id has an entry here is a package line; entries carry that
// package's *current* contents, not what existed when the line was added.

type WorkspaceForRender = {
  name: string;
  logo_url: string | null;
  settings?: {
    company_profile?: CompanyProfile;
    payment_details?: PaymentDetails;
    branding?: BrandingSettings;
  } | null;
};

function companyFromWorkspace(workspace: WorkspaceForRender): DocumentRenderData["company"] {
  const profile = workspace.settings?.company_profile ?? {};
  return {
    name: profile.display_name || workspace.name,
    logo_url: workspace.logo_url ?? undefined,
    email: profile.email,
    phone: profile.phone,
    website: profile.website,
    tax_id: profile.tax_id,
    registration_number: profile.registration_number,
    address: profile.address as RenderAddress | undefined,
  };
}

function clientFromSummary(
  client: {
    name: string;
    company?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: RenderAddress | null;
    tax_id?: string | null;
  } | null
): DocumentRenderData["client"] {
  // Null when the client behind this document was soft-deleted after the
  // fact — the document is a historical record and must still render.
  if (!client) {
    return { name: "Deleted client" };
  }
  return {
    name: client.name,
    company: client.company ?? undefined,
    email: client.email ?? undefined,
    phone: client.phone ?? undefined,
    address: client.address ?? undefined,
    tax_id: client.tax_id ?? undefined,
  };
}

function meta(): DocumentRenderData["meta"] {
  const now = new Date();
  return { current_date: now.toISOString(), current_year: now.getFullYear() };
}

export function quotationToRenderData(
  quotation: QuotationDetail,
  workspace: WorkspaceForRender,
  packageBreakdowns: Record<string, PackageItem[]> = {}
): DocumentRenderData {
  return {
    document_type: "quotation",
    company: companyFromWorkspace(workspace),
    client: clientFromSummary(quotation.client),
    document: {
      number: quotation.quotation_number,
      title: quotation.title ?? undefined,
      status: quotation.status,
      date: quotation.issue_date,
      expiry_date: quotation.expiry_date ?? undefined,
      version: quotation.version,
      currency: quotation.currency,
      subtotal: quotation.subtotal,
      discount_amount: quotation.discount_amount,
      tax_amount: quotation.tax_amount,
      total: quotation.total,
      notes: quotation.notes ?? undefined,
      terms: quotation.terms_and_conditions ?? undefined,
      summary: quotation.summary ?? undefined,
    },
    line_items: quotation.line_items.map((item) => ({
      category: item.category,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unit_price: item.unit_price,
      discount_percent: item.discount_percent,
      tax_percent: item.tax_percent,
      line_total: item.line_total,
      package_breakdown: item.catalog_item_id
        ? (packageBreakdowns[item.catalog_item_id] ?? null)
        : null,
    })),
    workspace_payment_details: workspace.settings?.payment_details ?? undefined,
    workspace_branding: workspace.settings?.branding ?? undefined,
    meta: meta(),
  };
}

export function invoiceToRenderData(
  invoice: InvoiceDetail,
  workspace: WorkspaceForRender,
  packageBreakdowns: Record<string, PackageItem[]> = {}
): DocumentRenderData {
  return {
    document_type: "invoice",
    company: companyFromWorkspace(workspace),
    client: clientFromSummary(invoice.client),
    document: {
      number: invoice.invoice_number,
      title: invoice.title ?? undefined,
      status: invoice.status,
      date: invoice.issue_date,
      due_date: invoice.due_date ?? undefined,
      currency: invoice.currency,
      subtotal: invoice.subtotal,
      discount_amount: invoice.discount_amount,
      tax_amount: invoice.tax_amount,
      total: invoice.total,
      // Indonesian breakdown — harga jual is the sum of lines after line
      // discounts, which is what every downstream figure is derived from.
      harga_jual: invoice.subtotal - invoice.discount_amount,
      dpp_amount: invoice.dpp_amount,
      ppn_amount: invoice.ppn_amount,
      pph_amount: invoice.pph_amount,
      retensi_amount: invoice.retensi_amount,
      dpp_numerator: invoice.dpp_numerator,
      dpp_denominator: invoice.dpp_denominator,
      pph_percent: invoice.pph_percent,
      retensi_percent: invoice.retensi_percent,
      show_dpp: invoice.show_dpp,
      amount_paid: invoice.amount_paid,
      amount_due: invoice.amount_due,
      notes: invoice.notes ?? undefined,
      payment_terms: invoice.payment_terms ?? undefined,
      summary: invoice.summary ?? undefined,
    },
    line_items: invoice.line_items.map((item) => ({
      category: item.category,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unit_price: item.unit_price,
      discount_percent: item.discount_percent,
      tax_percent: item.tax_percent,
      line_total: item.line_total,
      package_breakdown: item.catalog_item_id
        ? (packageBreakdowns[item.catalog_item_id] ?? null)
        : null,
    })),
    payments: invoice.payments.map((p) => ({
      date: p.payment_date,
      method: p.payment_method,
      reference: p.reference,
      amount: p.amount,
    })),
    workspace_payment_details: workspace.settings?.payment_details ?? undefined,
    workspace_branding: workspace.settings?.branding ?? undefined,
    meta: meta(),
  };
}
