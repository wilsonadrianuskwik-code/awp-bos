import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { getAllClients } from "@/features/clients/queries";
import { FulfillmentWorkspace } from "@/features/fulfillment-projects/components/fulfillment-workspace";

export default async function FulfillmentProjectsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const clients = await getAllClients(workspace.id);

  return (
    <FulfillmentWorkspace
      clients={clients}
      invoiceEligible={false}
      project={null}
      trackers={[]}
      deliverables={[]}
      members={[]}
      activities={[]}
    />
  );
}
