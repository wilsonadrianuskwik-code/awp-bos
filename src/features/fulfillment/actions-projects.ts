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
  bulkAssignDeliverablesSchema,
  bulkDeleteDeliverablesSchema,
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
  BulkAssignDeliverablesInput,
  BulkDeleteDeliverablesInput,
} from "@/features/fulfillment/validators-projects";
import type {
  FulfillmentDeliverable,
  FulfillmentProject,
  FulfillmentProjectWithRollup,
} from "@/features/fulfillment/types-projects";
import type { FulfillmentItemWithProgress } from "@/features/fulfillment/types";
import type { WorkspaceMember } from "@/features/workspace/types";
import type { Activity } from "@/features/activities/types";
import { getInvoices } from "@/features/invoices/queries";
import {
  getFulfillmentDeliverableActivities,
  getFulfillmentDeliverablesByClient,
  getFulfillmentProjectByInvoice,
  getFulfillmentDeliverables,
  getFulfillmentProjectActivities,
} from "@/features/fulfillment/queries-projects";
import { getFulfillmentItems } from "@/features/fulfillment/queries";
import { getWorkspaceMembers } from "@/features/workspace/queries";
import { FULFILLMENT_ELIGIBLE_INVOICE_STATUSES } from "@/features/fulfillment/types";
import { FULFILLMENT_COCKPIT_BATCH_SIZE } from "@/features/fulfillment/config";

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

export type FulfillmentProjectSearchResult = {
  invoiceId: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
};

// Single search box behind both the /fulfillment landing page's jump bar
// and the project workspace's breadcrumb switcher — matches by client
// name/company OR invoice number/title in one query (reusing getInvoices'
// existing search clause, see src/features/invoices/queries.ts) rather
// than a two-step "pick client, then pick invoice" flow. Only invoices
// that have actually reached a Fulfilment-eligible status are worth
// surfacing here, since anything earlier has no project to jump into yet.
export async function searchFulfillmentProjectsAction(
  workspaceId: string,
  query: string
) {
  return withWorkspace(workspaceId, "viewer", async (ctx) => {
    if (!query.trim()) return [];

    const { invoices } = await getInvoices(ctx.workspaceId, {
      search: query,
      pageSize: 8,
    });

    return invoices
      .filter((i) =>
        (FULFILLMENT_ELIGIBLE_INVOICE_STATUSES as readonly string[]).includes(i.status)
      )
      .map(
        (i): FulfillmentProjectSearchResult => ({
          invoiceId: i.id,
          invoiceNumber: i.invoice_number,
          clientId: i.client_id,
          clientName: i.client?.name ?? "Unknown client",
        })
      );
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

// Lazy read for the cockpit's inline "Outstanding Deliverables" panel —
// fetched only when a client row is selected, not preloaded for every
// client in the list.
export async function getClientFulfillmentDeliverablesAction(
  workspaceId: string,
  clientId: string
) {
  return withWorkspace(workspaceId, "viewer", async (ctx) => {
    return getFulfillmentDeliverablesByClient(ctx.workspaceId, clientId);
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
      p_scheduled_date: parsed.data.scheduled_date || null,
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

export async function bulkAssignFulfillmentDeliverablesAction(
  workspaceId: string,
  input: BulkAssignDeliverablesInput
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const parsed = bulkAssignDeliverablesSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "bulk_assign_fulfillment_deliverables",
      {
        p_deliverable_ids: parsed.data.deliverable_ids,
        p_workspace_id: ctx.workspaceId,
        p_actor_id: ctx.userId,
        p_assigned_to: parsed.data.assigned_to,
      }
    );

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return (data ?? []) as unknown as FulfillmentDeliverable[];
  });
}

export async function bulkDeleteFulfillmentDeliverablesAction(
  workspaceId: string,
  input: BulkDeleteDeliverablesInput
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const parsed = bulkDeleteDeliverablesSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      "bulk_delete_fulfillment_deliverables",
      {
        p_deliverable_ids: parsed.data.deliverable_ids,
        p_workspace_id: ctx.workspaceId,
        p_actor_id: ctx.userId,
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

export type FulfillmentWorkspaceData = {
  project: FulfillmentProjectWithRollup;
  trackers: FulfillmentItemWithProgress[];
  deliverables: FulfillmentDeliverable[];
  members: WorkspaceMember[];
  activities: Activity[];
} | null;

// The single data-loading call the unified workspace shell makes whenever
// the selected invoice changes — bundles exactly what the old
// /fulfillment/[invoiceId] server page fetched (project + its trackers +
// deliverables + workspace members + project activities) into one
// client-callable action, so switching projects is a state update instead
// of a Next.js navigation. Returns null when the invoice hasn't reached
// partial/paid yet (no project exists) — same "read, don't create" contract
// getFulfillmentProjectByInvoice already has.
export async function getFulfillmentWorkspaceDataAction(workspaceId: string, invoiceId: string) {
  return withWorkspace(workspaceId, "viewer", async (ctx) => {
    const project = await getFulfillmentProjectByInvoice(ctx.workspaceId, invoiceId);
    if (!project) return null;

    const [{ items: trackers }, { items: deliverables }, members, activities] = await Promise.all([
      getFulfillmentItems(ctx.workspaceId, { projectId: project.id }, 1, FULFILLMENT_COCKPIT_BATCH_SIZE),
      getFulfillmentDeliverables(ctx.workspaceId, project.id),
      getWorkspaceMembers(ctx.workspaceId),
      getFulfillmentProjectActivities(project.id),
    ]);

    return { project, trackers, deliverables, members, activities };
  });
}
