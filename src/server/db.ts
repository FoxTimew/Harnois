import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { getServerEnv } from "./env";

const globalForPrisma = globalThis as unknown as { harnoisDb?: PrismaClient };

/** Lazy initialization avoids database access during static builds. */
export function getDb(): PrismaClient {
  return (globalForPrisma.harnoisDb ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString: getServerEnv().DATABASE_URL }),
    log: [],
    errorFormat: "minimal",
  }));
}
