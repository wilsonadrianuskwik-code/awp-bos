import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { getInvoice, getInvoiceActivities } from "@/features/invoices/queries";
import { getFulfillmentItems } from "@/features/fulfillment/queries";
import { syncFulfillmentItemsAction } from "@/features/fulfillment/actions";
import { InvoiceDetail } from "@/features/invoices/components/invoice-detail";
import { getDefaultTemplate } from "@/features/templates/queries";
import { getPackageBreakdowns } from "@/features/catalog/queries";
import { getDeliveryOrdersForInvoice } from "@/features/delivery-orders/queries";
import { getDocumentLinks } from "@/features/documents/queries";
import { getAllSuppliers } from "@/features/suppliers/queries";

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

  const [
    invoice,
    activities,
    { items: fulfillmentItems },
    template,
    deliveryOrders,
    links,
    suppliers,
  ] = await Promise.all([
    getInvoice(invoiceId, workspace.id),
    getInvoiceActivities(invoiceId),
    getFulfillmentItems(workspace.id, { invoiceId }),
    getDefaultTemplate(workspace.id, "invoice"),
    getDeliveryOrdersForInvoice(workspace.id, invoiceId),
    getDocumentLinks(workspace.id, "invoice", invoiceId),
    getAllSuppliers(workspace.id),
  ]);

  if (!invoice) notFound();

  const catalogItemIds = invoice.line_items
    .map((li) => li.catalog_item_id)
    .filter((id): id is string => !!id);
  const packageBreakdowns = await getPackageBreakdowns(workspace.id, catalogItemIds);

  return (
    <InvoiceDetail
      invoice={invoice}
      activities={activities}
      workspace={workspace}
      fulfillmentItems={fulfillmentItems}
      template={template}
      packageBreakdowns={packageBreakdowns}
      deliveryOrders={deliveryOrders}
      links={links}
      suppliers={suppliers}
    />
  );
}
