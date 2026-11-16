import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/server/db";
import { demoData, seedDemoData } from "../../prisma/seed-data";

const db = getDb();
const rollback = new Error("test transaction rollback");

async function isolated(work: (tx: Prisma.TransactionClient) => Promise<void>) {
  try {
    await db.$transaction(
      async (tx) => {
        await work(tx);
        throw rollback;
      },
      { timeout: 12000 },
    );
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

afterAll(async () => {
  await db.$disconnect();
});

describe("PostgreSQL integration", () => {
  it("writes and reads a row, then rolls back its own data", async () => {
    const name = `test-${randomUUID()}`;
    await isolated(async (tx) => {
      const created = await tx.organization.create({ data: { name } });
      expect(
        await tx.organization.findUnique({ where: { id: created.id } }),
      ).toMatchObject({ id: created.id, name });
    });
    expect(await db.organization.findUnique({ where: { name } })).toBeNull();
  });

  it("seeds the exact demo reference data idempotently", async () => {
    await isolated(async (tx) => {
      const first = await seedDemoData(tx);
      const second = await seedDemoData(tx);
      expect(second).toEqual(first);
      expect(
        await tx.organization.count({ where: { name: demoData.organization } }),
      ).toBe(1);
      expect(
        await tx.department.count({
          where: { organizationId: first.organization.id },
        }),
      ).toBe(2);
      expect(
        await tx.location.count({ where: { name: demoData.location } }),
      ).toBe(1);
      expect(
        await tx.category.count({
          where: { name: { in: [...demoData.categories] } },
        }),
      ).toBe(5);
    });
  });

  it("has all four valid unique partial indexes in PostgreSQL", async () => {
    const rows = await db.$queryRaw<
      { name: string; unique: boolean; valid: boolean; predicate: string }[]
    >`
      SELECT c.relname AS name, i.indisunique AS unique, i.indisvalid AS valid,
        pg_get_expr(i.indpred, i.indrelid) AS predicate
      FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = current_schema() AND c.relname IN (
        'EquipmentAssignment_active_equipment_key', 'License_active_subscription_employee_key',
        'AccountAccess_active_account_employee_key', 'Invitation_pending_email_key'
      )`;
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.unique).toBe(true);
      expect(row.valid).toBe(true);
      expect(row.predicate).toContain("IS NULL");
    }
  });

  it("allows assignment history but rejects two active assignments", async () => {
    await isolated(async (tx) => {
      const id = randomUUID();
      const employee = await tx.employee.create({
        data: {
          firstName: "Test",
          lastName: "Fixture",
          email: `${id}@example.invalid`,
        },
      });
      const category = await tx.category.create({ data: { name: id } });
      const equipment = await tx.equipment.create({
        data: { name: id, assetTag: id, categoryId: category.id },
      });
      const data = { equipmentId: equipment.id, employeeId: employee.id };
      await tx.equipmentAssignment.create({
        data: { ...data, returnedAt: new Date() },
      });
      await tx.equipmentAssignment.create({ data });
      await expect(
        tx.equipmentAssignment.create({ data }),
      ).rejects.toMatchObject({ code: "P2002" });
    });
  });

  it("allows revoked licenses but rejects duplicate active seats", async () => {
    await isolated(async (tx) => {
      const id = randomUUID();
      const employee = await tx.employee.create({
        data: {
          firstName: "Test",
          lastName: "Fixture",
          email: `${id}@example.invalid`,
        },
      });
      const software = await tx.software.create({ data: { name: id } });
      const plan = await tx.softwarePlan.create({
        data: { name: id, softwareId: software.id },
      });
      const subscription = await tx.subscription.create({
        data: { planId: plan.id, unitPrice: "10.50", startDate: new Date() },
      });
      const data = { subscriptionId: subscription.id, employeeId: employee.id };
      await tx.license.create({ data: { ...data, revokedAt: new Date() } });
      await tx.license.create({ data });
      await expect(tx.license.create({ data })).rejects.toMatchObject({
        code: "P2002",
      });
    });
  });

  it("allows revoked accesses but rejects duplicate active accesses", async () => {
    await isolated(async (tx) => {
      const id = randomUUID();
      const employee = await tx.employee.create({
        data: {
          firstName: "Test",
          lastName: "Fixture",
          email: `${id}@example.invalid`,
        },
      });
      const software = await tx.software.create({ data: { name: id } });
      const account = await tx.softwareAccount.create({
        data: { softwareId: software.id, identifier: id },
      });
      const data = { accountId: account.id, employeeId: employee.id };
      await tx.accountAccess.create({
        data: { ...data, revokedAt: new Date() },
      });
      await tx.accountAccess.create({ data });
      await expect(tx.accountAccess.create({ data })).rejects.toMatchObject({
        code: "P2002",
      });
    });
  });

  it("allows closed invitations but reserves an expired pending invitation", async () => {
    await isolated(async (tx) => {
      const email = `${randomUUID()}@example.invalid`;
      const data = { email, expiresAt: new Date("2020-01-01") };
      await tx.invitation.create({
        data: { ...data, tokenHash: randomUUID(), acceptedAt: new Date() },
      });
      await tx.invitation.create({
        data: { ...data, tokenHash: randomUUID(), revokedAt: new Date() },
      });
      await tx.invitation.create({
        data: { ...data, tokenHash: randomUUID() },
      });
      await expect(
        tx.invitation.create({ data: { ...data, tokenHash: randomUUID() } }),
      ).rejects.toMatchObject({ code: "P2002" });
    });
  });
});
