import { describe, expect, it } from "vitest";
import { currencySchema, emailSchema } from "@/lib/validation";

describe("emailSchema", () => {
  it("normalizes whitespace and case before validation", () => {
    expect(emailSchema.parse("  Alice.Example+IT@EXAMPLE.COM \n")).toBe(
      "alice.example+it@example.com",
    );
  });
  it("uses the same canonical value for a lookup and a write", () => {
    expect(emailSchema.parse(" ALICE@example.com ")).toBe(
      emailSchema.parse("alice@EXAMPLE.COM"),
    );
  });
  it.each([
    "",
    "   ",
    "alice",
    "alice @example.com",
    "alice@example",
    null,
    42,
  ])("rejects an invalid email: %s", (value) => {
    expect(emailSchema.safeParse(value).success).toBe(false);
  });
  it("is idempotent", () => {
    const email = emailSchema.parse(" Alice@Example.com ");
    expect(emailSchema.parse(email)).toBe(email);
  });
});

describe("currencySchema", () => {
  it("accepts only EUR", () => {
    expect(currencySchema.parse("EUR")).toBe("EUR");
    for (const value of ["USD", "eur", "", null])
      expect(currencySchema.safeParse(value).success).toBe(false);
  });
});
