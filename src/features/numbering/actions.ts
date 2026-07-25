"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { withWorkspace } from "@/lib/with-workspace";
import {
  upsertNumberingTemplateSchema,
  type UpsertNumberingTemplateInput,
} from "@/features/numbering/validators";
import type { NumberingTemplate } from "@/features/numbering/types";

/**
 * Upserts a workspace's numbering template for one document type. Unlike
 * the rest of this codebase's mutations, this writes directly against
 * document_number_templates via the Supabase client rather than through a
 * dedicated RPC — there is no create_/update_ function for this table
 * (see supabase/migrations/00067_document_numbering_v2.sql), and RLS
 * already restricts writes to admin/owner, matched here by gating the
 * action itself at 'admin'.
 *
 * document_number_templates only has a *partial* unique index
 * (workspace_id, document_type) WHERE is_active — Postgres's ON CONFLICT
 * upsert can't infer against a partial index from a plain column list, so
 * this does an explicit select-then-update-or-insert instead of
 * .upsert(onConflict: ...).
 */
export async function upsertNumberingTemplate(
  workspaceId: string,
  input: UpsertNumberingTemplateInput
) {
  return withWorkspace(workspaceId, "admin", async (ctx) => {
    const parsed = upsertNumberingTemplateSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();

    const { data: existing } = await supabase
      .from("document_number_templates")
      .select("id")
      .eq("workspace_id", ctx.workspaceId)
      .eq("document_type", parsed.data.document_type)
      .eq("is_active", true)
      .maybeSingle();

    const row = {
      workspace_id: ctx.workspaceId,
      document_type: parsed.data.document_type,
      template: parsed.data.template,
      reset_cadence: parsed.data.reset_cadence,
      sequence_scope: parsed.data.sequence_scope,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = existing
      ? await supabase
          .from("document_number_templates")
          .update(row)
          .eq("id", existing.id)
          .select()
          .single()
      : await supabase
          .from("document_number_templates")
          .insert(row)
          .select()
          .single();

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}/settings/numbering`);
    return data as unknown as NumberingTemplate;
  });
}
