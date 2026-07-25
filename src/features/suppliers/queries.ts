import { createClient } from "@/lib/supabase/server";
import { logDbError } from "@/lib/log-db-error";
import type {
  Supplier,
  SupplierFilters,
  SupplierListResult,
} from "@/features/suppliers/types";

export async function getSuppliers(
  workspaceId: string,
  filters?: SupplierFilters
): Promise<SupplierListResult> {
  const supabase = await createClient();

  let query = supabase
    .from("suppliers")
    .select("*", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);

  if (filters?.search) {
    const term = filters.search.replace(/[%_]/g, "");
    const like = `%${term}%`;
    query = query.or(
      `name.ilike.${like},company.ilike.${like},email.ilike.${like},phone.ilike.${like}`
    );
  }

  const sortBy = filters?.sortBy ?? "created_at";
  const sortDir = filters?.sortDir ?? "desc";
  query = query.order(sortBy, { ascending: sortDir === "asc" });

  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) {
    logDbError("getSuppliers", error, { workspaceId });
    throw new Error(error.message);
  }

  return { suppliers: (data ?? []) as Supplier[], count: count ?? 0 };
}

export async function getSupplierStats(workspaceId: string) {
  const supabase = await createClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [{ count: totalCount }, { count: newThisMonthCount }] = await Promise.all([
    supabase
      .from("suppliers")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null),
    supabase
      .from("suppliers")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .gte("created_at", thirtyDaysAgo),
  ]);

  return {
    totalCount: totalCount ?? 0,
    newThisMonthCount: newThisMonthCount ?? 0,
  };
}

export async function getSupplierActivities(supplierId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("activities")
    .select("*, actor:profiles!actor_id(full_name, avatar_url)")
    .eq("entity_type", "supplier")
    .eq("entity_id", supplierId)
    .order("created_at", { ascending: false })
    .limit(50);

  return data ?? [];
}

/**
 * All active suppliers for a workspace, for the Purchase Order builder's
 * SupplierSelector — mirrors getAllClients in @/features/clients/queries.
 */
export async function getAllSuppliers(workspaceId: string): Promise<Supplier[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (error) {
    logDbError("getAllSuppliers", error, { workspaceId });
    throw new Error(error.message);
  }
  return (data ?? []) as Supplier[];
}

export async function getSupplier(
  supplierId: string,
  workspaceId: string
): Promise<Supplier | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("*")
    .eq("id", supplierId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .single();

  if (error) {
    if (error.code !== "PGRST116") {
      logDbError("getSupplier", error, { supplierId, workspaceId });
    }
    return null;
  }
  if (!data) return null;
  return data as Supplier;
}
