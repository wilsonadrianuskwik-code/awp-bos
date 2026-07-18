import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { getAllClients } from "@/features/clients/queries";
import { getLineItemTemplates } from "@/features/line-items/queries";
import { getActiveCatalogItems } from "@/features/catalog/queries";
import { InvoiceBuilder } from "@/features/invoices/components/invoice-builder";
import type { DefaultTerms } from "@/features/templates/types";

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
    getAllClients(workspace.id),
    getLineItemTemplates(workspace.id),
    getActiveCatalogItems(workspace.id),
  ]);

  const defaultTerms = (workspace.settings?.default_terms ?? {}) as DefaultTerms;

  return (
    <InvoiceBuilder
      clients={clients}
      templates={templates}
      catalogItems={catalogItems}
      initialClientId={clientId}
      defaultPaymentTerms={defaultTerms.invoice_payment_terms}
      defaultNotes={defaultTerms.invoice_notes}
    />
  );
}
