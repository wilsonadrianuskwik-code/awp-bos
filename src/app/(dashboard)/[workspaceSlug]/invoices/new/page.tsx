import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { getClients } from "@/features/clients/queries";
import { getLineItemTemplates } from "@/features/line-items/queries";
import { getCatalogItems } from "@/features/catalog/queries";
import { InvoiceBuilder } from "@/features/invoices/components/invoice-builder";

export default async function NewInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ clientId?: string }>;
}) {
  const { workspaceSlug } = await params;
  const { clientId } = await searchParams;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const [clients, templates, catalogItems] = await Promise.all([
    getClients(workspace.id),
    getLineItemTemplates(workspace.id),
    getCatalogItems(workspace.id),
  ]);

  return (
    <InvoiceBuilder
      clients={clients}
      templates={templates}
      catalogItems={catalogItems}
      initialClientId={clientId}
    />
  );
}
