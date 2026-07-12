import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import {
  getCatalogItem,
  getCatalogItemActivities,
} from "@/features/catalog/queries";
import { CatalogDetail } from "@/features/catalog/components/catalog-detail";

export default async function CatalogItemDetailPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; itemId: string }>;
}) {
  const { workspaceSlug, itemId } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const [item, activities] = await Promise.all([
    getCatalogItem(itemId, workspace.id),
    getCatalogItemActivities(itemId),
  ]);

  if (!item) notFound();

  return <CatalogDetail item={item} activities={activities} />;
}
