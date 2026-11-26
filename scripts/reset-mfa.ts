import { config } from "dotenv";
config({ quiet: true });
import { parseArgs } from "node:util";
import { createInterface } from "node:readline";
import { emailSchema } from "../src/lib/validation";
import { getDb } from "../src/server/db";
import { MfaService } from "../src/server/services/mfa";
try {
  const { values } = parseArgs({
    options: { email: { type: "string" } },
    strict: true,
  });
  const email = emailSchema.parse(values.email);
  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  process.stdout.write(
    "Cette opération supprime les facteurs et codes de secours, révoque toutes les sessions et avertit l’utilisateur.\nTapez REINITIALISER pour confirmer : ",
  );
  const answer = await new Promise<string>((resolve) => {
    terminal.once("line", resolve);
    terminal.once("close", () => resolve(""));
  });
  terminal.close();
  if (answer.trim() !== "REINITIALISER") {
    process.stdout.write("Opération annulée.\n");
    process.exitCode = 1;
  } else {
    const db = getDb();
    try {
      await new MfaService({ db }).resetFromCli(email);
      process.stdout.write(
        "Double authentification réinitialisée ; toutes les sessions sont révoquées. Vérifiez l’audit MFA_NOTIFICATION_FAILED si l’email n’est pas reçu.\n",
      );
    } finally {
      await db.$disconnect();
    }
  }
} catch {
  process.stderr.write(
    "Réinitialisation impossible. Vérifiez --email, la configuration et la connexion à la base.\n",
  );
  process.exitCode = 1;
}
