// Canned example data used only for thumbnails/previews in the Design
// Gallery and Theme Gallery — never shown to end clients. Lets a
// template card render through the exact same renderDocument() pipeline
// real documents use, instead of a separate static-image thumbnail
// pipeline that could drift out of sync with what a document actually
// looks like.
import type { TemplateDocumentType } from "@/features/templates/types";
import type { DocumentRenderData } from "@/features/templates/renderer/types";

const DOCUMENT_TYPE_LABEL: Record<TemplateDocumentType, string> = {
  invoice: "invoice",
  quotation: "quotation",
  receipt: "receipt",
  purchase_order: "purchase order",
  delivery_order: "delivery order",
};

export function getSampleRenderData(documentType: TemplateDocumentType): DocumentRenderData {
  return {
    document_type: documentType,
    company: {
      name: "Acme Design Studio",
      email: "hello@acmedesign.com",
      phone: "+1 (555) 123-4567",
      website: "www.acmedesign.com",
      address: { line1: "123 Creative Ave, Suite 400", city: "San Francisco", state: "CA", postal_code: "94102", country: "USA" },
    },
    client: {
      name: "Jordan Blake",
      company: "Client Company Ltd",
      email: "jordan@clientco.com",
      address: { line1: "456 Business Rd", city: "New York", country: "USA" },
    },
    document: {
      number: `SAMPLE-2025-0042`,
      title: `Sample ${DOCUMENT_TYPE_LABEL[documentType]}`,
      status: "sent",
      date: "2025-01-15",
      due_date: "2025-02-14",
      expiry_date: "2025-02-14",
      currency: "IDR",
      subtotal: 5048000,
      discount_amount: 0,
      tax_amount: 504800,
      total: 5552800,
      amount_paid: 0,
      amount_due: 5552800,
      notes: "",
      payment_terms: "Net 30",
    },
    line_items: [
      { category: "per_unit", description: "Website Redesign", quantity: 1, unit: null, unit_price: 3500, discount_percent: null, tax_percent: null, line_total: 3500 },
      { category: "per_unit", description: "Logo Design Package", quantity: 1, unit: null, unit_price: 1200, discount_percent: null, tax_percent: null, line_total: 1200 },
      { category: "per_unit", description: "Hosting Setup", quantity: 12, unit: "month", unit_price: 29, discount_percent: null, tax_percent: null, line_total: 348 },
    ],
    workspace_payment_details: {
      bank_accounts: [
        {
          label: "Primary Account",
          bank_name: "First National Bank",
          account_name: "Acme Design Studio",
          account_number: "1234-5678-90",
          swift_code: "FNBAUS33",
          is_primary: true,
        },
      ],
      custom_instructions: "Please include the invoice number as payment reference.",
    },
    workspace_branding: { tagline: "Design Studio | Creative Agency" },
    meta: { current_date: new Date().toISOString(), current_year: new Date().getFullYear() },
  };
}
