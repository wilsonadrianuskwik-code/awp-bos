import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { getInvoice, getInvoiceActivities } from "@/features/invoices/queries";
import { getFulfillmentItems } from "@/features/fulfillment/queries";
import { syncFulfillmentItemsAction } from "@/features/fulfillment/actions";
import { InvoiceDetail } from "@/features/invoices/components/invoice-detail";

export default async function InvoiceDetailRoute({
  params,
}: {
  params: Promise<{ workspaceSlug: string; invoiceId: string }>;
}) {
  const { workspaceSlug, invoiceId } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  // Idempotent — creates a tracker for this invoice's eligible-but-untracked
  // line items on load, same as the ledger page (see sync_fulfillment_items).
  await syncFulfillmentItemsAction(workspace.id);

  const [invoice, activities, { items: fulfillmentItems }] = await Promise.all([
    getInvoice(invoiceId, workspace.id),
    getInvoiceActivities(invoiceId),
    getFulfillmentItems(workspace.id, { invoiceId }),
  ]);

  if (!invoice) notFound();

  return (
    <InvoiceDetail
      invoice={invoice}
      activities={activities}
      workspaceName={workspace.name}
      fulfillmentItems={fulfillmentItems}
    />
  );
}
