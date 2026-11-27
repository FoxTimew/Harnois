import "dotenv/config";
import { getDb } from "../src/server/db";
import {
  assertDemoSeedAllowed,
  seedDemoEmployees,
} from "../src/server/services/employee-demo";
import { ServiceError } from "../src/server/services/errors";
let db: ReturnType<typeof getDb> | undefined;
try {
  assertDemoSeedAllowed(process.env.HARNOIS_ALLOW_DEMO_SEED);
  if (process.argv.length !== 3 || process.argv[2] !== "--confirm-demo")
    throw new ServiceError("DEMO_CONFIRMATION_REQUIRED");
  db = getDb();
  const result = await seedDemoEmployees(
    db,
    process.env.HARNOIS_ALLOW_DEMO_SEED,
  );
  console.info(
    `Démonstration : ${result.created} employés créés, ${result.existing} déjà présents.`,
  );
} catch (error) {
  const code = error instanceof ServiceError ? error.code : "DEMO_SEED_FAILED";
  const messages: Record<string, string> = {
    DEMO_SEED_NOT_ALLOWED:
      "Refus : HARNOIS_ALLOW_DEMO_SEED doit valoir exactement true, uniquement en local ou staging.",
    DEMO_CONFIRMATION_REQUIRED:
      "Refus : ajoutez --confirm-demo pour confirmer le chargement de données fictives.",
    DEMO_SEED_REAL_DATA:
      "Refus : la base contient un employé absent du manifeste fictif ou dont l’identité a changé.",
    DEMO_SEED_MANIFEST_CHANGED:
      "Refus : un référentiel du manifeste a été modifié.",
  };
  console.error(
    messages[code] ??
      "Échec du seed fictif. Vérifiez les migrations et la disponibilité de la base.",
  );
  process.exitCode = 1;
} finally {
  await db?.$disconnect();
}
