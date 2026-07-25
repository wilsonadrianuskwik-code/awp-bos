import { createClient } from "@/lib/supabase/server";

export type ModulePermission = { role: string; module: string; can_view: boolean; can_write: boolean };

export async function getModulePermissions(workspaceId: string): Promise<ModulePermission[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_module_permissions", { p_workspace_id: workspaceId });
  if (error) throw new Error(error.message);
  return (data ?? []) as ModulePermission[];
}
