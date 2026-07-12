import { createClient } from "@/lib/supabase/server";
import type { CatalogItem } from "@/features/catalog/types";

export async function getCatalogItems(
  workspaceId: string
): Promise<CatalogItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("catalog_items")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getCatalogItem(
  itemId: string,
  workspaceId: string
): Promise<CatalogItem | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("catalog_items")
    .select("*")
    .eq("id", itemId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .single();

  if (error) return null;
  return data;
}

export async function getCatalogItemActivities(itemId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("activities")
    .select("*, actor:profiles!actor_id(full_name, avatar_url)")
    .eq("entity_type", "catalog_item")
    .eq("entity_id", itemId)
    .order("created_at", { ascending: false })
    .limit(50);

  return data ?? [];
}
