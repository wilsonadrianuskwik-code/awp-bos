"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { withWorkspace, createAuditLog } from "@/lib/with-workspace";
import { createActivity } from "@/features/activities/helpers";
import {
  createCatalogItemSchema,
  updateCatalogItemSchema,
} from "@/features/catalog/validators";

export async function createCatalogItem(
  workspaceId: string,
  formData: FormData
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const raw = Object.fromEntries(formData.entries());
    const parsed = createCatalogItemSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();
    const { data: item, error } = await supabase
      .from("catalog_items")
      .insert({
        workspace_id: ctx.workspaceId,
        name: parsed.data.name,
        description: parsed.data.description || null,
        sku: parsed.data.sku || null,
        item_type: parsed.data.item_type,
        default_category: parsed.data.default_category,
        default_unit_price: parsed.data.default_unit_price,
        default_unit: parsed.data.default_unit || null,
        currency: parsed.data.currency,
        is_active: parsed.data.is_active,
        created_by: ctx.userId,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new Error("A catalog item with this SKU already exists");
      }
      throw new Error(error.message);
    }

    await Promise.all([
      createActivity(supabase, {
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        action: "created",
        description: `created catalog item "${parsed.data.name}"`,
        entityType: "catalog_item",
        entityId: item.id,
      }),
      createAuditLog({
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        action: "create",
        entityType: "catalog_item",
        entityId: item.id,
      }),
    ]);

    revalidatePath(`/${ctx.workspaceId}`);
    return item;
  });
}

export async function updateCatalogItem(
  workspaceId: string,
  itemId: string,
  formData: FormData
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const raw = Object.fromEntries(formData.entries());
    const parsed = updateCatalogItemSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();

    const { data: existing } = await supabase
      .from("catalog_items")
      .select("*")
      .eq("id", itemId)
      .eq("workspace_id", ctx.workspaceId)
      .single();

    if (!existing) throw new Error("Catalog item not found");

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    const changes: Record<string, { old: unknown; new: unknown }> = {};

    for (const [key, value] of Object.entries(parsed.data)) {
      const newVal = value === "" ? null : value;
      if (existing[key as keyof typeof existing] !== newVal) {
        updates[key] = newVal;
        changes[key] = {
          old: existing[key as keyof typeof existing],
          new: newVal,
        };
      }
    }

    if (Object.keys(changes).length === 0) return existing;

    const { error } = await supabase
      .from("catalog_items")
      .update(updates)
      .eq("id", itemId)
      .eq("workspace_id", ctx.workspaceId);

    if (error) {
      if (error.code === "23505") {
        throw new Error("A catalog item with this SKU already exists");
      }
      throw new Error(error.message);
    }

    await Promise.all([
      createActivity(supabase, {
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        action: "updated",
        description: `updated catalog item "${existing.name}"`,
        entityType: "catalog_item",
        entityId: itemId,
      }),
      createAuditLog({
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        action: "update",
        entityType: "catalog_item",
        entityId: itemId,
        changes,
      }),
    ]);

    revalidatePath(`/${ctx.workspaceId}`);
    return { ...existing, ...updates };
  });
}

export async function deleteCatalogItem(workspaceId: string, itemId: string) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();

    const { error } = await supabase
      .from("catalog_items")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", itemId)
      .eq("workspace_id", ctx.workspaceId);

    if (error) throw new Error(error.message);

    await createAuditLog({
      workspaceId: ctx.workspaceId,
      actorId: ctx.userId,
      action: "delete",
      entityType: "catalog_item",
      entityId: itemId,
    });

    revalidatePath(`/${ctx.workspaceId}`);
    return { success: true };
  });
}
