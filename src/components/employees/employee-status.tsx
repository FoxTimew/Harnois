import { StatusBadge } from "@/components/ui/status-badge";
import {
  employeeStatusLabels,
  type EmployeeStatus,
} from "@/lib/employee-validation";
export function EmployeeStatusBadge({ status }: { status: EmployeeStatus }) {
  return (
    <StatusBadge
      tone={
        status === "ACTIVE"
          ? "positive"
          : status === "LEFT"
            ? "neutral"
            : "warning"
      }
    >
      {employeeStatusLabels[status]}
    </StatusBadge>
  );
}
