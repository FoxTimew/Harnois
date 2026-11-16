import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const invitationCookieName = "harnois.invitation";
export const linkCookieName = "harnois.account-link";
const envelopeSchema = z.object({
  id: z.string().min(1),
  expiresAt: z.number().int(),
  sessionId: z.string().optional(),
  provider: z.enum(["google", "microsoft"]).optional(),
});
type Flow = z.infer<typeof envelopeSchema>;

function signature(value: string, purpose: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`harnois:${purpose}:${value}`)
    .digest();
}
export function signFlowCookie(
  flow: Omit<Flow, "expiresAt">,
  purpose: string,
  secret: string,
  now = Date.now(),
) {
  const payload = Buffer.from(
    JSON.stringify({ ...flow, expiresAt: now + 600_000 }),
  ).toString("base64url");
  return `${payload}.${signature(payload, purpose, secret).toString("base64url")}`;
}
export function readFlowCookie(
  headers: Headers | undefined,
  purpose: string,
  secret: string,
  now = Date.now(),
): Flow | null {
  const raw = headers
    ?.get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${purpose}=`))
    ?.slice(purpose.length + 1);
  if (!raw || raw.length > 2048) return null;
  const [payload, encodedSignature, extra] = raw.split(".");
  if (!payload || !encodedSignature || extra) return null;
  try {
    const actual = Buffer.from(encodedSignature, "base64url");
    const expected = signature(payload, purpose, secret);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return null;
    const flow = envelopeSchema.parse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
    return flow.expiresAt > now && flow.expiresAt <= now + 600_000
      ? flow
      : null;
  } catch {
    return null;
  }
}
export function flowCookieOptions(baseURL: string) {
  return {
    httpOnly: true,
    secure: !["localhost", "127.0.0.1", "[::1]"].includes(
      new URL(baseURL).hostname,
    ),
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600,
  };
}
