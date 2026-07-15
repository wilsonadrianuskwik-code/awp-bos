"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { withWorkspace, createAuditLog } from "@/lib/with-workspace";
import { createActivity } from "@/features/activities/helpers";
import {
  createThemeSchema,
  updateThemeSchema,
  createTemplateSchema,
  updateTemplateSchema,
  companyProfileSchema,
  type CreateThemeInput,
  type UpdateThemeInput,
  type CreateTemplateInput,
  type UpdateTemplateInput,
  type CompanyProfileInput,
} from "@/features/templates/validators";

// ---------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------

export async function createTheme(workspaceId: string, input: CreateThemeInput) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const parsed = createThemeSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();
    const { data: theme, error } = await supabase
      .from("template_themes")
      .insert({
        workspace_id: ctx.workspaceId,
        name: parsed.data.name,
        description: parsed.data.description || null,
        config: parsed.data.config,
        is_preset: false,
        created_by: ctx.userId,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    await Promise.all([
      createActivity(supabase, {
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        action: "created",
        description: `created theme "${parsed.data.name}"`,
        entityType: "template_theme",
        entityId: theme.id,
      }),
      createAuditLog({
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        action: "create",
        entityType: "template_theme",
        entityId: theme.id,
      }),
    ]);

    revalidatePath(`/${ctx.workspaceId}`);
    return theme;
  });
}

export async function updateTheme(
  workspaceId: string,
  themeId: string,
  input: UpdateThemeInput
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const parsed = updateThemeSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();
    const { data: existing } = await supabase
      .from("template_themes")
      .select("*")
      .eq("id", themeId)
      .eq("workspace_id", ctx.workspaceId)
      .single();

    if (!existing) throw new Error("Theme not found");

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.description !== undefined) updates.description = parsed.data.description || null;
    if (parsed.data.config !== undefined) updates.config = parsed.data.config;

    const { error } = await supabase
      .from("template_themes")
      .update(updates)
      .eq("id", themeId)
      .eq("workspace_id", ctx.workspaceId);

    if (error) throw new Error(error.message);

    await Promise.all([
      createActivity(supabase, {
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        action: "updated",
        description: `updated theme "${existing.name}"`,
        entityType: "template_theme",
        entityId: themeId,
      }),
      createAuditLog({
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        action: "update",
        entityType: "template_theme",
        entityId: themeId,
      }),
    ]);

    revalidatePath(`/${ctx.workspaceId}`);
    return { ...existing, ...updates };
  });
}

export async function deleteTheme(workspaceId: string, themeId: string) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();

    const { count } = await supabase
      .from("document_templates")
      .select("id", { count: "exact", head: true })
      .eq("theme_id", themeId)
      .is("deleted_at", null);

    if (count && count > 0) {
      throw new Error("This theme is used by one or more designs. Remove it from those designs first.");
    }

    const { error } = await supabase
      .from("template_themes")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", themeId)
      .eq("workspace_id", ctx.workspaceId);

    if (error) throw new Error(error.message);

    await createAuditLog({
      workspaceId: ctx.workspaceId,
      actorId: ctx.userId,
      action: "delete",
      entityType: "template_theme",
      entityId: themeId,
    });

    revalidatePath(`/${ctx.workspaceId}`);
    return { success: true };
  });
}

// ---------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------

export async function createTemplate(workspaceId: string, input: CreateTemplateInput) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const parsed = createTemplateSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();

    if (parsed.data.is_default) {
      await supabase
        .from("document_templates")
        .update({ is_default: false })
        .eq("workspace_id", ctx.workspaceId)
        .eq("document_type", parsed.data.document_type)
        .eq("is_default", true);
    }

    const { data: template, error } = await supabase
      .from("document_templates")
      .insert({
        workspace_id: ctx.workspaceId,
        name: parsed.data.name,
        document_type: parsed.data.document_type,
        theme_id: parsed.data.theme_id ?? null,
        blocks: parsed.data.blocks,
        page_settings: parsed.data.page_settings,
        is_default: parsed.data.is_default ?? false,
        created_by: ctx.userId,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    await Promise.all([
      createActivity(supabase, {
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        action: "created",
        description: `created document design "${parsed.data.name}"`,
        entityType: "document_template",
        entityId: template.id,
      }),
      createAuditLog({
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        action: "create",
        entityType: "document_template",
        entityId: template.id,
      }),
    ]);

    revalidatePath(`/${ctx.workspaceId}`);
    return template;
  });
}

