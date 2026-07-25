"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { withWorkspace } from "@/lib/with-workspace";
import {
  createSupplierSchema,
  updateSupplierSchema,
} from "@/features/suppliers/validators";
import type { Supplier } from "@/features/suppliers/types";

function buildAddress(parsed: {
  address_line1?: string;
  address_city?: string;
  address_state?: string;
  address_postal_code?: string;
  address_country?: string;
}) {
  const address = {
    line1: parsed.address_line1 || undefined,
    city: parsed.address_city || undefined,
    state: parsed.address_state || undefined,
    postal_code: parsed.address_postal_code || undefined,
    country: parsed.address_country || undefined,
  };
  const hasAny = Object.values(address).some((v) => v !== undefined);
  return hasAny ? address : null;
}

/**
 * Full "create supplier" action, used by both the Supplier module's
 * create form and the PO builder's inline SupplierSelector (which only
 * submits a name/company/email/phone subset — every other field here is
 * optional so that form keeps working unchanged).
 */
export async function createSupplierAction(
  workspaceId: string,
  formData: FormData
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const raw = Object.fromEntries(formData.entries());
    const parsed = createSupplierSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_supplier", {
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_input: {
        name: parsed.data.name,
        email: parsed.data.email || null,
        phone: parsed.data.phone || null,
        company: parsed.data.company || null,
        website: parsed.data.website || null,
        billing_email: parsed.data.billing_email || null,
        tax_id: parsed.data.tax_id || null,
        payment_terms: parsed.data.payment_terms ?? null,
        preferred_currency: parsed.data.preferred_currency || null,
        notes: parsed.data.notes || null,
        address: buildAddress(parsed.data),
      },
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data as unknown as Supplier;
  });
}

export async function updateSupplier(
  workspaceId: string,
  supplierId: string,
  formData: FormData
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const raw = Object.fromEntries(formData.entries());
    const parsed = updateSupplierSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const address = buildAddress(parsed.data);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_supplier", {
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_supplier_id: supplierId,
      p_input: {
        name: parsed.data.name,
        email: parsed.data.email || null,
        phone: parsed.data.phone || null,
        company: parsed.data.company || null,
        website: parsed.data.website || null,
        billing_email: parsed.data.billing_email || null,
        tax_id: parsed.data.tax_id || null,
        payment_terms: parsed.data.payment_terms ?? null,
        preferred_currency: parsed.data.preferred_currency || null,
        notes: parsed.data.notes || null,
        ...(address !== null && { address }),
      },
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return data as unknown as Supplier;
  });
}

export async function deleteSupplier(workspaceId: string, supplierId: string) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("delete_supplier", {
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_supplier_id: supplierId,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}`);
    return { success: true };
  });
}
