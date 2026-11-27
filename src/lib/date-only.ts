import { z } from "zod";

/** Civil dates use UTC midnight for PostgreSQL date, never a browser timezone. */
export const dateOnlySchema = z.iso
  .date({ error: "Date de calendrier invalide." })
  .refine((value) => !value.startsWith("0000"), "Année invalide.");
export function parseCivilDate(value: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  return dateOnlySchema.parse(
    match ? `${match[3]}-${match[2]}-${match[1]}` : value,
  );
}
export function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}
export function todayInParis(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function displayCivilDate(value: string | null): string {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
