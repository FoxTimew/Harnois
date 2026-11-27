import type { EmployeeFields } from "../src/lib/employee-validation";
export const demoOrganizations = [
  { id: "demo_org_atelier", name: "Atelier Harnois (démonstration)" },
  { id: "demo_org_services", name: "Services Harnois (démonstration)" },
];
export const demoDepartments = [
  {
    id: "demo_dept_support",
    name: "Support",
    organizationId: demoOrganizations[0].id,
  },
  {
    id: "demo_dept_ops",
    name: "Opérations",
    organizationId: demoOrganizations[0].id,
  },
  {
    id: "demo_dept_people",
    name: "Ressources humaines",
    organizationId: demoOrganizations[1].id,
  },
  {
    id: "demo_dept_admin",
    name: "Administration",
    organizationId: demoOrganizations[1].id,
  },
];
export const demoLocations = [
  {
    id: "demo_location_paris",
    name: "Atelier Paris (démonstration)",
    city: "Paris",
  },
  {
    id: "demo_location_lyon",
    name: "Bureau Lyon (démonstration)",
    city: "Lyon",
  },
  {
    id: "demo_location_lille",
    name: "Bureau Lille (démonstration)",
    city: "Lille",
  },
];
const firstNames = [
  "Céline",
  "Amine",
  "Élodie",
  "Hugo",
  "Léa",
  "Thomas",
  "Inès",
  "Julien",
  "Sarah",
  "Nicolas",
];
const lastNames = ["Lefèvre", "Morel", "Delcourt", "Mercier", "Perrin"];
export const demoEmployees: (EmployeeFields & { id: string })[] = Array.from(
  { length: 50 },
  (_, index) => {
    const department = demoDepartments[index % demoDepartments.length];
    return {
      id: "demo_employee_" + String(index + 1).padStart(3, "0"),
      firstName: firstNames[index % 10],
      lastName: lastNames[Math.floor(index / 10)],
      email:
        "collaborateur." +
        String(index + 1).padStart(3, "0") +
        "@demo.harnois.invalid",
      phone: null,
      jobTitle:
        index < 4
          ? "Responsable de pôle"
          : ["Chargé de support", "Coordinateur", "Gestionnaire", "Assistant"][
              index % 4
            ],
      status:
        index < 4
          ? "ACTIVE"
          : index >= 46
            ? "LEFT"
            : index >= 42
              ? "OFFBOARDING"
              : index >= 38
                ? "ONBOARDING"
                : "ACTIVE",
      startDate: "2025-01-15",
      endDate:
        index >= 46
          ? "2026-10-30"
          : index >= 42 && index < 46
            ? "2027-01-31"
            : null,
      organizationId: department.organizationId,
      departmentId: department.id,
      locationId: demoLocations[index % 3].id,
      managerId:
        index < 4
          ? null
          : "demo_employee_" + String((index % 4) + 1).padStart(3, "0"),
    };
  },
);
