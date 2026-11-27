import "server-only";
import { readCsv } from "./csv";
import { csvRow } from "@/lib/csv";
export const equipmentCsvColumns = [
  "numero_inventaire",
  "designation",
  "categorie",
  "marque",
  "modele",
  "numero_serie",
  "statut",
  "etat",
  "date_achat",
  "prix_achat",
  "fin_garantie",
  "amortissement_mois",
  "fournisseur",
  "site",
  "employe_email",
  "retour_prevu",
] as const;
export function readEquipmentCsv(bytes: Uint8Array, options: unknown = {}) {
  return readCsv(
    bytes,
    equipmentCsvColumns,
    ["designation", "categorie"],
    options,
  );
}
export function equipmentCsvTemplate() {
  return (
    "\uFEFF" +
    csvRow([...equipmentCsvColumns]) +
    csvRow([
      "",
      "Ordinateur portable démonstration",
      "Informatique > Portables",
      "Exemple",
      "Bureau 14",
      "",
      "En stock",
      "Neuf",
      "15/01/2026",
      "1 299,90",
      "15/01/2029",
      "36",
      "Fournisseur Démonstration",
      "Siège Démonstration",
      "",
      "",
    ])
  );
}
