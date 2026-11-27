import { z } from "zod";
/** Canonical decimal text only: no floating-point conversion at any stage. */
export const euroAmountSchema = z
  .string()
  .trim()
  .max(30)
  .transform((value) =>
    value.replace(/[\u0020\u00a0\u202f]/g, "").replace(",", "."),
  )
  .pipe(
    z
      .string()
      .regex(
        /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/,
        "Montant positif en euros, avec deux décimales maximum.",
      ),
  )
  .transform((value) => {
    const [whole, fraction = ""] = value.split(".");
    return whole + "." + fraction.padEnd(2, "0");
  });
