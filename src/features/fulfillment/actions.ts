"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { withWorkspace } from "@/lib/with-workspace";
import { getFulfillmentEvents } from "@/features/fulfillment/queries";
import {
  recordFulfillmentEventSchema,
  updateFulfillmentStatusSchema,
} from "@/features/fulfillment/validators";
import type {
  RecordFulfillmentEventInput,
  UpdateFulfillmentStatusInput,
} from "@/features/fulfillment/validators";
import type { FulfillmentItem } from "@/features/fulfillment/types";

/**
 * Every mutation below is a thin wrapper around a single Postgres function
 * (see supabase/migrations/00030_create_fulfillment.sql). Each RPC call is
 * one transaction — activity + audit log writes happen inside the RPC
 * itself, atomically with the mutation they describe, the same pattern
 * invoices/actions.ts already uses. Role checks are re-verified inside
 * every RPC as defense in depth even though withWorkspace already gates
 * staff+ here (update_fulfillment_status additionally gates the "Reopen"
 * transition to admin+ inside the RPC itself).
 */

// Read wrapper so the cockpit's client components can lazily fetch a
// tracker's delivery history on demand (when a card's timeline is expanded)
// instead of fetching every tracker's events up front. RLS already scopes
// events to workspace members, and the read is open to all roles.
export async function getFulfillmentEventsAction(
  workspaceId: string,
  fulfillmentItemId: string
) {
  return withWorkspace(workspaceId, "viewer", async () => {
    return getFulfillmentEvents(fulfillmentItemId);
  });
}

// Idempotent — safe to call on every fulfillment-page load. Returns the
// number of newly-created trackers.
export async function syncFulfillmentItemsAction(workspaceId: string) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("sync_fulfillment_items", {
      p_workspace_id: ctx.workspaceId,
    });

    if (error) throw new Error(error.message);
    return data as number;
  });
}

export async function createFulfillmentItemAction(
  workspaceId: string,
  lineItemId: string
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_fulfillment_item", {
      p_line_item_id: lineItemId,
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data as unknown as FulfillmentItem;
  });
}

export async function recordFulfillmentEventAction(
  workspaceId: string,
  fulfillmentItemId: string,
  input: RecordFulfillmentEventInput
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const parsed = recordFulfillmentEventSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("record_fulfillment_event", {
      p_fulfillment_item_id: fulfillmentItemId,
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_quantity_delivered: parsed.data.quantity_delivered,
      p_event_date: parsed.data.event_date,
      p_notes: parsed.data.notes || null,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data as unknown as FulfillmentItem;
  });
}

export async function deleteFulfillmentEventAction(
  workspaceId: string,
  eventId: string
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("delete_fulfillment_event", {
      p_event_id: eventId,
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data as { success: true; id: string };
  });
}

export async function updateFulfillmentStatusAction(
  workspaceId: string,
  fulfillmentItemId: string,
  input: UpdateFulfillmentStatusInput
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const parsed = updateFulfillmentStatusSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_fulfillment_status", {
      p_fulfillment_item_id: fulfillmentItemId,
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_new_status: parsed.data.status,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data as unknown as FulfillmentItem;
  });
}
