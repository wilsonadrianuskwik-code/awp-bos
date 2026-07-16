import { notFound } from "next/navigation";
import { getWorkspaceBySlug, getWorkspaceContext } from "@/lib/workspace";
import { WorkspaceProvider } from "@/providers/workspace-provider";
import { WorkspaceShell } from "@/features/workspace/components/workspace-shell";
import type { Role } from "@/lib/constants/roles";
import type { WorkspaceDocumentSettings } from "@/features/templates/types";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;

  const [workspace, context] = await Promise.all([
    getWorkspaceBySlug(workspaceSlug),
    getWorkspaceContext(workspaceSlug),
  ]);

  if (!workspace || !context) notFound();

  return (
    <WorkspaceProvider
      workspace={{
        ...workspace,
        settings: (workspace.settings ?? {}) as WorkspaceDocumentSettings,
      }}
      role={context.role as Role}
    >
      <WorkspaceShell
        workspaceSlug={workspaceSlug}
        workspaceName={workspace.name}
      >
        {children}
      </WorkspaceShell>
    </WorkspaceProvider>
  );
}
