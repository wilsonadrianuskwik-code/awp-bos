import { notFound, redirect } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { getAllClients } from "@/features/clients/queries";
import { getQuotation } from "@/features/quotations/queries";
import { getLineItemTemplates } from "@/features/line-items/queries";
import { getActiveCatalogItems } from "@/features/catalog/queries";
import { QuotationBuilder } from "@/features/quotations/components/quotation-builder";
import { isEditableStatus } from "@/features/quotations/helpers";

export default async function EditQuotationPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; quotationId: string }>;
}) {
  const { workspaceSlug, quotationId } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const quotation = await getQuotation(quotationId, workspace.id);
  if (!quotation) notFound();

  if (!isEditableStatus(quotation.status)) {
    redirect(`/${workspaceSlug}/quotations/${quotationId}`);
  }

  const [clients, templates, catalogItems] = await Promise.all([
    getAllClients(workspace.id),
    getLineItemTemplates(workspace.id),
    getActiveCatalogItems(workspace.id),
  ]);

  return (
    <QuotationBuilder
      quotation={quotation}
      clients={clients}
      templates={templates}
      catalogItems={catalogItems}
    />
  );
}
