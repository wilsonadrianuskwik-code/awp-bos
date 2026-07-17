import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { MetricsRibbon, type RibbonMetric } from "@/components/shared/metrics-ribbon";
import { PageHeader } from "@/components/shared/page-header";
import { CatalogList } from "@/features/catalog/components/catalog-list";
import { getCatalogItems } from "@/features/catalog/queries";
import { getWorkspaceBySlug, getWorkspaceContext } from "@/lib/workspace";
import { hasMinRole, type Role } from "@/lib/constants/roles";

export default async function CatalogPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const [items, context] = await Promise.all([
    getCatalogItems(workspace.id),
    getWorkspaceContext(workspaceSlug),
  ]);
  const canManage = !!context && hasMinRole(context.role as Role, "staff");

  const activeCount = items.filter((i) => i.is_active).length;
  const productCount = items.filter((i) => i.item_type === "product").length;
  const serviceCount = items.filter((i) => i.item_type === "service").length;

  const metrics: RibbonMetric[] = [
    {
      label: "Total Items",
      value: String(items.length),
      description: `${activeCount} active`,
    },
    {
      label: "Products",
      value: String(productCount),
    },
    {
      label: "Services",
      value: String(serviceCount),
    },
  ];

  const newItemButton = (
    <Button asChild>
      <Link href={`/${workspaceSlug}/catalog/new`}>
        <Plus className="mr-2 h-4 w-4" />
        New Item
      </Link>
    </Button>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Catalog"
        description="Manage the products and services you sell"
        action={canManage ? newItemButton : undefined}
      />

      {items.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No catalog items yet"
          description="Create your first product or service."
          action={canManage ? newItemButton : undefined}
        />
      ) : (
        <>
          <MetricsRibbon metrics={metrics} />
          <CatalogList items={items} />
        </>
      )}
    </div>
  );
}
