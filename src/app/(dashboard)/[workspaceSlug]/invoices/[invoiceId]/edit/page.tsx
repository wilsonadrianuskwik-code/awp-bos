import { notFound, redirect } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { getAllClients } from "@/features/clients/queries";
import { getInvoice } from "@/features/invoices/queries";
import { getLineItemTemplates } from "@/features/line-items/queries";
import { getActiveCatalogItems } from "@/features/catalog/queries";
import { InvoiceBuilder } from "@/features/invoices/components/invoice-builder";

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; invoiceId: string }>;
}) {
  const { workspaceSlug, invoiceId } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const invoice = await getInvoice(invoiceId, workspace.id);
  if (!invoice) notFound();

  if (invoice.status !== "draft") {
    redirect(`/${workspaceSlug}/invoices/${invoiceId}`);
  }

  const [clients, templates, catalogItems] = await Promise.all([
    getAllClients(workspace.id),
    getLineItemTemplates(workspace.id),
    getActiveCatalogItems(workspace.id),
  ]);

  return (
    <InvoiceBuilder
      invoice={invoice}
      clients={clients}
      templates={templates}
      catalogItems={catalogItems}
    />
  );
}
