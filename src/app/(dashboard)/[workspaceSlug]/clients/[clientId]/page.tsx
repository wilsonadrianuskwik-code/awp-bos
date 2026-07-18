import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import {
  getClient,
  getClientActivities,
} from "@/features/clients/queries";
import { getQuotationsByClient } from "@/features/quotations/queries";
import { getInvoicesByClient } from "@/features/invoices/queries";
import { getPayments } from "@/features/payments/queries";
import { getFulfillmentItems } from "@/features/fulfillment/queries";
import { ClientDetail } from "@/features/clients/components/client-detail";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; clientId: string }>;
}) {
  const { workspaceSlug, clientId } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const [client, activities, quotations, invoices, { payments }, { items: fulfillmentItems }] =
    await Promise.all([
      getClient(clientId, workspace.id),
      getClientActivities(clientId),
      getQuotationsByClient(clientId, workspace.id),
      getInvoicesByClient(clientId, workspace.id),
      getPayments(workspace.id, { clientId, pageSize: 500 }),
      getFulfillmentItems(workspace.id, { clientId }),
    ]);

  if (!client) notFound();

  return (
    <ClientDetail
      client={client}
      activities={activities}
      quotations={quotations}
      invoices={invoices}
      payments={payments}
      fulfillmentItems={fulfillmentItems}
    />
  );
}
