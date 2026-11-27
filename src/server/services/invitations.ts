import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient, Prisma } from "@/generated/prisma/client";
import {
  emailSchema,
  invitationSchema,
  invitationTokenSchema,
} from "@/lib/validation";
import { ServiceError } from "./errors";
import { writeAudit } from "./audit";
import { assertPermission, can } from "@/server/auth/permissions";
import { lockUsers, serviceAccess } from "@/server/auth/service-access";

export function invitationTokenHash(token: string) {
  return createHash("sha256")
    .update(invitationTokenSchema.parse(token))
    .digest("hex");
}
async function assertAdmin(tx: Prisma.TransactionClient, id: string) {
  const actor = await tx.user.findUnique({ where: { id } });
  if (
    !actor?.isActive ||
    !can(actor, "read", { type: "invitations", invitationRole: "EMPLOYEE" })
  )
    throw new ServiceError("FORBIDDEN", 403);
  return actor;
}
async function insertInvitation(
  tx: Prisma.TransactionClient,
  input: unknown,
  invitedById?: string,
) {
  const data = invitationSchema.parse(input);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`invitation:${data.email}`}, 0))`;
  if (await tx.user.findUnique({ where: { email: data.email } }))
    throw new ServiceError("USER_ALREADY_EXISTS");
  if (data.employeeId) {
    const employee = await tx.employee.findUnique({
      where: { id: data.employeeId },
      include: { user: true },
    });
    if (!employee) throw new ServiceError("EMPLOYEE_NOT_FOUND");
    if (employee.user) throw new ServiceError("EMPLOYEE_ALREADY_LINKED");
  }
  const previous = await tx.invitation.findMany({
    where: { email: data.email, acceptedAt: null, revokedAt: null },
    select: { id: true, role: true },
  });
  if (invitedById) {
    const actor = await assertAdmin(tx, invitedById);
    assertPermission(actor, "create", {
      type: "invitations",
      invitationRole: data.role,
    });
    for (const invitation of previous)
      assertPermission(actor, "archive", {
        type: "invitations",
        invitationRole: invitation.role,
      });
  }
  for (const invitation of previous) {
    await tx.invitation.update({
      where: { id: invitation.id },
      data: { revokedAt: new Date() },
    });
    await writeAudit(tx, {
      action: "INVITATION_REVOKED",
      userId: invitedById,
      entityType: "Invitation",
      entityId: invitation.id,
    });
  }
  const token = randomBytes(32).toString("base64url");
  const invitation = await tx.invitation.create({
    data: {
      ...data,
      invitedById,
      tokenHash: invitationTokenHash(token),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  await writeAudit(tx, {
    action: "INVITATION_CREATED",
    userId: invitedById,
    entityType: "Invitation",
    entityId: invitation.id,
  });
  return { invitation, token };
}
export async function createInvitation(
  db: PrismaClient,
  actorId: string,
  input: unknown,
  sessionId?: string,
) {
  const data = invitationSchema.parse(input);
  return db.$transaction(async (tx) => {
    await lockUsers(tx, [actorId]);
    if (sessionId) await serviceAccess(tx, { userId: actorId, sessionId });
    await assertAdmin(tx, actorId);
    return insertInvitation(tx, data, actorId);
  });
}
/** Only called from the operator CLI, never from an HTTP endpoint. */
export async function createBootstrapInvitation(
  db: PrismaClient,
  email: string,
) {
  const normalized = emailSchema.parse(email);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('harnois:bootstrap-admin', 0))`;
    if (await tx.user.count({ where: { role: "ADMIN" } }))
      throw new ServiceError("ADMIN_ALREADY_EXISTS");
    return insertInvitation(tx, { email: normalized, role: "ADMIN" });
  });
}
export async function revokeInvitation(
  db: PrismaClient,
  actorId: string,
  invitationId: string,
  sessionId?: string,
) {
  return db.$transaction(async (tx) => {
    await lockUsers(tx, [actorId]);
    if (sessionId) await serviceAccess(tx, { userId: actorId, sessionId });
    const actor = await assertAdmin(tx, actorId);
    const invitation = await tx.invitation.findUnique({
      where: { id: invitationId },
    });
    if (!invitation) throw new ServiceError("INVITATION_INVALID");
    assertPermission(actor, "archive", {
      type: "invitations",
      invitationRole: invitation.role,
    });
    if (invitation.revokedAt) return;
    // Also permits recovery of a reservation whose subsequent user creation failed.
    await tx.invitation.update({
      where: { id: invitationId },
      data: { revokedAt: new Date() },
    });
    await writeAudit(tx, {
      action: "INVITATION_REVOKED",
      userId: actorId,
      entityType: "Invitation",
      entityId: invitationId,
    });
  });
}
export async function findInvitationByToken(db: PrismaClient, token: string) {
  const parsed = invitationTokenSchema.safeParse(token);
  if (!parsed.success) throw new ServiceError("INVITATION_INVALID");
  const invitation = await db.invitation.findUnique({
    where: { tokenHash: invitationTokenHash(parsed.data) },
  });
  if (
    !invitation ||
    invitation.acceptedAt ||
    invitation.revokedAt ||
    invitation.expiresAt <= new Date()
  )
    throw new ServiceError("INVITATION_INVALID");
  return invitation;
}
export async function checkInvitation(
  db: PrismaClient,
  invitationId: string,
  email: string,
) {
  const normalized = emailSchema.parse(email);
  const invitation = await db.invitation.findUnique({
    where: { id: invitationId },
  });
  if (
    !invitation ||
    invitation.acceptedAt ||
    invitation.revokedAt ||
    invitation.expiresAt <= new Date()
  )
    throw new ServiceError("INVITATION_INVALID");
  if (emailSchema.parse(invitation.email) !== normalized)
    throw new ServiceError("INVITATION_EMAIL_MISMATCH");
  if (await db.user.findUnique({ where: { email: normalized } }))
    throw new ServiceError("USER_ALREADY_EXISTS");
  if (
    invitation.employeeId &&
    (await db.user.findUnique({ where: { employeeId: invitation.employeeId } }))
  )
    throw new ServiceError("EMPLOYEE_ALREADY_LINKED");
  return invitation;
}
export async function reserveInvitation(
  db: PrismaClient,
  invitationId: string,
  email: string,
) {
  const normalized = emailSchema.parse(email);
  const invitation = await checkInvitation(db, invitationId, normalized);
  const now = new Date();
  const reserved = await db.invitation.updateMany({
    where: {
      id: invitation.id,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    data: { acceptedAt: now },
  });
  if (reserved.count !== 1) throw new ServiceError("INVITATION_INVALID");
  // This reservation intentionally commits independently of Better Auth's creation.
  return {
    email: normalized,
    role: invitation.role,
    employeeId: invitation.employeeId,
    emailVerified: true as const,
    isActive: true,
    mfaEnforced: false,
  };
}
export async function invitationOverview(db: PrismaClient, actorId: string) {
  const actor = await assertAdmin(db, actorId);
  const [invitations, employees] = await Promise.all([
    db.invitation.findMany({
      where:
        actor.role === "ADMIN"
          ? {}
          : { role: { in: ["TECHNICIAN", "EMPLOYEE"] } },
      take: 50,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        role: true,
        acceptedAt: true,
        revokedAt: true,
        expiresAt: true,
      },
    }),
    db.employee.findMany({
      where: { user: null },
      orderBy: { lastName: "asc" },
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);
  const registered = new Set(
    (
      await db.user.findMany({
        where: { email: { in: invitations.map((item) => item.email) } },
        select: { email: true },
      })
    ).map((user) => user.email),
  );
  return {
    allowedRoles: (
      ["ADMIN", "IT_MANAGER", "TECHNICIAN", "EMPLOYEE"] as const
    ).filter((role) =>
      can(actor, "create", { type: "invitations", invitationRole: role }),
    ),
    employees,
    invitations: invitations.map((item) => ({
      id: item.id,
      email: item.email,
      role: item.role,
      revocable:
        !item.revokedAt && (!item.acceptedAt || !registered.has(item.email)),
      status: item.revokedAt
        ? "Révoquée"
        : item.acceptedAt
          ? registered.has(item.email)
            ? "Acceptée"
            : "Réservée sans compte : révoquez puis réinvitez"
          : item.expiresAt <= new Date()
            ? "Expirée"
            : "En attente",
    })),
  };
}
