export const roles = ["OWNER", "POS"] as const;

export type Role = (typeof roles)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && roles.includes(value as Role);
}

export function canAccessOwnerArea(role: Role) {
  return role === "OWNER";
}

export function canAccessPosArea(role: Role) {
  return role === "OWNER" || role === "POS";
}
