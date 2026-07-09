import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import {
  getClient,
  getClientActivities,
} from "@/features/clients/queries";
import { ClientDetail } from "@/features/clients/components/client-detail";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; clientId: string }>;
}) {
  const { workspaceSlug, clientId } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const [client, activities] = await Promise.all([
    getClient(clientId, workspace.id),
    getClientActivities(clientId),
  ]);

  if (!client) notFound();

  return <ClientDetail client={client} activities={activities} />;
}
