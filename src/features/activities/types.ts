export type Activity = {
  id: string;
  workspace_id: string;
  actor_id: string;
  action: string;
  description: string;
  entity_type: string;
  entity_id: string;
  secondary_entity_type: string | null;
  secondary_entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actor?: {
    full_name: string | null;
    avatar_url: string | null;
  };
};
