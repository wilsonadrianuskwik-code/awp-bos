import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import {
  getFulfillmentEvents,
  getFulfillmentItem,
} from "@/features/fulfillment/queries";
import { FulfillmentDetail } from "@/features/fulfillment/components/fulfillment-detail";

export default async function FulfillmentDetailRoute({
  params,
}: {
  params: Promise<{ workspaceSlug: string; fulfillmentItemId: string }>;
}) {
  const { workspaceSlug, fulfillmentItemId } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const item = await getFulfillmentItem(workspace.id, fulfillmentItemId);
  if (!item) notFound();

  const events = await getFulfillmentEvents(fulfillmentItemId);

  return <FulfillmentDetail item={item} events={events} />;
}
