import type { Role } from "@/lib/constants/roles";

export type WorkspaceContext = {
  workspaceId: string;
  workspaceSlug: string;
  userId: string;
  role: Role;
};
