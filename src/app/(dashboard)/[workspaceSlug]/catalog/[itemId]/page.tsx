import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import {
  getCatalogItem,
  getCatalogItemActivities,
  getCatalogItemClientPricesForItem,
  getCatalogItemUsage,
} from "@/features/catalog/queries";
import { getAllClients } from "@/features/clients/queries";
import { CatalogDetail } from "@/features/catalog/components/catalog-detail";

export default async function CatalogItemDetailPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; itemId: string }>;
}) {
  const { workspaceSlug, itemId } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const [item, activities, usage, clients, clientPrices] = await Promise.all([
    getCatalogItem(itemId, workspace.id),
    getCatalogItemActivities(itemId),
    getCatalogItemUsage(itemId),
    getAllClients(workspace.id),
    getCatalogItemClientPricesForItem(itemId, workspace.id),
  ]);

  if (!item) notFound();

  return (
    <CatalogDetail
      item={item}
      activities={activities}
      usage={usage}
      clients={clients}
      clientPrices={clientPrices}
    />
  );
}
