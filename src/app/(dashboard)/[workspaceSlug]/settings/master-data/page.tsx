import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { PageHeader } from "@/components/shared/page-header";
import { getSimpleLookups, type LookupType } from "@/features/master-data/queries";
import { MasterDataPanel } from "@/features/master-data/components/master-data-panel";

const TYPES: LookupType[] = ["unit_of_measure", "tax_rate", "payment_term", "brand"];

export default async function MasterDataSettingsRoute({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const lookups = await getSimpleLookups(workspace.id);
  const initialByType = Object.fromEntries(
    TYPES.map((type) => [type, lookups.filter((l) => l.lookup_type === type)])
  ) as Record<LookupType, typeof lookups>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Master Data"
        description="Units of measure, tax rates, payment terms, and brands used across quotations, invoices, and purchase orders"
      />
      <MasterDataPanel workspaceId={workspace.id} initialByType={initialByType} />
    </div>
  );
}
