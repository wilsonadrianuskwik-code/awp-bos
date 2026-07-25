"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { withWorkspace } from "@/lib/with-workspace";

// Module-capability permission matrix (master plan §6.2 Phase 1): an
// override layer on top of the base viewer<staff<admin<owner hierarchy,
// not a replacement for it. Absence of a row means "use the default
// hierarchy behavior" — see get_effective_module_permission (00076).
export async function setModulePermission(
  workspaceId: string,
  input: { role: string; module: string; can_view: boolean; can_write: boolean }
) {
  return withWorkspace(workspaceId, "admin", async (ctx) => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("set_module_permission", {
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_role: input.role,
      p_module: input.module,
      p_can_view: input.can_view,
      p_can_write: input.can_write,
    });
    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceSlug}/settings/permissions`);
    return data;
  });
}
