// Seeds the preset themes and a default Invoice + Quotation design
// into a brand-new workspace, so a user opening Document Design for the
// first time always finds ready-made starting points — never a blank
// slate. Called once, from createWorkspace(), using the admin client
// (the caller has no workspace membership yet at that point, so RLS
// would otherwise reject these inserts — same bootstrapping rationale
// documented in createWorkspace itself).
import type { SupabaseClient } from "@supabase/supabase-js";
import { PRESET_THEMES, PRESET_THEME_NAMES, getDefaultBlocksForDocumentType } from "@/features/templates/presets";

export async function seedDefaultTemplates(
  admin: SupabaseClient,
  workspaceId: string,
  userId: string
): Promise<void> {
  const themeRows = PRESET_THEME_NAMES.map((name) => ({
    workspace_id: workspaceId,
    name,
    description: `${name} preset theme`,
    config: PRESET_THEMES[name],
    is_preset: true,
    created_by: userId,
  }));

  const { data: themes, error: themesError } = await admin
    .from("template_themes")
    .insert(themeRows)
    .select("id, name");

  if (themesError || !themes) return; // seeding is best-effort, never blocks workspace creation

  const modernTheme = themes.find((t) => t.name === "Modern");

  const templateRows = [
    {
      workspace_id: workspaceId,
      name: "Modern Invoice",
      document_type: "invoice" as const,
      theme_id: modernTheme?.id ?? null,
      blocks: getDefaultBlocksForDocumentType("invoice"),
      page_settings: { size: "A4", orientation: "portrait" },
      is_default: true,
      created_by: userId,
    },
    {
      workspace_id: workspaceId,
      name: "Modern Quotation",
      document_type: "quotation" as const,
      theme_id: modernTheme?.id ?? null,
      blocks: getDefaultBlocksForDocumentType("quotation"),
      page_settings: { size: "A4", orientation: "portrait" },
      is_default: true,
      created_by: userId,
    },
  ];

  await admin.from("document_templates").insert(templateRows);
}
