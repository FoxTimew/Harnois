import { config } from "dotenv";

export function loadTestEnvironment() {
  if (process.env.CI === "true") {
    if (!process.env.DATABASE_URL)
      throw new Error("CI requires a disposable DATABASE_URL.");
    return;
  }
  const result = config({ path: ".env.test", override: true, quiet: true });
  if (result.error || !result.parsed?.DATABASE_URL) {
    throw new Error(
      "Local integration tests require .env.test targeting harnois_test.",
    );
  }
  let database;
  try {
    database = decodeURIComponent(
      new URL(process.env.DATABASE_URL).pathname.slice(1),
    );
  } catch {
    throw new Error("Invalid test DATABASE_URL.");
  }
  if (database !== "harnois_test") {
    throw new Error(
      "Refusing to run local tests outside the harnois_test database.",
    );
  }
}
