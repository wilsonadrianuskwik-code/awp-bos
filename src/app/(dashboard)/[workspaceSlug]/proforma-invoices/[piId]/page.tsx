import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import {
  getProformaInvoice,
  getProformaInvoiceActivities,
} from "@/features/proforma-invoices/queries";
import { getDocumentLinks } from "@/features/documents/queries";
import { ProformaInvoiceDetail } from "@/features/proforma-invoices/components/proforma-invoice-detail";

export default async function ProformaInvoiceDetailRoute({
  params,
}: {
  params: Promise<{ workspaceSlug: string; piId: string }>;
}) {
  const { workspaceSlug, piId } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const [proformaInvoice, activities, links] = await Promise.all([
    getProformaInvoice(piId, workspace.id),
    getProformaInvoiceActivities(piId),
    getDocumentLinks(workspace.id, "proforma_invoice", piId),
  ]);

  if (!proformaInvoice) notFound();

  return (
    <ProformaInvoiceDetail
      proformaInvoice={proformaInvoice}
      activities={activities}
      links={links}
      workspaceName={workspace.name}
      logoUrl={workspace.logo_url}
      companyProfile={workspace.settings?.company_profile}
      branding={workspace.settings?.branding}
    />
  );
}
