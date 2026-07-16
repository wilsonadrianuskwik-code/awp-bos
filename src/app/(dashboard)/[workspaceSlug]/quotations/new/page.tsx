import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { getClients } from "@/features/clients/queries";
import { getLineItemTemplates } from "@/features/line-items/queries";
import { getActiveCatalogItems } from "@/features/catalog/queries";
import { QuotationBuilder } from "@/features/quotations/components/quotation-builder";
import type { DefaultTerms } from "@/features/templates/types";

export default async function NewQuotationPage({
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
    getActiveCatalogItems(workspace.id),
  ]);

  const defaultTerms = (workspace.settings?.default_terms ?? {}) as DefaultTerms;

  return (
    <QuotationBuilder
      clients={clients}
      templates={templates}
      catalogItems={catalogItems}
      initialClientId={clientId}
      defaultTermsAndConditions={defaultTerms.quotation_terms_and_conditions}
      defaultNotes={defaultTerms.quotation_notes}
    />
  );
}
