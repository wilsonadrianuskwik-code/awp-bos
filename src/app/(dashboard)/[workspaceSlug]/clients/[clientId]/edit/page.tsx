import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { getClient } from "@/features/clients/queries";
import { ClientForm } from "@/features/clients/components/client-form";

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; clientId: string }>;
}) {
  const { workspaceSlug, clientId } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const client = await getClient(clientId, workspace.id);
  if (!client) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <ClientForm client={client} />
    </div>
  );
}
