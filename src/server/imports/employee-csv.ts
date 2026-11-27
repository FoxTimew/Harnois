import "server-only";
import { csvRow } from "@/lib/csv";
import { readCsv, maxImportFileBytes, maxImportRows } from "./csv";
export { csvOptionsSchema, type CsvOptions } from "./csv";
export const maxEmployeeFileBytes = maxImportFileBytes;
export const maxEmployeeRows = maxImportRows;
export const employeeCsvColumns = [
  "email",
  "prenom",
  "nom",
  "telephone",
  "poste",
  "statut",
  "date_arrivee",
  "date_depart",
  "organisation",
  "pole",
  "site",
  "manager_email",
] as const;
export type EmployeeCsvColumn = (typeof employeeCsvColumns)[number];
export function readEmployeeCsv(bytes: Uint8Array, input: unknown = {}) {
  return readCsv(bytes, employeeCsvColumns, ["email", "prenom", "nom"], input);
}
export function employeeCsvTemplate() {
  return (
    "\uFEFF" +
    csvRow([...employeeCsvColumns]) +
    csvRow([
      "celine.lefevre@example.invalid",
      "Céline",
      "Lefèvre",
      "",
      "Responsable support",
      "En arrivée",
      "15/01/2027",
      "",
      "Harnois Démonstration",
      "Informatique",
      "Siège Démonstration",
      "",
    ])
  );
}
