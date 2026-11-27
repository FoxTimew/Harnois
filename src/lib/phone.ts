import { parsePhoneNumberWithError } from "libphonenumber-js/max";
import { z } from "zod";

export const phoneSchema = z
  .string()
  .trim()
  .max(60, "60 caractères maximum.")
  .transform((value, ctx) => {
    try {
      if (!value.startsWith("+")) throw new Error();
      const phone = parsePhoneNumberWithError(value, { extract: false });
      if (!phone.isValid() || phone.ext) throw new Error();
      return phone.number as string;
    } catch {
      ctx.addIssue({
        code: "custom",
        message:
          "Indiquez un numéro international valide, avec + et sans extension.",
      });
      return z.NEVER;
    }
  });
