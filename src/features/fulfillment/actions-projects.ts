"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { withWorkspace } from "@/lib/with-workspace";
import {
  updateFulfillmentProjectSchema,
  updateFulfillmentProjectStatusSchema,
  assignFulfillmentProjectSchema,
  createDeliverableSchema,
  rescheduleDeliverableSchema,
  updateDeliverableStatusSchema,
  assignDeliverableSchema,
  bulkUpdateDeliverableStatusSchema,
  bulkRescheduleDeliverablesSchema,
  bulkCreateDeliverablesSchema,
} from "@/features/fulfillment/validators-projects";
import type {
  UpdateFulfillmentProjectInput,
  UpdateFulfillmentProjectStatusInput,
  AssignFulfillmentProjectInput,
  CreateDeliverableInput,
  RescheduleDeliverableInput,
  UpdateDeliverableStatusInput,
  AssignDeliverableInput,
  BulkUpdateDeliverableStatusInput,
  BulkRescheduleDeliverablesInput,
  BulkCreateDeliverablesInput,
} from "@/features/fulfillment/validators-projects";
import type {
  FulfillmentDeliverable,
  FulfillmentProject,
} from "@/features/fulfillment/types-projects";
import { getInvoicesByClient } from "@/features/invoices/queries";
import { getFulfillmentDeliverableActivities } from "@/features/fulfillment/queries-projects";

/**
 * Every mutation below is a thin wrapper around a single Postgres function
 * (see supabase/migrations/00052-00054). Each RPC call is one transaction —
 * activity + audit log writes happen inside the RPC itself, atomically with
 * the mutation they describe, the same pattern src/features/fulfillment/
 * actions.ts already uses. Role checks are re-verified inside every RPC as
 * defense in depth even though withWorkspace already gates staff+ here
 * (the two status RPCs additionally gate their "Reopen" transition to
 * admin+ inside the RPC itself).
 */

// Read wrapper so the Client -> Invoice picker can lazily load a client's
// invoices on selection, without a full page navigation — same pattern as
// getFulfillmentEventsAction in src/features/fulfillment/actions.ts.
export async function getInvoicesForClientAction(
  workspaceId: string,
  clientId: string
) {
  return withWorkspace(workspaceId, "viewer", async (ctx) => {
    return getInvoicesByClient(clientId, ctx.workspaceId);
  });
}

// Read wrapper for the contextual right sidebar (Section 9) — fetched
// on-demand when a deliverable is selected, not preloaded for every
// deliverable up front.
export async function getFulfillmentDeliverableActivitiesAction(
  workspaceId: string,
  deliverableId: string
) {
  return withWorkspace(workspaceId, "viewer", async () => {
    return getFulfillmentDeliverableActivities(deliverableId);
  });
}

export async function updateFulfillmentProjectAction(
  workspaceId: string,
  projectId: string,
  input: UpdateFulfillmentProjectInput
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const parsed = updateFulfillmentProjectSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_fulfillment_project", {
      p_project_id: projectId,
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_name: parsed.data.name || null,
      p_start_date: parsed.data.start_date || null,
      p_end_date: parsed.data.end_date || null,
      p_notes: parsed.data.notes || null,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data as unknown as FulfillmentProject;
  });
}

export async function updateFulfillmentProjectStatusAction(
  workspaceId: string,
  projectId: string,
  input: UpdateFulfillmentProjectStatusInput
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const parsed = updateFulfillmentProjectStatusSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_fulfillment_project_status", {
      p_project_id: projectId,
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_new_status: parsed.data.status,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data as unknown as FulfillmentProject;
  });
}

export async function assignFulfillmentProjectAction(
  workspaceId: string,
  projectId: string,
  input: AssignFulfillmentProjectInput
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const parsed = assignFulfillmentProjectSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("assign_fulfillment_project", {
      p_project_id: projectId,
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_assigned_to: parsed.data.assigned_to,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data as unknown as FulfillmentProject;
  });
}

