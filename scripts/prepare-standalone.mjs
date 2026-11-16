import { cp, mkdir } from "node:fs/promises";

// Next's standalone output omits public/ and .next/static/.
// Copy them after the build so npm start and Docker serve the same artifact.
await mkdir(".next/standalone/.next", { recursive: true });
await cp("public", ".next/standalone/public", { recursive: true });
await cp(".next/static", ".next/standalone/.next/static", { recursive: true });
