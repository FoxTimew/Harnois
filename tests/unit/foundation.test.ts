import { expect, it } from "vitest";
import { formatMoney, formatDate, parisDayBoundary } from "@/lib/format";
import { csvCell } from "@/lib/csv";
import { sanitizeAudit, sensitiveAuditFields } from "@/server/services/audit";
import { userQuerySchema, auditQuerySchema } from "@/lib/table-query";
import { describeDevice } from "@/lib/user-agent";
it.each(sensitiveAuditFields)(
  "removes sensitive audit field %s recursively and with key aliases",
  (field) => {
    const alias = field.toUpperCase().split("").join("_");
    const cleaned = sanitizeAudit({
      before: { [field]: "SECRET", role: "ADMIN" },
      after: [{ [alias]: "SECRET", isActive: false }],
    });
    expect(JSON.stringify(cleaned)).not.toContain("SECRET");
    expect(cleaned).toEqual({
      before: { role: "ADMIN" },
      after: [{ isActive: false }],
    });
  },
);
it("bounds legacy audit recursion and strips prefixed secret fields", () => {
  expect(
    sanitizeAudit({
      oauthAccessToken: "secret",
      nested: { encryptedLicenseKey: "secret" },
      count: 1,
    }),
  ).toEqual({ nested: {}, count: 1 });
  let data: unknown = "private";
  for (let i = 0; i < 20; i++) data = { x: data };
  expect(JSON.stringify(sanitizeAudit(data))).not.toContain("private");
});
it.each(["=1+1", "+cmd", "-1", "@SUM(A1)", " \t=FORMULA()", "\r+cmd"])(
  "neutralizes spreadsheet formula %j",
  (value) => {
    expect(csvCell(value)).toBe('"' + "'" + value + '"');
  },
);
it("quotes CSV separators, quotes and line breaks", () => {
  expect(csvCell('a;"b"\r\nc')).toBe('"a;""b""\r\nc"');
});
it("formats Decimal amounts without binary floating conversion", () => {
  expect(formatMoney("9007199254740993.89")).toBe("9 007 199 254 740 993,89 €");
  expect(formatMoney("-0.01")).toBe("−0,01 €");
  expect(formatMoney("1234.567")).toBe("1 234,57 €");
});
it("uses Paris dates and correct DST calendar-day boundaries", () => {
  expect(formatDate("2026-01-01T23:30:00Z")).toContain("2 janv. 2026");
  expect(parisDayBoundary("2026-03-29").toISOString()).toBe(
    "2026-03-28T23:00:00.000Z",
  );
  expect(parisDayBoundary("2026-03-29", true).toISOString()).toBe(
    "2026-03-29T22:00:00.000Z",
  );
  expect(
    +parisDayBoundary("2026-10-25", true) - +parisDayBoundary("2026-10-25"),
  ).toBe(25 * 3600_000);
});
it("bounds and allowlists user-controlled table query fields", () => {
  expect(
    userQuerySchema.parse({
      page: -2,
      pageSize: 999999,
      sort: "password",
      q: "  Alice@EXAMPLE.COM  ",
    }),
  ).toMatchObject({
    page: 1,
    pageSize: 25,
    sort: "name",
    q: "Alice@EXAMPLE.COM",
  });
  expect(
    auditQuerySchema.parse({
      action: "=formula",
      from: "2026-02-30",
      entityType: "bad name",
    }),
  ).toMatchObject({
    action: undefined,
    from: undefined,
    entityType: undefined,
  });
});
it("treats browser metadata as a bounded display hint", () => {
  expect(describeDevice("Mozilla Windows Chrome/130 Edg/130")).toBe(
    "Edge · Windows",
  );
  expect(describeDevice(null)).toBe("Navigateur inconnu · Appareil inconnu");
});
