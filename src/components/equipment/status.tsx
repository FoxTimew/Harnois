import {
  equipmentStatusLabels,
  conditionLabels,
  type EquipmentState,
} from "@/lib/equipment-validation";
export function EquipmentStatus({ status }: { status: EquipmentState }) {
  return (
    <span
      className={
        "inline-flex rounded-full px-2.5 py-1 text-xs font-medium " +
        (status === "IN_STOCK"
          ? "bg-primary/10 text-primary"
          : status === "LOST"
            ? "bg-danger/10 text-danger"
            : "bg-muted text-foreground")
      }
    >
      {equipmentStatusLabels[status]}
    </span>
  );
}
export function EquipmentCondition({
  condition,
}: {
  condition: keyof typeof conditionLabels;
}) {
  return (
    <span className="text-sm text-muted-foreground">
      {conditionLabels[condition]}
    </span>
  );
}
export function WarrantyBadges({
  row,
}: {
  row: {
    warrantyExpired: boolean;
    warrantySoon: boolean;
    depreciated: boolean | null;
  };
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-1 text-xs">
      {row.warrantyExpired && (
        <span className="rounded bg-danger/10 px-2 py-1 text-danger">
          Garantie expirée
        </span>
      )}
      {row.warrantySoon && (
        <span className="rounded bg-amber-500/10 px-2 py-1 text-amber-700 dark:text-amber-300">
          Garantie : moins de 60 jours
        </span>
      )}
      {row.depreciated && (
        <span className="rounded bg-muted px-2 py-1">Amorti</span>
      )}
    </div>
  );
}
