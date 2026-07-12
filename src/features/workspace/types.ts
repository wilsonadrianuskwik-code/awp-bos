import type { Role } from "@/lib/constants/roles";

export type WorkspaceProfileSummary = {
  full_name: string | null;
  avatar_url: string | null;
};

export type WorkspaceMember = {
  id: string;
  workspace_id: string;
  user_id: string;
  role: Role;
  invited_by: string | null;
  joined_at: string;
  created_at: string;
  profile: WorkspaceProfileSummary | null;
  email: string | null;
};

export const INVITE_STATUSES = ["pending", "accepted", "revoked"] as const;

export type InviteStatus = (typeof INVITE_STATUSES)[number];

// Owner is deliberately excluded — an invite can never grant ownership
// directly; ownership can only be granted to an existing member via
// updateMemberRole, and only by another owner.
export const INVITABLE_ROLES = ["admin", "staff", "viewer"] as const;

export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export type WorkspaceInvite = {
  id: string;
  workspace_id: string;
  email: string;
  role: InvitableRole;
  token: string;
  status: InviteStatus;
  expires_at: string;
  invited_by: string;
  accepted_at: string | null;
  accepted_by: string | null;
  created_at: string;
};

export type WorkspaceInviteWithWorkspace = WorkspaceInvite & {
  workspace: { id: string; name: string; slug: string };
};
