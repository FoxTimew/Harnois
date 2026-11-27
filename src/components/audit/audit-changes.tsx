import { auditValueLabel } from "@/lib/audit-labels";

const labels: Record<string, string> = {
  before: "Avant",
  after: "Après",
  role: "Rôle",
  isActive: "Actif",
  employeeId: "Employé lié",
  count: "Nombre",
  scope: "Périmètre",
  filters: "Filtres",
  from: "Du",
  to: "Au",
  sort: "Tri",
  order: "Ordre",
  providerId: "Fournisseur",
  method: "Méthode",
  reason: "Motif",
  action: "Action",
  entityType: "Type d’entité",
  entityId: "Identifiant d’entité",
  userId: "Identifiant auteur",
};
export function AuditChanges({
  value,
  field = "",
}: {
  value: unknown;
  field?: string;
}) {
  if (value == null)
    return <span className="text-muted-foreground">Non renseigné</span>;
  if (typeof value === "boolean") return <span>{value ? "Oui" : "Non"}</span>;
  if (typeof value !== "object")
    return (
      <span className="break-all">{auditValueLabel(field, String(value))}</span>
    );
  if (Array.isArray(value))
    return (
      <ul className="space-y-2">
        {value.map((item, i) => (
          <li key={i}>
            <AuditChanges value={item} field={field} />
          </li>
        ))}
      </ul>
    );
  const entries = Object.entries(value);
  if (!entries.length)
    return (
      <p className="text-muted-foreground">
        Aucun changement détaillé conservé.
      </p>
    );
  return (
    <dl className="space-y-4">
      {entries.map(([key, item]) => (
        <div key={key} className="rounded-lg border p-4">
          <dt className="mb-2 text-xs font-medium text-muted-foreground">
            {labels[key] ?? key}
          </dt>
          <dd className="text-sm">
            <AuditChanges value={item} field={key} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
