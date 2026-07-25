import { notFound, redirect } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { getAllClients } from "@/features/clients/queries";
import { getAllProjects } from "@/features/projects/queries";
import { getProformaInvoice } from "@/features/proforma-invoices/queries";
import { getLineItemTemplates } from "@/features/line-items/queries";
import { getActiveCatalogItems } from "@/features/catalog/queries";
import { ProformaInvoiceBuilder } from "@/features/proforma-invoices/components/proforma-invoice-builder";
import { isEditableStatus } from "@/features/proforma-invoices/helpers";

export default async function EditProformaInvoicePage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; piId: string }>;
}) {
  const { workspaceSlug, piId } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const proformaInvoice = await getProformaInvoice(piId, workspace.id);
  if (!proformaInvoice) notFound();

  if (!isEditableStatus(proformaInvoice.status)) {
    redirect(`/${workspaceSlug}/proforma-invoices/${piId}`);
  }

  const [clients, projects, templates, catalogItems] = await Promise.all([
    getAllClients(workspace.id),
    getAllProjects(workspace.id),
    getLineItemTemplates(workspace.id),
    getActiveCatalogItems(workspace.id),
  ]);

  return (
    <ProformaInvoiceBuilder
      proformaInvoice={proformaInvoice}
      clients={clients}
      projects={projects}
      templates={templates}
      catalogItems={catalogItems}
    />
  );
}