export async function updateTemplate(
  workspaceId: string,
  templateId: string,
  input: UpdateTemplateInput
) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const parsed = updateTemplateSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();
    const { data: existing } = await supabase
      .from("document_templates")
      .select("*")
      .eq("id", templateId)
      .eq("workspace_id", ctx.workspaceId)
      .single();

    if (!existing) throw new Error("Design not found");

    const documentType = parsed.data.document_type ?? existing.document_type;

    if (parsed.data.is_default) {
      await supabase
        .from("document_templates")
        .update({ is_default: false })
        .eq("workspace_id", ctx.workspaceId)
        .eq("document_type", documentType)
        .eq("is_default", true)
        .neq("id", templateId);
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const key of ["name", "document_type", "theme_id", "blocks", "page_settings", "is_default"] as const) {
      if (parsed.data[key] !== undefined) updates[key] = parsed.data[key];
    }

    const { error } = await supabase
      .from("document_templates")
      .update(updates)
      .eq("id", templateId)
      .eq("workspace_id", ctx.workspaceId);

    if (error) throw new Error(error.message);

    await Promise.all([
      createActivity(supabase, {
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        action: "updated",
        description: `updated document design "${existing.name}"`,
        entityType: "document_template",
        entityId: templateId,
      }),
      createAuditLog({
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
        action: "update",
        entityType: "document_template",
        entityId: templateId,
      }),
    ]);

    revalidatePath(`/${ctx.workspaceId}`);
    return { ...existing, ...updates };
  });
}

export async function setDefaultTemplate(workspaceId: string, templateId: string) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();
    const { data: existing } = await supabase
      .from("document_templates")
      .select("*")
      .eq("id", templateId)
      .eq("workspace_id", ctx.workspaceId)
      .single();

    if (!existing) throw new Error("Design not found");

    await supabase
      .from("document_templates")
      .update({ is_default: false })
      .eq("workspace_id", ctx.workspaceId)
      .eq("document_type", existing.document_type)
      .eq("is_default", true);

    const { error } = await supabase
      .from("document_templates")
      .update({ is_default: true, updated_at: new Date().toISOString() })
      .eq("id", templateId)
      .eq("workspace_id", ctx.workspaceId);

    if (error) throw new Error(error.message);

    await createActivity(supabase, {
      workspaceId: ctx.workspaceId,
      actorId: ctx.userId,
      action: "updated",
      description: `set "${existing.name}" as the default ${existing.document_type} design`,
      entityType: "document_template",
      entityId: templateId,
    });

    revalidatePath(`/${ctx.workspaceId}`);
    return { success: true };
  });
}

export async function duplicateTemplate(workspaceId: string, templateId: string) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();
    const { data: existing } = await supabase
      .from("document_templates")
      .select("*")
      .eq("id", templateId)
      .eq("workspace_id", ctx.workspaceId)
      .single();

    if (!existing) throw new Error("Design not found");

    const { data: copy, error } = await supabase
      .from("document_templates")
      .insert({
        workspace_id: ctx.workspaceId,
        name: `${existing.name} (Copy)`,
        document_type: existing.document_type,
        theme_id: existing.theme_id,
        blocks: existing.blocks,
        page_settings: existing.page_settings,
        is_default: false,
        created_by: ctx.userId,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);

    await createActivity(supabase, {
      workspaceId: ctx.workspaceId,
      actorId: ctx.userId,
      action: "created",
      description: `duplicated design "${existing.name}"`,
      entityType: "document_template",
      entityId: copy.id,
    });

    revalidatePath(`/${ctx.workspaceId}`);
    return copy;
  });
}

export async function deleteTemplate(workspaceId: string, templateId: string) {
  return withWorkspace(workspaceId, "staff", async (ctx) => {
    const supabase = await createClient();

    const { data: existing } = await supabase
      .from("document_templates")
      .select("is_default")
      .eq("id", templateId)
      .eq("workspace_id", ctx.workspaceId)
      .single();

    if (existing?.is_default) {
      throw new Error("Can't delete the default design. Set another design as default first.");
    }

    const { error } = await supabase
      .from("document_templates")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", templateId)
      .eq("workspace_id", ctx.workspaceId);

    if (error) throw new Error(error.message);

    await createAuditLog({
      workspaceId: ctx.workspaceId,
      actorId: ctx.userId,
      action: "delete",
      entityType: "document_template",
      entityId: templateId,
    });

    revalidatePath(`/${ctx.workspaceId}`);
    return { success: true };
  });
}

// ---------------------------------------------------------------------
// Company profile
// ---------------------------------------------------------------------

export async function updateCompanyProfile(workspaceId: string, input: CompanyProfileInput) {
  return withWorkspace(workspaceId, "admin", async (ctx) => {
    const parsed = companyProfileSchema.safeParse(input);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0].message);
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("update_company_profile", {
      p_workspace_id: ctx.workspaceId,
      p_actor_id: ctx.userId,
      p_company_profile: parsed.data,
    });

    if (error) throw new Error(error.message);

    revalidatePath(`/${ctx.workspaceId}`);
    return data;
  });
}
