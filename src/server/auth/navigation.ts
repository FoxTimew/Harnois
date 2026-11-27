import "server-only";
import {
  navigation,
  adminNavigation,
  personalNavigation,
} from "@/lib/navigation";
import { can, type PermissionUser } from "./permissions";
export function visibleNavigation(user: PermissionUser) {
  const filter = (items: typeof navigation) =>
    items
      .filter(
        (item) =>
          item.enabled &&
          can(user, item.permission.action, item.permission.resource),
      )
      .map(({ id, label, href, icon }) => ({ id, label, href, icon }));
  return {
    main: [
      ...filter(navigation),
      ...(can(user, "read", "organizations")
        ? [
            {
              id: "references",
              label: "Référentiels",
              href: "/references",
              icon: "software",
            },
          ]
        : []),
    ],
    admin: filter(adminNavigation),
    adminLabel: user.role === "ADMIN" ? "Administration" : "Gestion",
    personal: [
      ...personalNavigation,
      ...(user.employeeId
        ? [
            {
              id: "my-equipment",
              label: "Mon matériel",
              href: "/my-equipment",
              icon: "computer",
            },
            {
              id: "my-employee",
              label: "Ma fiche",
              href: "/employees/" + user.employeeId,
              icon: "people",
            },
          ]
        : []),
    ],
  };
}
