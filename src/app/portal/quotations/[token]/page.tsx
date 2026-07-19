import { notFound } from "next/navigation";
import { getQuotationByShareToken } from "@/features/quotations/queries";
import { getPackageBreakdownsForPortal } from "@/features/catalog/queries";
import { QuotationPortalView } from "@/features/quotations/components/portal/quotation-portal-view";

export default async function QuotationPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await getQuotationByShareToken(token);
  if (!result) notFound();

  const catalogItemIds = result.quotation.line_items
    .map((li) => li.catalog_item_id)
    .filter((id): id is string => !!id);
  const packageBreakdowns = await getPackageBreakdownsForPortal(
    result.quotation.workspace_id,
    catalogItemIds
  );

  return (
    <QuotationPortalView
      shareToken={token}
      quotation={result.quotation}
      workspaceName={result.workspaceName}
      packageBreakdowns={packageBreakdowns}
    />
  );
}
