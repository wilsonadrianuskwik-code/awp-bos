import { notFound } from "next/navigation";
import { getWorkspaceBySlug } from "@/lib/workspace";
import { getSupplier } from "@/features/suppliers/queries";
import { SupplierForm } from "@/features/suppliers/components/supplier-form";

export default async function EditSupplierPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; supplierId: string }>;
}) {
  const { workspaceSlug, supplierId } = await params;
  const workspace = await getWorkspaceBySlug(workspaceSlug);
  if (!workspace) notFound();

  const supplier = await getSupplier(supplierId, workspace.id);
  if (!supplier) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <SupplierForm supplier={supplier} />
    </div>
  );
}
