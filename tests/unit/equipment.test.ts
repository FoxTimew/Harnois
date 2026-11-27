import { describe, it, expect } from "vitest";
import { euroAmountSchema } from "@/lib/money";
import {
  equipmentIndicators,
  parseEquipmentLabel,
  equipmentStatusLabels,
  equipmentFieldsSchema,
} from "@/lib/equipment-validation";
import { specsMatch, specDefinitionsSchema } from "@/lib/equipment-specs";
import {
  equipmentUrl,
  scannedEquipmentPath,
  labelOptionsSchema,
} from "@/lib/equipment-qr";
import {
  readEquipmentCsv,
  equipmentCsvTemplate,
} from "@/server/imports/equipment-csv";
describe("equipment validation", () => {
  it.each([
    ["1 299,90", "1299.90"],
    ["12", "12.00"],
    ["1\u202f299,9", "1299.90"],
  ])("parses exact euro amounts %s", (input, output) =>
    expect(euroAmountSchema.parse(input)).toBe(output),
  );
  it.each(["-1", "1.234", "1e3", "Infinity", "100000000.00"])(
    "rejects invalid amount %s",
    (input) => expect(euroAmountSchema.safeParse(input).success).toBe(false),
  );
  it("calculates warranty and clamped calendar depreciation", () => {
    expect(
      equipmentIndicators(
        {
          purchaseDate: "2024-01-31",
          depreciationMonths: 1,
          warrantyEndDate: "2024-04-01",
        },
        "2024-02-29",
      ),
    ).toEqual({
      warrantyExpired: false,
      warrantySoon: true,
      depreciated: true,
    });
  });
  it("accepts French labels without case or accents", () =>
    expect(parseEquipmentLabel("EN RePARATION", equipmentStatusLabels)).toBe(
      "IN_REPAIR",
    ));
  it("rejects client supplied derived search text", () =>
    expect(
      equipmentFieldsSchema.safeParse({
        name: "Test",
        categoryId: "test",
        searchText: "forged",
      }).success,
    ).toBe(false));
  it("preserves disabled values and rejects edited values", () => {
    const defs = specDefinitionsSchema.parse([
      { key: "ram", label: "RAM", type: "number", disabled: true },
    ]);
    expect(specsMatch(defs, { ram: 16 }, { ram: 16 })).toBe(true);
    expect(specsMatch(defs, { ram: 32 }, { ram: 16 })).toBe(false);
  });
  it("rejects invalid types and prototype spec keys", () => {
    expect(
      specDefinitionsSchema.safeParse([
        { key: "constructor", label: "x", type: "text" },
      ]).success,
    ).toBe(false);
    expect(
      specsMatch(
        specDefinitionsSchema.parse([
          { key: "ram", label: "RAM", type: "number" },
        ]),
        { ram: "16" },
      ),
    ).toBe(false);
  });
  it("uses an immutable ID and rejects external QR URLs", () => {
    expect(equipmentUrl("https://inventory.example.invalid", "item_123")).toBe(
      "https://inventory.example.invalid/equipment/item_123",
    );
    expect(
      scannedEquipmentPath(
        "https://inventory.example.invalid/equipment/item_123",
        "https://inventory.example.invalid",
      ),
    ).toBe("/equipment/item_123");
    for (const url of [
      "https://evil.invalid/equipment/item_123",
      "javascript:alert(1)",
      "https://inventory.example.invalid/admin/users",
      "https://inventory.example.invalid/equipment/item_123?next=evil",
      "https://user@inventory.example.invalid/equipment/item_123",
    ])
      expect(() =>
        scannedEquipmentPath(url, "https://inventory.example.invalid"),
      ).toThrow();
  });
  it("bounds label placement to the physical A4 sheet", () => {
    expect(labelOptionsSchema.safeParse({ ids: ["one"] }).success).toBe(true);
    expect(
      labelOptionsSchema.safeParse({ ids: ["one"], marginLeft: 13 }).success,
    ).toBe(false);
    expect(
      labelOptionsSchema.safeParse({ ids: ["one", "two"], format: "single" })
        .success,
    ).toBe(false);
  });
  it("reads the downloadable template and Windows-1252 data", () => {
    expect(
      readEquipmentCsv(Buffer.from(equipmentCsvTemplate())).records[0].cells
        .prix_achat,
    ).toBe("1 299,90");
    const bytes = Buffer.from(
      "designation;categorie\n\xc9cran;Moniteurs",
      "latin1",
    );
    expect(readEquipmentCsv(bytes).records[0].cells.designation).toBe("Écran");
  });
});
