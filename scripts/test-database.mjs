import { spawnSync } from "node:child_process";
import { loadTestEnvironment } from "./test-environment.mjs";

loadTestEnvironment();
const result = spawnSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
