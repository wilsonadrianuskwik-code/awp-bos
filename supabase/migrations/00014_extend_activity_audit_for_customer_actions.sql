-- Customer portal actions (approve/reject/request revision) have no auth.users
-- row to attribute as actor_id. Allow a nullable actor_id plus an actor_type
-- discriminator so these actions are still recorded truthfully in the timeline
-- and audit trail.

ALTER TABLE activities ALTER COLUMN actor_id DROP NOT NULL;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS actor_type TEXT NOT NULL DEFAULT 'user'
  CHECK (actor_type IN ('user','customer','system'));

ALTER TABLE audit_logs ALTER COLUMN actor_id DROP NOT NULL;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_type TEXT NOT NULL DEFAULT 'user'
  CHECK (actor_type IN ('user','customer','system'));
