import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { getSupplier, getSupplierActivities } from "@/features/suppliers/queries";
import { SupplierDetail } from "@/features/suppliers/components/supplier-detail";

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; supplierId: string }>;
}) {
  const { workspaceSlug, supplierId } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const [supplier, activities] = await Promise.all([
    getSupplier(supplierId, workspace.id),
    getSupplierActivities(supplierId),
  ]);

  if (!supplier) notFound();

  return <SupplierDetail supplier={supplier} activities={activities} />;
}
