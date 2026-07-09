CREATE TABLE workspaces (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  slug             TEXT NOT NULL UNIQUE,
  logo_url         TEXT,
  default_currency TEXT NOT NULL DEFAULT 'USD',
  settings         JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ
);

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

-- Members can view their own workspaces (requires workspace_members table, created next)
-- Policies are added after workspace_members table is created
