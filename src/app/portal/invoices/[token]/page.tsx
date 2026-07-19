import { notFound } from "next/navigation";
import { getInvoiceByShareToken } from "@/features/invoices/queries";
import { getPackageBreakdownsForPortal } from "@/features/catalog/queries";
import {
  InvoicePortalView,
  type PortalInvoice,
} from "@/features/invoices/components/portal/invoice-portal-view";

export default async function InvoicePortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await getInvoiceByShareToken(token);
  if (!result) notFound();

  const { invoice } = result;

  const catalogItemIds = invoice.line_items
    .map((li) => li.catalog_item_id)
    .filter((id): id is string => !!id);
  const packageBreakdowns = await getPackageBreakdownsForPortal(
    invoice.workspace_id,
    catalogItemIds
  );

  // Project onto a customer-safe shape before handing off to the client
  // component — props passed to a "use client" component are serialized
  // into the page payload regardless of what's rendered, so this is what
  // actually keeps workspace_id/created_by/share_token and each payment's
  // recorded_by/reference/notes/bank details off this public route, not
  // just out of the JSX.
  const portalInvoice: PortalInvoice = {
    invoice_number: invoice.invoice_number,
    status: invoice.status,
    title: invoice.title,
    summary: invoice.summary,
    client: {
      name: invoice.client.name,
      company: invoice.client.company,
    },
    issue_date: invoice.issue_date,
    due_date: invoice.due_date,
    currency: invoice.currency,
    subtotal: invoice.subtotal,
    discount_amount: invoice.discount_amount,
    tax_amount: invoice.tax_amount,
    total: invoice.total,
    amount_paid: invoice.amount_paid,
    amount_due: invoice.amount_due,
    line_items: invoice.line_items,
    payments: invoice.payments.map((p) => ({
      id: p.id,
      amount: p.amount,
      currency: p.currency,
      payment_method: p.payment_method,
      payment_date: p.payment_date,
    })),
    notes: invoice.notes,
    payment_terms: invoice.payment_terms,
    packageBreakdowns,
  };

  return (
    <InvoicePortalView
      shareToken={token}
      invoice={portalInvoice}
      workspaceName={result.workspaceName}
    />
  );
}
