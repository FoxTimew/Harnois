import "server-only";
import { navigation, adminNavigation } from "@/lib/navigation";
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
  return { main: filter(navigation), admin: filter(adminNavigation) };
}
