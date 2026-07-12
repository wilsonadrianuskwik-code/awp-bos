import { z } from "zod/v4";
import { INVITABLE_ROLES } from "@/features/workspace/types";
import { ROLES } from "@/lib/constants/roles";

export const inviteMemberSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  role: z.enum(INVITABLE_ROLES),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(ROLES),
});

export const updateWorkspaceProfileSchema = z.object({
  name: z.string().min(1, "Workspace name is required").max(255),
  default_currency: z.string().length(3),
});

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
export type UpdateWorkspaceProfileInput = z.infer<typeof updateWorkspaceProfileSchema>;
