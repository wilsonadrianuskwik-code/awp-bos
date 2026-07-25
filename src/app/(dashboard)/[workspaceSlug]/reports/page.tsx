import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { PageHeader } from "@/components/shared/page-header";
import { getAvailableCurrencies } from "@/features/reports/queries";
import { ReportsPage } from "@/features/reports/components/reports-page";

export default async function ReportsRoute({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const availableCurrencies = await getAvailableCurrencies(workspace.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Revenue trends and outstanding balances over time"
      />
      <ReportsPage
        workspaceId={workspace.id}
        workspaceSlug={workspaceSlug}
        availableCurrencies={availableCurrencies}
        defaultCurrency={workspace.default_currency}
      />
    </div>
  );
}
