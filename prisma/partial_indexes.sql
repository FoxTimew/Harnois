-- Index partiels : à coller dans la première migration
-- (générée avec `npx prisma migrate dev --create-only --name init`).
-- Prisma ne sait pas les déclarer dans schema.prisma.

-- Un équipement ne peut avoir qu'une seule assignation active
CREATE UNIQUE INDEX "EquipmentAssignment_active_equipment_key"
  ON "EquipmentAssignment" ("equipmentId") WHERE "returnedAt" IS NULL;

-- Un employé ne peut pas avoir deux sièges actifs sur le même abonnement
CREATE UNIQUE INDEX "License_active_subscription_employee_key"
  ON "License" ("subscriptionId", "employeeId") WHERE "revokedAt" IS NULL;

-- Un employé ne peut pas avoir deux accès actifs au même compte
CREATE UNIQUE INDEX "AccountAccess_active_account_employee_key"
  ON "AccountAccess" ("accountId", "employeeId") WHERE "revokedAt" IS NULL;

-- Une seule invitation en attente par adresse email
CREATE UNIQUE INDEX "Invitation_pending_email_key"
  ON "Invitation" (lower("email")) WHERE "acceptedAt" IS NULL AND "revokedAt" IS NULL;
