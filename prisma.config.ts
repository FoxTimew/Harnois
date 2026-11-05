import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // process.env plutôt que env() : `prisma generate` doit fonctionner sans base
  // (build Docker). Les commandes de migration échouent clairement si l'URL manque.
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
