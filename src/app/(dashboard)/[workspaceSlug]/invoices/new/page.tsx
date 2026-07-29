import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { getAllClients } from "@/features/clients/queries";
import { getLineItemTemplates } from "@/features/line-items/queries";
import { getActiveCatalogItems, getCatalogItemClientPrices } from "@/features/catalog/queries";
import { getAllProjects } from "@/features/projects/queries";
import { InvoiceBuilder } from "@/features/invoices/components/invoice-builder";
import type { DefaultTerms } from "@/features/templates/types";

export default async function NewInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ clientId?: string; projectId?: string }>;
}) {
  const { workspaceSlug } = await params;
  const { clientId, projectId } = await searchParams;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const [clients, templates, catalogItems, projects, clientPrices] = await Promise.all([
    getAllClients(workspace.id),
    getLineItemTemplates(workspace.id),
    getActiveCatalogItems(workspace.id),
    getAllProjects(workspace.id),
    getCatalogItemClientPrices(workspace.id),
  ]);

  const defaultTerms = (workspace.settings?.default_terms ?? {}) as DefaultTerms;

  return (
    <InvoiceBuilder
      clients={clients}
      projects={projects}
      templates={templates}
      catalogItems={catalogItems}
      clientPrices={clientPrices}
      initialClientId={clientId}
      initialProjectId={projectId}
      defaultPaymentTerms={defaultTerms.invoice_payment_terms}
      defaultNotes={defaultTerms.invoice_notes}
    />
  );
}
