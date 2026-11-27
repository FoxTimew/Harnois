import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
import { getDb } from "@/server/db";
import { employeeSearchText } from "@/server/services/employee-invariants";
const db = getDb();
it("backfills existing accented/decomposed names and whitespace with the migration SQL", async () => {
  const sql = readFileSync(
    new URL(
      "../../prisma/migrations/20261127132955_employee_search_text/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const update = sql
    .slice(
      sql.indexOf('UPDATE "Employee"'),
      sql.indexOf('ALTER TABLE "Employee" ALTER'),
    )
    .replace('UPDATE "Employee"', 'UPDATE "SearchBackfillFixture"');
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      'CREATE TEMP TABLE "SearchBackfillFixture" ("firstName" text, "lastName" text, "email" text, "searchText" text) ON COMMIT DROP',
    );
    for (const fields of [
      {
        firstName: "Céline",
        lastName: "Lefèvre",
        email: "CELINE@EXAMPLE.INVALID",
      },
      {
        firstName: " Élo\u0301die\u00A0",
        lastName: "  Du\tPré ",
        email: "elodie@example.invalid",
      },
    ]) {
      await tx.$executeRaw`INSERT INTO "SearchBackfillFixture" ("firstName","lastName","email") VALUES (${fields.firstName},${fields.lastName},${fields.email})`;
    }
    await tx.$executeRawUnsafe(update);
    const rows = await tx.$queryRaw<
      {
        firstName: string;
        lastName: string;
        email: string;
        searchText: string;
      }[]
    >`SELECT * FROM "SearchBackfillFixture"`;
    expect(
      rows.every((row) => row.searchText === employeeSearchText(row)),
    ).toBe(true);
  });
});
it("has a valid GIN trigram index eligible for a true substring query", async () => {
  await db.$transaction(async (tx) => {
    const indexes = await tx.$queryRaw<
      { indexdef: string }[]
    >`SELECT indexdef FROM pg_indexes WHERE tablename = 'Employee' AND indexname = 'Employee_searchText_idx'`;
    expect(indexes[0].indexdef).toContain("USING gin");
    expect(indexes[0].indexdef).toContain("gin_trgm_ops");
    await tx.$executeRawUnsafe("SET LOCAL enable_seqscan = off");
    const plan = await tx.$queryRawUnsafe<unknown[]>(
      'EXPLAIN (FORMAT JSON) SELECT id FROM "Employee" WHERE "searchText" LIKE \'%fevre%\'',
    );
    expect(JSON.stringify(plan)).toContain("Employee_searchText_idx");
  });
});
