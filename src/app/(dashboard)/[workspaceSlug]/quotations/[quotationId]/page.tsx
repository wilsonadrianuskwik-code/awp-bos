import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import {
  getQuotation,
  getQuotationActivities,
  getQuotationVersions,
} from "@/features/quotations/queries";
import { QuotationDetail } from "@/features/quotations/components/quotation-detail";
import { getDefaultTemplate } from "@/features/templates/queries";

export default async function QuotationDetailRoute({
  params,
}: {
  params: Promise<{ workspaceSlug: string; quotationId: string }>;
}) {
  const { workspaceSlug, quotationId } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const [quotation, activities, versions, template] = await Promise.all([
    getQuotation(quotationId, workspace.id),
    getQuotationActivities(quotationId),
    getQuotationVersions(quotationId, workspace.id),
    getDefaultTemplate(workspace.id, "quotation"),
  ]);

  if (!quotation) notFound();

  const currentIndex = versions.findIndex((v) => v.id === quotation.id);
  const previousVersionSummary =
    currentIndex > 0 ? versions[currentIndex - 1] : null;

  const previousVersion = previousVersionSummary
    ? await getQuotation(previousVersionSummary.id, workspace.id)
    : null;

  return (
    <QuotationDetail
      quotation={quotation}
      activities={activities}
      versions={versions}
      previousVersion={previousVersion}
      workspace={workspace}
      template={template}
    />
  );
}
