import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { PageHeader } from "@/components/shared/page-header";
import { NewDeliveryOrderForm } from "@/features/delivery-orders/components/new-delivery-order-form";
import type { PostalAddress } from "@/features/documents/address";

export default async function NewDeliveryOrderRoute({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const supabase = await createClient();
  const { data: invoices } = await supabase
    .from("invoices")
    // Site and client addresses come along so the form can offer them as
    // the delivery destination without a second round trip.
    .select(
      "id, invoice_number, client:clients(name,address), project:projects(code,name,site_address)"
    )
    .eq("workspace_id", workspace.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);

  const invoiceOptions = (invoices ?? []).map((inv) => {
    const client = inv.client as unknown as
      | { name: string; address: PostalAddress }
      | null;
    const project = inv.project as unknown as
      | { code: string; name: string; site_address: PostalAddress }
      | null;
    return {
      id: inv.id,
      invoice_number: inv.invoice_number,
      client_name: client?.name ?? null,
      client_address: client?.address ?? null,
      project_label: project ? `${project.code} — ${project.name}` : null,
      site_address: project?.site_address ?? null,
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader title="New Delivery Order" description="Create a delivery order against an existing invoice" />
      <NewDeliveryOrderForm workspaceId={workspace.id} workspaceSlug={workspaceSlug} invoices={invoiceOptions} />
    </div>
  );
}
