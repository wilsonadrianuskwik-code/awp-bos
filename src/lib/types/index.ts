import type { Role } from "@/lib/constants/roles";

export type WorkspaceContext = {
  workspaceId: string;
  userId: string;
  role: Role;
};
