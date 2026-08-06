import { createAdminClient } from "@/lib/supabase/admin";
import type { BrandingSettings } from "@/features/templates/types";

/**
 * The sign-in wallpaper, uploaded in Settings → Branding.
 *
 * Read through the admin client because the sign-in page has no session
 * by definition — there is nobody to authorise yet. Nothing sensitive is
 * exposed: the value is a public URL in the public `branding` bucket
 * (00083), the same place the logo and signature already live, and only
 * that one field is returned.
 *
 * The sign-in page is also workspace-agnostic — it is reached before any
 * workspace is chosen — so this reads the oldest workspace, which on a
 * single-company install is the only one. If a second workspace is ever
 * added it does not get its own sign-in wallpaper; that would need a
 * per-workspace sign-in route to hang it off.
 *
 * Returns null when unset, unreadable, or when the environment has no
 * service-role key (local builds without one). The caller falls back to
 * the CSS backdrop, so failure here costs the photo and nothing else.
 */
export async function getLoginHeroUrl(): Promise<string | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("workspaces")
      .select("settings")
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    const branding = (data.settings as { branding?: BrandingSettings } | null)
      ?.branding;
    return branding?.login_hero_url?.trim() || null;
  } catch {
    // A missing table, a network blip or a bad key must not take down the
    // page people use to report that something is broken.
    return null;
  }
}
