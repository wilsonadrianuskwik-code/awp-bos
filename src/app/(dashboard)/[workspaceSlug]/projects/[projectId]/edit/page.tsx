import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { getProjectById } from "@/features/projects/queries";
import { getAllClients } from "@/features/clients/queries";
import { getWorkspaceMembers } from "@/features/workspace/queries";
import { ProjectForm } from "@/features/projects/components/project-form";

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const project = await getProjectById(projectId, workspace.id);
  if (!project) notFound();

  const [clients, members] = await Promise.all([
    getAllClients(workspace.id),
    getWorkspaceMembers(workspace.id),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <ProjectForm project={project} clients={clients} members={members} />
    </div>
  );
}
