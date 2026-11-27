import "server-only";
import type { UserRole } from "@/generated/prisma/client";
import { ServiceError } from "@/server/services/errors";

export const resources = [
  "organizations",
  "employees",
  "equipment",
  "assignments",
  "software",
  "subscriptions",
  "licenses",
  "accounts",
  "invoices",
  "tickets",
  "checklists",
  "notifications",
  "users",
  "invitations",
  "audit",
] as const;
export const actions = ["read", "create", "update", "archive"] as const;
export type ResourceType = (typeof resources)[number];
export type PermissionUser = {
  id: string;
  role: UserRole;
  isActive: boolean;
  employeeId: string | null;
};
export type Resource =
  | ResourceType
  | {
      type: ResourceType | "financials" | "sessions" | "ui";
      ownerEmployeeId?: string | null;
      recipientUserId?: string | null;
      ownerUserId?: string | null;
      invitationRole?: UserRole;
      category?: "business" | "security";
    };
export type Permission = { action: string; resource: Resource };

/** Inputs describing ownership must come from the database, never a browser claim. */
export function can(
  user: PermissionUser,
  action: string,
  resource: Resource,
): boolean {
  if (
    !user.isActive ||
    !["ADMIN", "IT_MANAGER", "TECHNICIAN", "EMPLOYEE"].includes(user.role)
  )
    return false;
  const target = typeof resource === "string" ? { type: resource } : resource;
  const type = target.type;
  const admin = user.role === "ADMIN";
  const manager = user.role === "IT_MANAGER";
  const employee = user.role === "EMPLOYEE";
  const owns = Boolean(
    user.employeeId && target.ownerEmployeeId === user.employeeId,
  );
  if (action === "financials:read")
    return type === "financials" && (admin || manager);
  if (action === "licenses:reveal-key")
    return type === "licenses" && (admin || manager);
  if (action === "notifications:read-all")
    return type === "notifications" && admin;
  if (action === "tickets:comment")
    return type === "tickets" && (!employee || owns);
  if (
    [
      "users:change-role",
      "users:set-active",
      "users:reset-mfa",
      "users:revoke-sessions",
    ].includes(action)
  )
    return type === "users" && admin;
  if (type === "sessions")
    return (
      (action === "read" && (admin || target.ownerUserId === user.id)) ||
      (action === "sessions:revoke" && target.ownerUserId === user.id)
    );
  if (type === "ui") return action === "read" && admin;
  if (type === "audit")
    return (
      ["read", "audit:export"].includes(action) &&
      (admin || (manager && target.category === "business"))
    );
  if (
    !(actions as readonly string[]).includes(action) ||
    !(resources as readonly string[]).includes(type)
  )
    return false;
  if (type === "notifications")
    return action === "read" && target.recipientUserId === user.id;
  if (type === "users") return admin && action !== "create";
  if (type === "invitations")
    return (
      action !== "update" &&
      (admin ||
        (manager &&
          (target.invitationRole === "EMPLOYEE" ||
            target.invitationRole === "TECHNICIAN")))
    );
  if (admin || manager) return true;
  if (user.role === "TECHNICIAN") {
    if (type === "invoices" || type === "subscriptions") return false;
    return (
      action === "read" ||
      ["equipment", "assignments", "tickets", "checklists"].includes(type)
    );
  }
  if (type === "tickets" && action === "create")
    return Boolean(user.employeeId);
  return (
    action === "read" &&
    owns &&
    [
      "employees",
      "equipment",
      "assignments",
      "licenses",
      "accounts",
      "tickets",
    ].includes(type)
  );
}
export function assertPermission(
  user: PermissionUser,
  action: string,
  resource: Resource,
) {
  if (!can(user, action, resource)) throw new ServiceError("FORBIDDEN", 403);
}
