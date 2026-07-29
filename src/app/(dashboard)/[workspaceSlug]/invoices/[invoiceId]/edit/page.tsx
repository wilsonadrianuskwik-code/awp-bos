import { notFound, redirect } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { getAllClients } from "@/features/clients/queries";
import { getInvoice } from "@/features/invoices/queries";
import { getLineItemTemplates } from "@/features/line-items/queries";
import { getActiveCatalogItems, getCatalogItemClientPrices } from "@/features/catalog/queries";
import { getAllProjects } from "@/features/projects/queries";
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

  // Mirrors update_invoice (00087): only money having moved against the
  // invoice locks it, not it having been sent.
  const locked =
    ["cancelled", "refunded"].includes(invoice.status) ||
    (invoice.amount_paid ?? 0) > 0;
  if (locked) {
    redirect(`/${workspaceSlug}/invoices/${invoiceId}`);
  }

  const [clients, templates, catalogItems, projects, clientPrices] = await Promise.all([
    getAllClients(workspace.id),
    getLineItemTemplates(workspace.id),
    getActiveCatalogItems(workspace.id),
    getAllProjects(workspace.id),
    getCatalogItemClientPrices(workspace.id),
  ]);

  return (
    <InvoiceBuilder
      invoice={invoice}
      clients={clients}
      projects={projects}
      templates={templates}
      catalogItems={catalogItems}
      clientPrices={clientPrices}
    />
  );
}
