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

    const isPackage = parsed.data.is_package;

    const supabase = await createClient();
    const { data: item, error } = await supabase
      .from("catalog_items")
      .insert({
        workspace_id: ctx.workspaceId,
        name: parsed.data.name,
        description: parsed.data.description || null,
        sku: parsed.data.sku || null,
        item_type: parsed.data.item_type,
        default_category: isPackage ? "package" : parsed.data.default_category,
        // A package prices as a whole (package_price); its default_unit_price
        // stays 0 so nothing double-counts if it's ever read as a standalone.
        default_unit_price: isPackage ? 0 : parsed.data.default_unit_price,
        default_unit: parsed.data.default_unit || null,
        category_id: parsed.data.category_id || null,
        unit_of_measure_id: parsed.data.unit_of_measure_id || null,
        currency: parsed.data.currency,
        is_active: parsed.data.is_active,
        is_package: isPackage,
        package_price: isPackage ? (parsed.data.package_price ?? null) : null,
        package_items: isPackage ? parsed.data.package_items : [],
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

    revalidatePath(`/${ctx.workspaceSlug}`);
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

    // Package fields are handled explicitly below — arrays/booleans don't
    // survive the scalar diff loop's `value === "" ? null` normalization or
    // its identity comparison. Everything else goes through the loop.
    const PACKAGE_KEYS = new Set([
      "is_package",
      "package_price",
      "package_items",
      "default_category",
      "default_unit_price",
    ]);

    for (const [key, value] of Object.entries(parsed.data)) {
      if (PACKAGE_KEYS.has(key) || value === undefined) continue;
      const newVal = value === "" ? null : value;
      if (existing[key as keyof typeof existing] !== newVal) {
        updates[key] = newVal;
        changes[key] = {
          old: existing[key as keyof typeof existing],
          new: newVal,
        };
      }
    }

    // Resolve the package shape. If is_package wasn't submitted, keep the
    // item's current mode; otherwise apply the new mode and normalize the
    // dependent columns so the two states never leave stale data behind.
    const nextIsPackage =
      parsed.data.is_package === undefined ? existing.is_package : parsed.data.is_package;
    const nextPackagePrice = nextIsPackage ? (parsed.data.package_price ?? null) : null;
    const nextPackageItems = nextIsPackage ? (parsed.data.package_items ?? []) : [];
    const nextDefaultCategory = nextIsPackage
      ? "package"
      : (parsed.data.default_category ?? existing.default_category);
    const nextDefaultUnitPrice = nextIsPackage
      ? 0
      : (parsed.data.default_unit_price ?? existing.default_unit_price);

    if (existing.is_package !== nextIsPackage) {
      changes.is_package = { old: existing.is_package, new: nextIsPackage };
    }
    updates.is_package = nextIsPackage;
    updates.package_price = nextPackagePrice;
    updates.package_items = nextPackageItems;
    updates.default_category = nextDefaultCategory;
    updates.default_unit_price = nextDefaultUnitPrice;

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

    revalidatePath(`/${ctx.workspaceSlug}`);
    return { ...existing, ...updates };
  });
}

export async function duplicateCatalogItem(workspaceId: string, itemId: string) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();

    const { data: existing } = await supabase
      .from("catalog_items")
      .select("*")
      .eq("id", itemId)
      .eq("workspace_id", ctx.workspaceId)
      .single();

    if (!existing) throw new Error("Catalog item not found");

    const { data: copy, error } = await supabase
      .from("catalog_items")
      .insert({
        workspace_id: ctx.workspaceId,
        name: `${existing.name} (Copy)`,
        description: existing.description,
        sku: null, // SKU is unique per workspace — a copy can't inherit it
        item_type: existing.item_type,
        default_category: existing.default_category,
        default_unit_price: existing.default_unit_price,
        default_unit: existing.default_unit,
        currency: existing.currency,
        is_active: existing.is_active,
        is_package: existing.is_package,
        package_price: existing.package_price,
        package_items: existing.package_items,
        created_by: ctx.userId,
      })
      .select("id, name")
      .single();

    if (error) throw new Error(error.message);

    await Promise.all([
      createActivity(supabase, {
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        action: "created",
        description: `duplicated catalog item "${existing.name}" as "${copy.name}"`,
        entityType: "catalog_item",
        entityId: copy.id,
      }),
      createAuditLog({
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        action: "create",
        entityType: "catalog_item",
        entityId: copy.id,
      }),
    ]);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return copy;
  });
}

export async function setCatalogItemActive(
  workspaceId: string,
  itemId: string,
  isActive: boolean
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();

    const { data: existing } = await supabase
      .from("catalog_items")
      .select("name, is_active")
      .eq("id", itemId)
      .eq("workspace_id", ctx.workspaceId)
      .single();

    if (!existing) throw new Error("Catalog item not found");
    if (existing.is_active === isActive) return { success: true };

    const { error } = await supabase
      .from("catalog_items")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", itemId)
      .eq("workspace_id", ctx.workspaceId);

    if (error) throw new Error(error.message);

    await Promise.all([
      createActivity(supabase, {
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        action: "updated",
        description: `marked catalog item "${existing.name}" as ${isActive ? "active" : "inactive"}`,
        entityType: "catalog_item",
        entityId: itemId,
      }),
      createAuditLog({
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        action: "update",
        entityType: "catalog_item",
        entityId: itemId,
        changes: { is_active: { old: existing.is_active, new: isActive } },
      }),
    ]);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return { success: true };
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

    revalidatePath(`/${ctx.workspaceSlug}`);
    return { success: true };
  });
}

export async function bulkDeleteCatalogItems(workspaceId: string, itemIds: string[]) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("bulk_delete_catalog_items", {
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_catalog_item_ids: itemIds,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data as { deleted_count: number; deleted_ids: string[] };
  });
}
