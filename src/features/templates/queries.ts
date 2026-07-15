import { createClient } from "@/lib/supabase/server";
import type {
  DocumentTemplate,
  DocumentTemplateWithTheme,
  TemplateDocumentType,
  TemplateTheme,
} from "@/features/templates/types";

export async function getThemes(workspaceId: string): Promise<TemplateTheme[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("template_themes")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("is_preset", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getTheme(
  themeId: string,
  workspaceId: string
): Promise<TemplateTheme | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("template_themes")
    .select("*")
    .eq("id", themeId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .single();

  if (error) return null;
  return data;
}

export async function getTemplates(
  workspaceId: string,
  documentType?: TemplateDocumentType
): Promise<DocumentTemplateWithTheme[]> {
  const supabase = await createClient();
  let query = supabase
    .from("document_templates")
    .select("*, theme:template_themes(*)")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (documentType) {
    query = query.eq("document_type", documentType);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as DocumentTemplateWithTheme[];
}

export async function getTemplate(
  templateId: string,
  workspaceId: string
): Promise<DocumentTemplateWithTheme | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("document_templates")
    .select("*, theme:template_themes(*)")
    .eq("id", templateId)
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .single();

  if (error) return null;
  return data as DocumentTemplateWithTheme;
}

export async function getDefaultTemplate(
  workspaceId: string,
  documentType: TemplateDocumentType
): Promise<DocumentTemplateWithTheme | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("document_templates")
    .select("*, theme:template_themes(*)")
    .eq("workspace_id", workspaceId)
    .eq("document_type", documentType)
    .eq("is_default", true)
    .is("deleted_at", null)
    .single();

  if (error) return null;
  return data as DocumentTemplateWithTheme;
}

export async function getTemplateActivities(templateId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("activities")
    .select("*, actor:profiles!actor_id(full_name, avatar_url)")
    .eq("entity_type", "document_template")
    .eq("entity_id", templateId)
    .order("created_at", { ascending: false })
    .limit(50);

  return data ?? [];
}

// Type re-export for call sites that only need the bare (theme-less) shape.
export type { DocumentTemplate };
