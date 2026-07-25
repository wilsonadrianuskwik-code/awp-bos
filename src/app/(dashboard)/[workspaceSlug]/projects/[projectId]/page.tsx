import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import {
  getProjectById,
  getProjectActivities,
  getProjectDocuments,
  getProjectHealth,
} from "@/features/projects/queries";
import { getClient } from "@/features/clients/queries";
import { ProjectDetail } from "@/features/projects/components/project-detail";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; projectId: string }>;
}) {
  const { workspaceSlug, projectId } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const project = await getProjectById(projectId, workspace.id);
  if (!project) notFound();

  const [client, activities, documents, health] = await Promise.all([
    project.client_id ? getClient(project.client_id, workspace.id) : Promise.resolve(null),
    getProjectActivities(projectId),
    getProjectDocuments(projectId, workspace.id),
    getProjectHealth(projectId, workspace.id),
  ]);

  return (
    <ProjectDetail
      project={project}
      client={client}
      activities={activities}
      documents={documents}
      health={health}
    />
  );
}
