import { createClient } from "@/lib/supabase/server";

export type LookupType = "unit_of_measure" | "tax_rate" | "payment_term" | "brand";

export type SimpleLookup = {
  id: string;
  lookup_type: LookupType;
  code: string;
  name: string;
  extra: Record<string, unknown>;
  sort_order: number;
  is_active: boolean;
  is_default: boolean;
};

/** All master-data "simple lookups" for a workspace, grouped by type — one generic query for every lookup module (master plan §15.2). */
export async function getSimpleLookups(workspaceId: string, lookupType?: LookupType): Promise<SimpleLookup[]> {
  const supabase = await createClient();
  let query = supabase
    .from("simple_lookups")
    .select("id, lookup_type, code, name, extra, sort_order, is_active, is_default")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });

  if (lookupType) query = query.eq("lookup_type", lookupType);

  const { data } = await query;
  return (data ?? []) as SimpleLookup[];
}

export type ItemCategory = { id: string; parent_id: string | null; code: string; name: string; is_active: boolean };

export async function getItemCategories(workspaceId: string): Promise<ItemCategory[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("item_categories")
    .select("id, parent_id, code, name, is_active")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });
  return (data ?? []) as ItemCategory[];
}
