import { describe, it, expect } from "vitest";
import {
  employeeFieldsSchema,
  normalizeSearch,
  parseEmployeeStatus,
  employeeStatuses,
} from "@/lib/employee-validation";
import { phoneSchema } from "@/lib/phone";
import { parseCivilDate, todayInParis } from "@/lib/date-only";
import {
  hierarchyProblems,
  employeeSearchText,
  validateEmployeeTransition,
} from "@/server/services/employee-invariants";
import {
  readEmployeeCsv,
  employeeCsvTemplate,
} from "@/server/imports/employee-csv";
const bytes = (value: string) => Buffer.from(value);
describe("employee normalization and civil dates", () => {
  it.each(["Céline", "CÉLINE", " cÉlInE "])(
    "normalizes %s using Unicode decomposition",
    (value) => expect(normalizeSearch(value)).toBe("celine"),
  );
  it("builds the search projection from first name, last name and email", () =>
    expect(
      employeeSearchText({
        firstName: "Céline",
        lastName: "Lefèvre",
        email: "CÉLINE@EXAMPLE.INVALID",
      }),
    ).toBe("celine lefevre celine@example.invalid"));
  it.each(["ONBOARDING", "en arrivée", "EN ARRIVEE", "En aRrIvEe"])(
    "accepts status alias %s",
    (value) => expect(parseEmployeeStatus(value)).toBe("ONBOARDING"),
  );
  it.each(["Actif", "ACTIVE", "active"])("accepts active alias %s", (value) =>
    expect(parseEmployeeStatus(value)).toBe("ACTIVE"),
  );
  it.each(["En départ", "en depart", "OFFBOARDING"])(
    "accepts offboarding alias %s",
    (value) => expect(parseEmployeeStatus(value)).toBe("OFFBOARDING"),
  );
  it.each(["Parti", "LEFT", "left"])("accepts departed alias %s", (value) =>
    expect(parseEmployeeStatus(value)).toBe("LEFT"),
  );
  it("rejects an unknown status", () =>
    expect(() => parseEmployeeStatus("autre")).toThrow());
  it("normalizes an international phone to E164", () =>
    expect(phoneSchema.parse("+33 6 12 34 56 78")).toBe("+33612345678"));
  it.each(["0612345678", "+33 0 0", "+33 6 12 34 56 78 ext. 12"])(
    "rejects invalid or ambiguous phone %s",
    (value) => expect(phoneSchema.safeParse(value).success).toBe(false),
  );
  it.each(["31/02/2026", "2026-13-01", "46000", "1/2/2026", "0000-01-01"])(
    "rejects invalid date %s",
    (value) => expect(() => parseCivilDate(value)).toThrow(),
  );
  it("accepts both strict calendar formats", () => {
    expect(parseCivilDate("29/02/2024")).toBe("2024-02-29");
    expect(parseCivilDate("2024-02-29")).toBe("2024-02-29");
  });
  it("uses the civil day in Paris around UTC midnight", () =>
    expect(todayInParis(new Date("2026-07-01T22:30:00Z"))).toBe("2026-07-02"));
  it("rejects a browser-supplied searchText", () =>
    expect(
      employeeFieldsSchema.safeParse({ searchText: "tampered" }).success,
    ).toBe(false));
});
describe("state and hierarchy invariants", () => {
  const allowed = new Set([
    "ONBOARDING:ACTIVE",
    "ONBOARDING:LEFT",
    "ACTIVE:OFFBOARDING",
    "ACTIVE:LEFT",
    "OFFBOARDING:ACTIVE",
    "OFFBOARDING:LEFT",
    "LEFT:ONBOARDING",
  ]);
  it.each(
    employeeStatuses.flatMap((before) =>
      employeeStatuses.map((after) => [before, after] as const),
    ),
  )("%s -> %s matches the state machine", (before, after) => {
    const operation = () =>
      validateEmployeeTransition(before, after, "ADMIN", true);
    if (before === after || allowed.has(before + ":" + after))
      expect(operation).not.toThrow();
    else expect(operation).toThrow();
  });
  it("requires confirmation for immediate departure", () =>
    expect(() =>
      validateEmployeeTransition("ACTIVE", "LEFT", "ADMIN", false),
    ).toThrow("IMMEDIATE_DEPARTURE_CONFIRMATION_REQUIRED"));
  it("reserves reentry to administrators", () =>
    expect(() =>
      validateEmployeeTransition("LEFT", "ONBOARDING", "IT_MANAGER", false),
    ).toThrow("FORBIDDEN"));
  it("finds a cycle beyond 2000 levels", () => {
    const nodes = Array.from({ length: 2001 }, (_, index) => ({
      id: String(index),
      managerId: index === 2000 ? "0" : String(index + 1),
      status: "ACTIVE" as const,
    }));
    expect(hierarchyProblems(nodes).size).toBe(2001);
    nodes[2000].managerId = "";
    expect(hierarchyProblems(nodes).size).toBe(0);
  });
});
describe("bounded Excel CSV reader", () => {
  it("reads a French template and its labels", () => {
    const result = readEmployeeCsv(bytes(employeeCsvTemplate()));
    expect(result.delimiter).toBe(";");
    expect(result.records[0].cells.statut).toBe("En arrivée");
  });
  it("decodes Windows-1252 including accents and the euro sign", () => {
    const input = Buffer.from(
      "email;prenom;nom;poste;date_arrivee\r\na@example.invalid;Céline;Lefèvre;Budget \x80;15/01/2026",
      "latin1",
    );
    const result = readEmployeeCsv(input);
    expect(result.encoding).toBe("windows-1252");
    expect(result.records[0].cells.poste).toBe("Budget €");
  });
  it("handles comma, quoted separators and multiline cells", () => {
    const result = readEmployeeCsv(
      bytes(
        'email,prenom,nom,poste\na@example.invalid,A,B,"Support; niveau 1\net 2"',
      ),
    );
    expect(result.delimiter).toBe(",");
    expect(result.records[0].cells.poste).toContain("\n");
  });
  it.each([
    "email;prenom;nom;email\na@b.invalid;a;b;a@b.invalid",
    "email;prenom;nom;searchText\na@b.invalid;a;b;tamper",
    'email;prenom;nom\na@b.invalid;"unterminated;b',
  ])("rejects malformed or unknown columns", (input) =>
    expect(() => readEmployeeCsv(bytes(input))).toThrow("INVALID_CSV"),
  );
  it("preserves malformed row lengths for the preview", () =>
    expect(
      readEmployeeCsv(bytes("email;prenom;nom\na@b.invalid;A")).records[0]
        .invalidLength,
    ).toBe(true));
  it("rejects over 1000 records", () =>
    expect(() =>
      readEmployeeCsv(
        bytes("email;prenom;nom\n" + "a@b.invalid;a;b\n".repeat(1001)),
      ),
    ).toThrow("IMPORT_TOO_LARGE"));
  it("rejects over 2 MiB before parsing", () =>
    expect(() => readEmployeeCsv(new Uint8Array(2 * 1024 * 1024 + 1))).toThrow(
      "IMPORT_TOO_LARGE",
    ));
  it("rejects UTF16 and corrupted BOM UTF8", () => {
    expect(() => readEmployeeCsv(Uint8Array.from([255, 254, 65, 0]))).toThrow(
      "INVALID_CSV",
    );
    expect(() =>
      readEmployeeCsv(Uint8Array.from([239, 187, 191, 255])),
    ).toThrow("INVALID_CSV");
  });
});
