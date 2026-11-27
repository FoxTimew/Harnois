import { describe, expect, it } from "vitest";
import {
  actions,
  can,
  resources,
  type PermissionUser,
  type Resource,
} from "@/server/auth/permissions";
import { visibleNavigation } from "@/server/auth/navigation";
const roles = ["ADMIN", "IT_MANAGER", "TECHNICIAN", "EMPLOYEE"] as const;
// Independent acceptance table: R/C/U/A; descriptors below are owned, low-role and business.
const expected = {
  ADMIN: [
    "RCUA",
    "RCUA",
    "RCUA",
    "RCUA",
    "RCUA",
    "RCUA",
    "RCUA",
    "RCUA",
    "RCUA",
    "RCUA",
    "RCUA",
    "R",
    "RUA",
    "RCA",
    "R",
  ],
  IT_MANAGER: [
    "RCUA",
    "RCUA",
    "RCUA",
    "RCUA",
    "RCUA",
    "RCUA",
    "RCUA",
    "RCUA",
    "RCUA",
    "RCUA",
    "RCUA",
    "R",
    "",
    "RCA",
    "R",
  ],
  TECHNICIAN: [
    "R",
    "R",
    "RCUA",
    "RCUA",
    "R",
    "",
    "R",
    "R",
    "",
    "RCUA",
    "RCUA",
    "R",
    "",
    "",
    "",
  ],
  EMPLOYEE: [
    "",
    "R",
    "R",
    "R",
    "",
    "",
    "R",
    "R",
    "",
    "RC",
    "",
    "R",
    "",
    "",
    "",
  ],
};
const user = (role: PermissionUser["role"]): PermissionUser => ({
  id: "user",
  employeeId: "employee",
  isActive: true,
  role,
});
const cases = roles.flatMap((role) =>
  resources.flatMap((type, index) =>
    actions.map((action, ai) => ({
      role,
      type,
      action,
      allowed: expected[role][index].includes("RCUA"[ai]),
    })),
  ),
);
describe("permission acceptance matrix (240 combinations)", () => {
  it.each(cases)(
    "$role $type $action = $allowed",
    ({ role, type, action, allowed }) => {
      expect(
        can(user(role), action, {
          type,
          ownerEmployeeId: "employee",
          recipientUserId: "user",
          invitationRole: "EMPLOYEE",
          category: "business",
        }),
      ).toBe(allowed);
    },
  );
});
it.each([
  "employees",
  "equipment",
  "assignments",
  "licenses",
  "accounts",
  "tickets",
] as const)("isolates EMPLOYEE %s ownership", (type) => {
  for (const ownerEmployeeId of [null, undefined, "another"])
    expect(can(user("EMPLOYEE"), "read", { type, ownerEmployeeId })).toBe(
      false,
    );
  expect(
    can({ ...user("EMPLOYEE"), employeeId: null }, "read", {
      type,
      ownerEmployeeId: null,
    }),
  ).toBe(false);
});
it.each(roles)(
  "%s reads only recipient notifications; browser never creates them",
  (role) => {
    expect(
      can(user(role), "read", {
        type: "notifications",
        recipientUserId: "other",
      }),
    ).toBe(false);
    expect(can(user(role), "read", "notifications")).toBe(false);
    expect(can(user(role), "notifications:read-all", "notifications")).toBe(
      role === "ADMIN",
    );
    for (const action of ["create", "update", "archive"])
      expect(can(user(role), action, "notifications")).toBe(false);
  },
);
it.each(roles)(
  "%s special capabilities are explicit and reject wrong resources",
  (role) => {
    const person = user(role);
    const specs: [string, Resource, boolean][] = [
      [
        "financials:read",
        { type: "financials" },
        role === "ADMIN" || role === "IT_MANAGER",
      ],
      [
        "licenses:reveal-key",
        "licenses",
        role === "ADMIN" || role === "IT_MANAGER",
      ],
      ["users:revoke-sessions", "users", role === "ADMIN"],
      ["users:change-role", "users", role === "ADMIN"],
      ["users:set-active", "users", role === "ADMIN"],
      ["users:reset-mfa", "users", role === "ADMIN"],
      [
        "audit:export",
        { type: "audit", category: "business" },
        role === "ADMIN" || role === "IT_MANAGER",
      ],
      [
        "audit:export",
        { type: "audit", category: "security" },
        role === "ADMIN",
      ],
      ["read", { type: "ui" }, role === "ADMIN"],
      ["sessions:revoke", { type: "sessions", ownerUserId: "user" }, true],
      ["sessions:revoke", { type: "sessions", ownerUserId: "other" }, false],
      ["read", { type: "sessions", ownerUserId: "other" }, role === "ADMIN"],
      [
        "tickets:comment",
        { type: "tickets", ownerEmployeeId: "employee" },
        true,
      ],
      [
        "tickets:comment",
        { type: "tickets", ownerEmployeeId: "other" },
        role !== "EMPLOYEE",
      ],
    ];
    for (const [action, resource, allowed] of specs) {
      expect(can(person, action, resource), action).toBe(allowed);
      expect(can({ ...person, isActive: false }, action, resource)).toBe(false);
      if (action !== "read")
        expect(can(person, action, "organizations")).toBe(false);
    }
    expect(can(person, "unknown", "users")).toBe(false);
    expect(
      can(person, "read", { type: "unknown" } as unknown as Resource),
    ).toBe(false);
  },
);
it("ticket creation needs a server-linked employee, comments need ownership", () => {
  expect(can(user("EMPLOYEE"), "create", "tickets")).toBe(true);
  expect(
    can({ ...user("EMPLOYEE"), employeeId: null }, "create", "tickets"),
  ).toBe(false);
  expect(
    can({ ...user("EMPLOYEE"), employeeId: null }, "tickets:comment", {
      type: "tickets",
      ownerEmployeeId: null,
    }),
  ).toBe(false);
});
it("IT_MANAGER invitation permissions depend on the actual invited role", () => {
  for (const invitationRole of roles)
    for (const action of actions)
      expect(
        can(user("IT_MANAGER"), action, {
          type: "invitations",
          invitationRole,
        }),
      ).toBe(
        action !== "update" &&
          ["EMPLOYEE", "TECHNICIAN"].includes(invitationRole),
      );
  expect(can(user("IT_MANAGER"), "create", "invitations")).toBe(false);
});
it.each(roles)(
  "%s navigation exposes only implemented authorized pages",
  (role) => {
    const nav = visibleNavigation(user(role));
    expect(nav.main).toEqual([]);
    expect(nav.admin.map((item) => item.id)).toEqual(
      role === "ADMIN"
        ? ["users", "invitations", "mfa", "audit"]
        : role === "IT_MANAGER"
          ? ["invitations", "audit"]
          : [],
    );
    expect(JSON.stringify(nav)).not.toContain("/admin/ui");
  },
);
