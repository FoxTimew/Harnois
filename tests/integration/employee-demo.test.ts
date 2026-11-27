import { randomUUID } from "node:crypto";
import { beforeEach, afterEach, it, expect } from "vitest";
import { authFixture, type AuthFixture } from "../fixtures/auth";
import { seedDemoEmployees } from "@/server/services/employee-demo";
import { demoEmployees } from "../../prisma/employee-demo-data";
import { employeeSearchText } from "@/server/services/employee-invariants";
import { employeeFixtureFields } from "../fixtures/employees";
let f: AuthFixture;
beforeEach(() => {
  f = authFixture();
});
afterEach(async () => {
  await f.cleanup();
});
it("refuses demo writes without the exact environment opt-in", async () => {
  const before = await f.db.employee.count();
  await expect(seedDemoEmployees(f.db, "TRUE")).rejects.toMatchObject({
    code: "DEMO_SEED_NOT_ALLOWED",
  });
  expect(await f.db.employee.count()).toBe(before);
});
it("refuses any employee outside the fictitious identity manifest", async () => {
  await f.db.employee.create({
    data: employeeFixtureFields(randomUUID() + "@example.invalid"),
  });
  await expect(seedDemoEmployees(f.db, "true")).rejects.toMatchObject({
    code: "DEMO_SEED_REAL_DATA",
  });
});
it("creates 50 fictional employees idempotently with normalized search and valid managers", async () => {
  expect(await seedDemoEmployees(f.db, "true")).toEqual({
    created: 50,
    existing: 0,
  });
  const first = await f.db.employee.findMany({
    where: { id: { in: demoEmployees.map((row) => row.id) } },
    orderBy: { id: "asc" },
  });
  expect(await seedDemoEmployees(f.db, "true")).toEqual({
    created: 0,
    existing: 50,
  });
  const second = await f.db.employee.findMany({
    where: { id: { in: demoEmployees.map((row) => row.id) } },
    orderBy: { id: "asc" },
  });
  expect(second).toEqual(first);
  expect(first.every((row) => row.searchText === employeeSearchText(row))).toBe(
    true,
  );
  expect(
    first.every(
      (row) =>
        !row.managerId ||
        first.find((manager) => manager.id === row.managerId)?.status !==
          "LEFT",
    ),
  ).toBe(true);
  expect(
    await f.db.user.count({
      where: { employeeId: { in: first.map((row) => row.id) } },
    }),
  ).toBe(0);
});
it("refuses a changed fictitious identity without overwriting it", async () => {
  await seedDemoEmployees(f.db, "true");
  await f.db.employee.update({
    where: { id: demoEmployees[0].id },
    data: { lastName: "Changed" },
  });
  await expect(seedDemoEmployees(f.db, "true")).rejects.toMatchObject({
    code: "DEMO_SEED_REAL_DATA",
  });
  expect(
    (
      await f.db.employee.findUniqueOrThrow({
        where: { id: demoEmployees[0].id },
      })
    ).lastName,
  ).toBe("Changed");
});
