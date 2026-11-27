import "server-only";
import type { Prisma } from "@/generated/prisma/client";

/** Global order: administrators, staff, sorted users, references, employees.
 * Every operation changing a user/employee link uses both advisory locks first.
 */
export async function lockStaff(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('harnois:active-administrators', 0))`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('harnois:staff', 0))`;
}
