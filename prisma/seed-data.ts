import type { Prisma } from "../src/generated/prisma/client";

export const demoData = {
  organization: "Harnois Démonstration",
  departments: ["Informatique", "Administration"],
  location: "Siège Démonstration",
  categories: [
    "Ordinateurs portables",
    "Ordinateurs fixes",
    "Écrans",
    "Téléphones",
    "Périphériques",
  ],
} as const;

export async function seedDemoData(db: Prisma.TransactionClient) {
  const organization = await db.organization.upsert({
    where: { name: demoData.organization },
    update: {},
    create: { name: demoData.organization },
  });
  const departments = [];
  for (const name of demoData.departments) {
    departments.push(
      await db.department.upsert({
        where: {
          organizationId_name: { organizationId: organization.id, name },
        },
        update: {},
        create: { name, organizationId: organization.id },
      }),
    );
  }
  const location = await db.location.upsert({
    where: { name: demoData.location },
    update: {},
    create: { name: demoData.location },
  });
  const categories = [];
  for (const name of demoData.categories) {
    categories.push(
      await db.category.upsert({
        where: { name },
        update: {},
        create: { name },
      }),
    );
  }
  return { organization, departments, location, categories };
}
