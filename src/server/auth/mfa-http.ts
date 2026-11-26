import "server-only";
import { z } from "zod";
import * as schemas from "@/lib/mfa-validation";
import { requireUser, type SessionReader } from "./require-user";
import { readJson } from "./read-json";
import type { MfaAccess } from "./mfa-policy";
import { MfaService, MfaError, type MfaActor } from "@/server/services/mfa";
import { ServiceError } from "@/server/services/errors";

type Endpoint = {
  method: "GET" | "POST";
  access: MfaAccess;
  schema: z.ZodType;
  invoke: (
    service: MfaService,
    actor: MfaActor,
    input: unknown,
  ) => Promise<unknown>;
};
const enroll: MfaAccess = { states: ["setup", "ready"], fresh: true };
const verify: MfaAccess = { states: ["verify", "ready"] };
/** No prefix-wide authorization: every exposed action has an explicit state and method. */
export const mfaEndpoints: Record<string, Endpoint> = {
  status: {
    method: "GET",
    access: { states: ["setup", "verify", "ready"] },
    schema: schemas.emptySchema,
    invoke: (s, a) => s.status(a),
  },
  "primary/confirm": {
    method: "POST",
    access: { states: ["setup", "ready"] },
    schema: schemas.primaryProofSchema,
    invoke: (s, a, i) => s.confirmPrimary(a, i),
  },
  "totp/enroll": {
    method: "POST",
    access: enroll,
    schema: schemas.emptySchema,
    invoke: (s, a, i) => s.startTotp(a, i),
  },
  "totp/confirm": {
    method: "POST",
    access: enroll,
    schema: schemas.totpCodeSchema,
    invoke: (s, a, i) => s.confirmTotp(a, i),
  },
  "totp/verify": {
    method: "POST",
    access: verify,
    schema: schemas.totpCodeSchema,
    invoke: (s, a, i) => s.verifyTotp(a, i),
  },
  "webauthn/register/options": {
    method: "POST",
    access: enroll,
    schema: schemas.keyNameSchema,
    invoke: (s, a, i) => s.registrationOptions(a, i),
  },
  "webauthn/register/verify": {
    method: "POST",
    access: enroll,
    schema: schemas.registrationSchema,
    invoke: (s, a, i) => s.confirmRegistration(a, i),
  },
  "webauthn/authenticate/options": {
    method: "POST",
    access: verify,
    schema: schemas.emptySchema,
    invoke: (s, a, i) => s.authenticationOptions(a, i),
  },
  "webauthn/authenticate/verify": {
    method: "POST",
    access: verify,
    schema: schemas.authenticationSchema,
    invoke: (s, a, i) => s.verifyAuthentication(a, i),
  },
  "recovery/verify": {
    method: "POST",
    access: verify,
    schema: schemas.recoveryCodeSchema,
    invoke: (s, a, i) => s.verifyRecovery(a, i),
  },
  "recovery/regenerate": {
    method: "POST",
    access: { fresh: true },
    schema: schemas.emptySchema,
    invoke: (s, a, i) => s.regenerateCodes(a, i),
  },
  "factors/remove": {
    method: "POST",
    access: { fresh: true },
    schema: schemas.removeFactorSchema,
    invoke: (s, a, i) => s.removeFactor(a, i),
  },
  "admin/reset": {
    method: "POST",
    access: { fresh: true, roles: ["ADMIN"] },
    schema: schemas.resetMfaSchema,
    invoke: (s, a, i) => s.resetByAdmin(a, i),
  },
};
export async function handleMfaRequest(
  request: Request,
  path: string,
  service = new MfaService(),
  readSession?: SessionReader,
) {
  const headers: Record<string, string> = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  };
  try {
    const endpoint = Object.hasOwn(mfaEndpoints, path)
      ? mfaEndpoints[path]
      : undefined;
    if (!endpoint) throw new ServiceError("NOT_FOUND", 404);
    if (request.method !== endpoint.method)
      throw new ServiceError("METHOD_NOT_ALLOWED", 405);
    if (
      request.method !== "GET" &&
      request.headers.get("origin") !==
        new URL(service.env.BETTER_AUTH_URL).origin
    )
      throw new ServiceError("INVALID_ORIGIN", 403);
    let input: unknown = {};
    if (request.method !== "GET") {
      if (!request.headers.get("content-type")?.startsWith("application/json"))
        throw new ServiceError("INVALID_REQUEST");
      try {
        input = await readJson(request, 65_536);
      } catch {
        throw new ServiceError("INVALID_REQUEST");
      }
    }
    input = endpoint.schema.parse(input);
    const context = await requireUser({
      headers: request.headers,
      db: service.db,
      readSession,
      ...endpoint.access,
    });
    const data = await endpoint.invoke(
      service,
      {
        userId: context.user.id,
        sessionId: context.session.id,
        ip: request.headers.get("x-real-ip") ?? undefined,
      },
      input,
    );
    return Response.json(data, { headers });
  } catch (error) {
    const known = error instanceof ServiceError;
    const retryAfter = error instanceof MfaError ? error.retryAfter : undefined;
    if (retryAfter) headers["Retry-After"] = String(retryAfter);
    return Response.json(
      {
        code: known
          ? error.code
          : error instanceof z.ZodError
            ? "INVALID_REQUEST"
            : "MFA_UNAVAILABLE",
        ...(retryAfter ? { retryAfter } : {}),
      },
      {
        status: known ? error.status : error instanceof z.ZodError ? 400 : 503,
        headers,
      },
    );
  }
}
