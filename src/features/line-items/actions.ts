"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { withWorkspace } from "@/lib/with-workspace";
import {
  createTemplateSchema,
  type CreateTemplateInput,
} from "@/features/line-items/validators";
import type { TemplateWithItems } from "@/features/line-items/types";

// Thin wrappers around the existing create_quotation_template /
// update_quotation_template / delete_quotation_template RPCs (Phase 3).
// Those SQL functions already operate on generic line-item bundles and
// don't need to change — only the TS call site moved.

export async function createLineItemTemplate(
  workspaceId: string,
  input: CreateTemplateInput
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const parsed = createTemplateSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_quotation_template", {
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_name: parsed.data.name,
      p_description: parsed.data.description || null,
      p_items: parsed.data.items,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceId}`);
    return data as unknown as TemplateWithItems;
  });
}

export async function updateLineItemTemplate(
  workspaceId: string,
  templateId: string,
  input: CreateTemplateInput
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const parsed = createTemplateSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_quotation_template", {
      p_template_id: templateId,
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_name: parsed.data.name,
      p_description: parsed.data.description || null,
      p_items: parsed.data.items,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceId}`);
    return data as unknown as TemplateWithItems;
  });
}

export async function deleteLineItemTemplate(
  workspaceId: string,
  templateId: string
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("delete_quotation_template", {
      p_template_id: templateId,
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceId}`);
    return data as { success: true; id: string };
  });
}
