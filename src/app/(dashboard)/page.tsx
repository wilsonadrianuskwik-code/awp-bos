import { redirect } from "next/navigation";
import { getUserWorkspaces } from "@/features/workspace/queries";
import { CreateWorkspaceForm } from "@/features/workspace/components/create-workspace-form";

export default async function DashboardRootPage() {
  const workspaces = await getUserWorkspaces();

  if (workspaces.length > 0) {
    redirect(`/${workspaces[0].slug}`);
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <CreateWorkspaceForm />
    </div>
  );
}
