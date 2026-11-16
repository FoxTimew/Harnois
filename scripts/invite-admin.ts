import { config } from "dotenv";
config({ quiet: true });
import { parseArgs } from "node:util";
import { emailSchema } from "../src/lib/validation";
import { getDb } from "../src/server/db";
import { getServerEnv } from "../src/server/env";
import { createBootstrapInvitation } from "../src/server/services/invitations";
import { ServiceError } from "../src/server/services/errors";
try {
  const { values } = parseArgs({
    options: { email: { type: "string" } },
    strict: true,
  });
  const email = emailSchema.parse(values.email);
  const env = getServerEnv();
  const db = getDb();
  try {
    const { token } = await createBootstrapInvitation(db, email);
    // Explicit operator output, never called by HTTP or background jobs.
    process.stdout.write(
      `Invitation administrateur (7 jours). Conservez ce lien confidentiel :\n${env.BETTER_AUTH_URL}/invitation/${token}\n`,
    );
  } finally {
    await db.$disconnect();
  }
} catch (error) {
  process.stderr.write(
    error instanceof ServiceError && error.code === "ADMIN_ALREADY_EXISTS"
      ? "Un administrateur existe déjà. Utilisez la page Invitations.\n"
      : "Invitation impossible. Vérifiez --email, la configuration et la connexion à la base.\n",
  );
  process.exitCode = 1;
}
