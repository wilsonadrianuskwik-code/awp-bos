import { notFound } from "next/navigation";
import { getQuotationByShareToken } from "@/features/quotations/queries";
import { QuotationPortalView } from "@/features/quotations/components/portal/quotation-portal-view";

export default async function QuotationPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await getQuotationByShareToken(token);
  if (!result) notFound();

  return (
    <QuotationPortalView
      shareToken={token}
      quotation={result.quotation}
      workspaceName={result.workspaceName}
    />
  );
}
