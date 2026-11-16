import "server-only";
import { getServerEnv } from "@/server/env";
export function providerAvailability() {
  const env = getServerEnv();
  return {
    google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    microsoft: Boolean(
      env.MICROSOFT_CLIENT_ID &&
      env.MICROSOFT_CLIENT_SECRET &&
      env.MICROSOFT_TENANT_ID,
    ),
  };
}
