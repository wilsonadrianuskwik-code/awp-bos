import Link from "next/link";
import { Plus, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { ClientList } from "@/features/clients/components/client-list";
import { getClients } from "@/features/clients/queries";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { notFound } from "next/navigation";

export default async function ClientsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const clients = await getClients(workspace.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clients"
        description="Manage your client relationships"
        action={
          <Button asChild>
            <Link href={`/${workspaceSlug}/clients/new`}>
              <Plus className="mr-2 h-4 w-4" />
              New Client
            </Link>
          </Button>
        }
      />

      {clients.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No clients yet"
          description="Create your first client or convert a lead."
          action={
            <Button asChild>
              <Link href={`/${workspaceSlug}/clients/new`}>
                <Plus className="mr-2 h-4 w-4" />
                New Client
              </Link>
            </Button>
          }
        />
      ) : (
        <ClientList clients={clients} />
      )}
    </div>
  );
}
