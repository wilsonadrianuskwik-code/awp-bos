import { createClient } from "@/lib/supabase/server";
import { logDbError } from "@/lib/log-db-error";
import type {
  DeliveryOrderDetail,
  DeliveryOrderFilters,
  DeliveryOrderListResult,
  DeliveryOrderLineItem,
  DeliveryOrderWithRelations,
} from "@/features/delivery-orders/types";

const RELATIONS = "client:clients(id,name,company), invoice:invoices(id,invoice_number), project:projects(id,code,name)";

export async function getDeliveryOrders(
  workspaceId: string,
  filters?: DeliveryOrderFilters
): Promise<DeliveryOrderListResult> {
  const supabase = await createClient();

  let query = supabase
    .from("delivery_orders")
    .select(`*, ${RELATIONS}`, { count: "exact" })
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null);

  if (filters?.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters?.invoiceId) query = query.eq("invoice_id", filters.invoiceId);

  const sortBy = filters?.sortBy ?? "created_at";
  const sortDir = filters?.sortDir ?? "desc";
  query = query.order(sortBy, { ascending: sortDir === "asc" });

  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 20;
  query = query.range((page - 1) * pageSize, page * pageSize - 1);

  const { data, count, error } = await query;
  if (error) {
    logDbError("getDeliveryOrders", error, { workspaceId });
    throw new Error(error.message);
  }

  return { deliveryOrders: (data ?? []) as unknown as DeliveryOrderWithRelations[], count: count ?? 0 };
}

export async function getDeliveryOrdersForInvoice(
  workspaceId: string,
  invoiceId: string
): Promise<DeliveryOrderWithRelations[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("delivery_orders")
    .select(`*, ${RELATIONS}`)
    .eq("workspace_id", workspaceId)
    .eq("invoice_id", invoiceId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    logDbError("getDeliveryOrdersForInvoice", error, { workspaceId, invoiceId });
    throw new Error(error.message);
  }
  return (data ?? []) as unknown as DeliveryOrderWithRelations[];
}

export async function getDeliveryOrderById(
  workspaceId: string,
  deliveryOrderId: string
): Promise<DeliveryOrderDetail | null> {
  const supabase = await createClient();

  const { data: deliveryOrder, error } = await supabase
    .from("delivery_orders")
    .select(`*, ${RELATIONS}`)
    .eq("workspace_id", workspaceId)
    .eq("id", deliveryOrderId)
    .is("deleted_at", null)
    .single();

  if (error) {
    if (error.code !== "PGRST116") {
      logDbError("getDeliveryOrderById", error, { workspaceId, deliveryOrderId });
    }
    return null;
  }
  if (!deliveryOrder) return null;

  const { data: lineItems } = await supabase
    .from("line_items")
    .select("id, entity_type, entity_id, sort_order, description, quantity, unit")
    .eq("entity_type", "delivery_order")
    .eq("entity_id", deliveryOrderId)
    .order("sort_order", { ascending: true });

  return {
    ...(deliveryOrder as unknown as DeliveryOrderWithRelations),
    line_items: (lineItems ?? []) as DeliveryOrderLineItem[],
  };
}

export async function getDocumentRelationships(workspaceId: string, documentType: string, documentId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_document_relationships", {
    p_workspace_id: workspaceId,
    p_document_type: documentType,
    p_document_id: documentId,
  });
  if (error) {
    logDbError("getDocumentRelationships (rpc get_document_relationships)", error, { workspaceId, documentType, documentId });
    throw new Error(error.message);
  }
  return (data ?? []) as { direction: string; related_type: string; related_id: string; relationship: string }[];
}
