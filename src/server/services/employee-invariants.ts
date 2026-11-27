import "server-only";
import type { EmployeeFields } from "@/lib/employee-validation";
import {
  employeeTransitions,
  normalizeSearch,
} from "@/lib/employee-validation";
import { todayInParis } from "@/lib/date-only";
import { ServiceError } from "./errors";

/** This derived column is never part of a request schema. Also used by the demo seed. */
export function employeeSearchText(
  fields: Pick<EmployeeFields, "firstName" | "lastName" | "email">,
) {
  return normalizeSearch(
    `${fields.firstName} ${fields.lastName} ${fields.email}`,
  );
}
export function validateEmployeeDates(
  fields: EmployeeFields,
  today = todayInParis(),
) {
  if (fields.startDate && fields.endDate && fields.endDate < fields.startDate)
    throw new ServiceError("INVALID_EMPLOYEE_DATES");
  if (fields.status === "LEFT" && (!fields.endDate || fields.endDate > today))
    throw new ServiceError("DEPARTURE_DATE_REQUIRED");
}
export function validateEmployeeTransition(
  before: EmployeeFields["status"],
  after: EmployeeFields["status"],
  role: string,
  immediateConfirmed: boolean,
) {
  if (before === after) return;
  if (!employeeTransitions[before].includes(after))
    throw new ServiceError("INVALID_STATUS_TRANSITION", 409);
  if (before === "LEFT" && role !== "ADMIN")
    throw new ServiceError("FORBIDDEN", 403);
  if (before === "ACTIVE" && after === "LEFT" && !immediateConfirmed)
    throw new ServiceError("IMMEDIATE_DEPARTURE_CONFIRMATION_REQUIRED");
}
export type HierarchyNode = {
  id: string;
  managerId: string | null;
  status: EmployeeFields["status"];
};
/** Linear traversal of the final graph; no arbitrary depth limit, including imported managers. */
export function hierarchyProblems(nodes: HierarchyNode[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const problems = new Map<string, string>();
  for (const node of nodes) {
    if (node.managerId) {
      const manager = byId.get(node.managerId);
      if (!manager) problems.set(node.id, "MANAGER_NOT_FOUND");
      else if (manager.status === "LEFT" && node.status !== "LEFT")
        problems.set(manager.id, "MANAGER_HAS_REPORTS");
    }
  }
  const completed = new Set<string>();
  for (const node of nodes) {
    const path = new Map<string, number>();
    let current: string | null = node.id;
    while (current && byId.has(current) && !completed.has(current)) {
      if (path.has(current)) {
        for (const [id, position] of path)
          if (position >= path.get(current)!)
            problems.set(id, "HIERARCHY_CYCLE");
        break;
      }
      path.set(current, path.size);
      current = byId.get(current)!.managerId;
    }
    for (const id of path.keys()) completed.add(id);
  }
  return problems;
}
