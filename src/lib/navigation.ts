import type { Permission } from "@/server/auth/permissions";

export type NavigationItem = {
  id: string;
  label: string;
  href: string;
  icon: string;
  enabled: boolean;
  permission: Permission;
};
/** Enable a future entry only when its page and access tests ship. */
export const navigation: NavigationItem[] = [
  {
    id: "dashboard",
    label: "Tableau de bord",
    href: "/dashboard",
    icon: "dashboard",
    enabled: false,
    permission: { action: "read", resource: "equipment" },
  },
  {
    id: "employees",
    label: "Employés",
    href: "/employees",
    icon: "people",
    enabled: false,
    permission: { action: "read", resource: "employees" },
  },
  {
    id: "equipment",
    label: "Équipements",
    href: "/equipment",
    icon: "computer",
    enabled: false,
    permission: { action: "read", resource: "equipment" },
  },
  {
    id: "software",
    label: "Logiciels",
    href: "/software",
    icon: "software",
    enabled: false,
    permission: { action: "read", resource: "software" },
  },
  {
    id: "accounts",
    label: "Comptes",
    href: "/accounts",
    icon: "key",
    enabled: false,
    permission: { action: "read", resource: "accounts" },
  },
  {
    id: "invoices",
    label: "Factures",
    href: "/invoices",
    icon: "invoice",
    enabled: false,
    permission: { action: "read", resource: "invoices" },
  },
  {
    id: "tickets",
    label: "Tickets",
    href: "/tickets",
    icon: "ticket",
    enabled: false,
    permission: { action: "read", resource: "tickets" },
  },
  {
    id: "checklists",
    label: "Checklists",
    href: "/checklists",
    icon: "checklist",
    enabled: false,
    permission: { action: "read", resource: "checklists" },
  },
];
export const adminNavigation: NavigationItem[] = [
  {
    id: "users",
    label: "Utilisateurs",
    href: "/admin/users",
    icon: "people",
    enabled: true,
    permission: { action: "read", resource: "users" },
  },
  {
    id: "invitations",
    label: "Invitations",
    href: "/admin/invitations",
    icon: "mail",
    enabled: true,
    permission: {
      action: "read",
      resource: { type: "invitations", invitationRole: "EMPLOYEE" },
    },
  },
  {
    id: "mfa",
    label: "Réinitialisation 2FA",
    href: "/admin/mfa",
    icon: "shield",
    enabled: true,
    permission: { action: "users:reset-mfa", resource: "users" },
  },
  {
    id: "audit",
    label: "Journal d’audit",
    href: "/admin/audit",
    icon: "history",
    enabled: true,
    permission: {
      action: "read",
      resource: { type: "audit", category: "business" },
    },
  },
];
export type NavigationLink = Pick<
  NavigationItem,
  "id" | "label" | "href" | "icon"
>;
export const personalNavigation: NavigationLink[] = [
  { id: "profile", label: "Mon profil", href: "/profile", icon: "profile" },
  {
    id: "security",
    label: "Sécurité",
    href: "/profile/security",
    icon: "shield",
  },
];
