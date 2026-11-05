import { z } from "zod";

/** Use the same normalization for lookups and writes. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

export const currencySchema = z.literal("EUR");
