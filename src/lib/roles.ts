// Role hierarchy: a super_admin passes every admin gate, an admin every editor
// gate. All role checks go through hasRole — never compare role strings
// directly. Pure module (no auth/env imports) so it is unit-testable and safe
// anywhere, including client components.

export type Role = "super_admin" | "admin" | "editor"

const ROLE_LEVEL: Record<Role, number> = { editor: 0, admin: 1, super_admin: 2 }

export function hasRole(userRole: Role, required: Role): boolean {
  return ROLE_LEVEL[userRole] >= ROLE_LEVEL[required]
}

// Normalises the DB enum (SUPER_ADMIN/ADMIN/EDITOR) to the lowercase Role type.
export function normalizeRole(raw: string | undefined): Role {
  const lowered = (raw ?? "editor").toLowerCase()
  return (lowered in ROLE_LEVEL ? lowered : "editor") as Role
}
