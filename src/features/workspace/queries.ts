import { createClient } from "@/lib/supabase/server";

export async function getUserWorkspaces() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("workspace_members")
    .select(
      `
      role,
      workspace:workspaces (
        id,
        name,
        slug,
        logo_url,
        default_currency
      )
    `
    )
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("joined_at", { ascending: true });

  if (!data) return [];

  return data
    .filter((d) => d.workspace !== null)
    .map((d) => {
      const ws = d.workspace as unknown as {
        id: string;
        name: string;
        slug: string;
        logo_url: string | null;
        default_currency: string;
      };
      return { ...ws, role: d.role };
    });
}
