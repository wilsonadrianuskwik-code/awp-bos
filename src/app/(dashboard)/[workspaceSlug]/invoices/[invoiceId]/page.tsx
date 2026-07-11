import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { getInvoice, getInvoiceActivities } from "@/features/invoices/queries";
import { InvoiceDetail } from "@/features/invoices/components/invoice-detail";

export default async function InvoiceDetailRoute({
  params,
}: {
  params: Promise<{ workspaceSlug: string; invoiceId: string }>;
}) {
  const { workspaceSlug, invoiceId } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const [invoice, activities] = await Promise.all([
    getInvoice(invoiceId, workspace.id),
    getInvoiceActivities(invoiceId),
  ]);

  if (!invoice) notFound();

  return (
    <InvoiceDetail
      invoice={invoice}
      activities={activities}
      workspaceName={workspace.name}
    />
  );
}
