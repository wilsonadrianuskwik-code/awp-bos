import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { PageHeader } from "@/components/shared/page-header";
import { NewDeliveryOrderForm } from "@/features/delivery-orders/components/new-delivery-order-form";

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
    .select("id, invoice_number, client:clients(name)")
    .eq("workspace_id", workspace.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);

  const invoiceOptions = (invoices ?? []).map((inv) => ({
    id: inv.id,
    invoice_number: inv.invoice_number,
    client_name: (inv.client as unknown as { name: string } | null)?.name ?? null,
  }));

  return (
    <div className="space-y-6">
      <PageHeader title="New Delivery Order" description="Create a delivery order against an existing invoice" />
      <NewDeliveryOrderForm workspaceId={workspace.id} workspaceSlug={workspaceSlug} invoices={invoiceOptions} />
    </div>
  );
}
