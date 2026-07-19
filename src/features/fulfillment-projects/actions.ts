"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { withWorkspace } from "@/lib/with-workspace";
import {
  updateFulfillmentProjectSchema,
  updateFulfillmentProjectStatusSchema,
  assignFulfillmentProjectSchema,
  createDeliverableSchema,
  bulkGenerateDeliverablesSchema,
  rescheduleDeliverableSchema,
  updateDeliverableStatusSchema,
} from "@/features/fulfillment-projects/validators";
import type {
  UpdateFulfillmentProjectInput,
  UpdateFulfillmentProjectStatusInput,
  AssignFulfillmentProjectInput,
  CreateDeliverableInput,
  BulkGenerateDeliverablesInput,
  RescheduleDeliverableInput,
  UpdateDeliverableStatusInput,
} from "@/features/fulfillment-projects/validators";
import type {
  FulfillmentDeliverable,
  FulfillmentProject,
} from "@/features/fulfillment-projects/types";
import { getInvoicesByClient } from "@/features/invoices/queries";

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

export async function bulkGenerateFulfillmentDeliverablesAction(
  workspaceId: string,
  projectId: string,
  input: BulkGenerateDeliverablesInput
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const parsed = bulkGenerateDeliverablesSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "bulk_generate_fulfillment_deliverables",
      {
        p_project_id: projectId,
        p_workspace_id: ctx.workspaceId,
        p_actor_id: ctx.userId,
        p_start_date: parsed.data.start_date,
        p_frequency_days: parsed.data.frequency_days,
        p_count: parsed.data.count,
        p_title_template: parsed.data.title_template || null,
        p_fulfillment_item_id: parsed.data.fulfillment_item_id || null,
        p_assigned_to: parsed.data.assigned_to || null,
      }
    );

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return (data ?? []) as unknown as FulfillmentDeliverable[];
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