export async function createFulfillmentDeliverableAction(
  workspaceId: string,
  projectId: string,
  input: CreateDeliverableInput
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const parsed = createDeliverableSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_fulfillment_deliverable", {
      p_project_id: projectId,
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_title: parsed.data.title,
      p_scheduled_date: parsed.data.scheduled_date,
      p_description: parsed.data.description || null,
      p_fulfillment_item_id: parsed.data.fulfillment_item_id || null,
      p_assigned_to: parsed.data.assigned_to || null,
      p_notes: parsed.data.notes || null,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data as unknown as FulfillmentDeliverable;
  });
}

export async function rescheduleFulfillmentDeliverableAction(
  workspaceId: string,
  deliverableId: string,
  input: RescheduleDeliverableInput
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const parsed = rescheduleDeliverableSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("reschedule_fulfillment_deliverable", {
      p_deliverable_id: deliverableId,
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_scheduled_date: parsed.data.scheduled_date,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data as unknown as FulfillmentDeliverable;
  });
}

export async function updateFulfillmentDeliverableStatusAction(
  workspaceId: string,
  deliverableId: string,
  input: UpdateDeliverableStatusInput
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const parsed = updateDeliverableStatusSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "update_fulfillment_deliverable_status",
      {
        p_deliverable_id: deliverableId,
        p_workspace_id: ctx.workspaceId,
        p_actor_id: ctx.userId,
        p_new_status: parsed.data.status,
      }
    );

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data as unknown as FulfillmentDeliverable;
  });
}

export async function assignFulfillmentDeliverableAction(
  workspaceId: string,
  deliverableId: string,
  input: AssignDeliverableInput
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const parsed = assignDeliverableSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("assign_fulfillment_deliverable", {
      p_deliverable_id: deliverableId,
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_assigned_to: parsed.data.assigned_to,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data as unknown as FulfillmentDeliverable;
  });
}

export async function bulkUpdateFulfillmentDeliverableStatusAction(
  workspaceId: string,
  input: BulkUpdateDeliverableStatusInput
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const parsed = bulkUpdateDeliverableStatusSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "bulk_update_fulfillment_deliverable_status",
      {
        p_deliverable_ids: parsed.data.deliverable_ids,
        p_workspace_id: ctx.workspaceId,
        p_actor_id: ctx.userId,
        p_new_status: parsed.data.status,
      }
    );

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return (data ?? []) as unknown as FulfillmentDeliverable[];
  });
}

export async function bulkRescheduleFulfillmentDeliverablesAction(
  workspaceId: string,
  input: BulkRescheduleDeliverablesInput
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const parsed = bulkRescheduleDeliverablesSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "bulk_reschedule_fulfillment_deliverables",
      {
        p_deliverable_ids: parsed.data.deliverable_ids,
        p_workspace_id: ctx.workspaceId,
        p_actor_id: ctx.userId,
        p_scheduled_date: parsed.data.scheduled_date,
      }
    );

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return (data ?? []) as unknown as FulfillmentDeliverable[];
  });
}

// Backs the Generate Schedule wizard — the sole entry point for generating
// deliverables. Accepts an explicit, already-computed (and possibly
// hand-edited) row list so it can represent every schedule method,
// including "Custom" and an edited preview, which a fixed frequency/count
// pair cannot.
export async function bulkCreateFulfillmentDeliverablesAction(
  workspaceId: string,
  projectId: string,
  input: BulkCreateDeliverablesInput
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const parsed = bulkCreateDeliverablesSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "bulk_create_fulfillment_deliverables",
      {
        p_project_id: projectId,
        p_workspace_id: ctx.workspaceId,
        p_actor_id: ctx.userId,
        p_items: parsed.data.items.map((item) => ({
          title: item.title,
          scheduled_date: item.scheduled_date,
          description: item.description || null,
          fulfillment_item_id: item.fulfillment_item_id || null,
          assigned_to: item.assigned_to || null,
        })),
      }
    );

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return (data ?? []) as unknown as FulfillmentDeliverable[];
  });
}

export async function deleteFulfillmentDeliverableAction(
  workspaceId: string,
  deliverableId: string
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("delete_fulfillment_deliverable", {
      p_deliverable_id: deliverableId,
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data as { success: true; id: string };
  });
}
