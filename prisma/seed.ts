import "dotenv/config";
import { getDb } from "../src/server/db";
import { seedDemoData } from "./seed-data";

const db = getDb();
try {
  await db.$transaction(seedDemoData);
  console.info(
    "Seed complete: 1 organization, 2 departments, 1 location, 5 categories.",
  );
} catch {
  console.error(
    "Seed failed. Check database availability and applied migrations.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
