"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { withWorkspace } from "@/lib/with-workspace";
import type { CreateDeliveryOrderInput, DeliveryOrderStatus } from "@/features/delivery-orders/types";

export async function createDeliveryOrder(workspaceId: string, input: CreateDeliveryOrderInput) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_delivery_order", {
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_input: {
        invoice_id: input.invoice_id,
        project_id: input.project_id ?? null,
        delivery_date: input.delivery_date ?? null,
        delivery_address: input.delivery_address ?? null,
        notes: input.notes ?? null,
        line_items: input.line_items,
      },
    });
    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}/delivery-orders`);
    revalidatePath(`/${ctx.workspaceSlug}/invoices/${input.invoice_id}`);
    return data;
  });
}

export async function updateDeliveryOrderStatus(
  workspaceId: string,
  deliveryOrderId: string,
  status: DeliveryOrderStatus,
  receivedBy?: string
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_delivery_order_status", {
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_do_id: deliveryOrderId,
      p_status: status,
      p_received_by: receivedBy ?? null,
    });
    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}/delivery-orders`);
    revalidatePath(`/${ctx.workspaceSlug}/delivery-orders/${deliveryOrderId}`);
    return data;
  });
}

export async function deleteDeliveryOrder(workspaceId: string, deliveryOrderId: string) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("delete_delivery_order", {
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_do_id: deliveryOrderId,
    });
    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}/delivery-orders`);
    return data;
  });
}
