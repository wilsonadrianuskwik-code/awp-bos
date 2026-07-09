import { type SupabaseClient } from "@supabase/supabase-js";

export async function createActivity(
  supabase: SupabaseClient,
  params: {
    workspaceId: string;
    actorId: string;
    action: string;
    description: string;
    entityType: string;
    entityId: string;
    secondaryEntityType?: string;
    secondaryEntityId?: string;
    metadata?: Record<string, unknown>;
  }
) {
  await supabase.from("activities").insert({
    workspace_id: params.workspaceId,
    actor_id: params.actorId,
    action: params.action,
    description: params.description,
    entity_type: params.entityType,
    entity_id: params.entityId,
    secondary_entity_type: params.secondaryEntityType ?? null,
    secondary_entity_id: params.secondaryEntityId ?? null,
    metadata: params.metadata ?? {},
  });
}
