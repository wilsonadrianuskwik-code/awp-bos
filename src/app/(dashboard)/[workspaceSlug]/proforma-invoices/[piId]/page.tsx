import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import {
  getProformaInvoice,
  getProformaInvoiceActivities,
  getProformaInvoiceRelationships,
} from "@/features/proforma-invoices/queries";
import { ProformaInvoiceDetail } from "@/features/proforma-invoices/components/proforma-invoice-detail";

export default async function ProformaInvoiceDetailRoute({
  params,
}: {
  params: Promise<{ workspaceSlug: string; piId: string }>;
}) {
  const { workspaceSlug, piId } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const [proformaInvoice, activities, relationships] = await Promise.all([
    getProformaInvoice(piId, workspace.id),
    getProformaInvoiceActivities(piId),
    getProformaInvoiceRelationships(workspace.id, piId),
  ]);

  if (!proformaInvoice) notFound();

  return (
    <ProformaInvoiceDetail
      proformaInvoice={proformaInvoice}
      activities={activities}
      relationships={relationships}
    />
  );
}
