export const ROLES = ["viewer", "staff", "admin", "owner"] as const;
export type Role = (typeof ROLES)[number];

const ROLE_HIERARCHY: Record<Role, number> = {
  viewer: 0,
  staff: 1,
  admin: 2,
  owner: 3,
};

export function hasMinRole(userRole: Role, requiredRole: Role): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}
