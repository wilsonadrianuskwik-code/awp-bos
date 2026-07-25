import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { getAllClients } from "@/features/clients/queries";
import { getWorkspaceMembers } from "@/features/workspace/queries";
import { ProjectForm } from "@/features/projects/components/project-form";

export default async function NewProjectPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const [clients, members] = await Promise.all([
    getAllClients(workspace.id),
    getWorkspaceMembers(workspace.id),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <ProjectForm clients={clients} members={members} />
    </div>
  );
}
