import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { getAllClients } from "@/features/clients/queries";
import { getAllProjects } from "@/features/projects/queries";
import { getLineItemTemplates } from "@/features/line-items/queries";
import { getActiveCatalogItems, getCatalogItemClientPrices } from "@/features/catalog/queries";
import { ProformaInvoiceBuilder } from "@/features/proforma-invoices/components/proforma-invoice-builder";

export default async function NewProformaInvoicePage({
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

  const [clients, projects, templates, catalogItems, clientPrices] = await Promise.all([
    getAllClients(workspace.id),
    getAllProjects(workspace.id),
    getLineItemTemplates(workspace.id),
    getActiveCatalogItems(workspace.id),
    getCatalogItemClientPrices(workspace.id),
  ]);

  return (
    <ProformaInvoiceBuilder
      clients={clients}
      projects={projects}
      templates={templates}
      catalogItems={catalogItems}
      clientPrices={clientPrices}
      initialClientId={clientId}
    />
  );
}
