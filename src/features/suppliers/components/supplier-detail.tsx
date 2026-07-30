"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DetailHeader } from "@/components/shared/detail-header";
import { FieldList, DetailItem } from "@/components/shared/detail-item";
import { ActivityTimeline } from "@/features/activities/components/activity-timeline";
import { useWorkspace } from "@/providers/workspace-provider";
import { useToast } from "@/providers/toast-provider";
import { useConfirm } from "@/providers/confirm-provider";
import { deleteSupplier } from "@/features/suppliers/actions";
import type { Supplier } from "@/features/suppliers/types";
import type { Activity } from "@/features/activities/types";

function formatAddress(address: Supplier["address"]) {
  if (!address) return null;
  return [address.line1, address.city, address.state, address.postal_code, address.country]
    .filter(Boolean)
    .join(", ");
}

type SupplierDetailProps = {
  supplier: Supplier;
  activities: Activity[];
};

export function SupplierDetail({ supplier, activities }: SupplierDetailProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { workspace } = useWorkspace();
  const { toast } = useToast();
  const confirm = useConfirm();

  async function handleDelete() {
    const ok = await confirm({
      title: "Delete this supplier?",
      description: "This can't be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;

    startTransition(async () => {
      const result = await deleteSupplier(workspace.id, supplier.id);
      if (result.error) {
        toast(result.error, "error");
        return;
      }
      toast("Supplier deleted", "success");
      router.push(`/${workspace.slug}/suppliers`);
    });
  }

  return (
    <div className="space-y-6">
      <DetailHeader
        backHref={`/${workspace.slug}/suppliers`}
        backLabel="Back to Suppliers"
        title={supplier.name}
        subtitle={
          [supplier.company, supplier.email].filter(Boolean).join(" · ") || undefined
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={`/${workspace.slug}/suppliers/${supplier.id}/edit`}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </Link>
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isPending}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldList>
                <DetailItem label="Email" value={supplier.email} />
                <DetailItem label="Phone" value={supplier.phone} />
                <DetailItem label="Company" value={supplier.company} />
                <DetailItem label="Website" value={supplier.website} />
                <DetailItem label="Address" value={formatAddress(supplier.address)} />
              </FieldList>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Billing</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldList>
                <DetailItem label="Billing Email" value={supplier.billing_email} />
                <DetailItem label="Tax ID" value={supplier.tax_id} />
                <DetailItem label="Payment Terms" value={`${supplier.payment_terms} days`} />
              </FieldList>
              {supplier.notes && (
                <div className="mt-4 border-t pt-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Notes
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{supplier.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityTimeline activities={activities} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
