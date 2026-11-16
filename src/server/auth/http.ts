import "server-only";
import { readJson } from "./read-json";
import { getAuth, type createAuth } from "./config";
import { emailSchema } from "@/lib/validation";

async function normalizeRequest(request: Request) {
  if (
    !request.body ||
    !request.headers.get("content-type")?.includes("application/json")
  )
    return request;
  const body = await readJson(request, 32_768);
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new Error("Invalid request");
  if ("email" in body && typeof body.email === "string")
    body.email = emailSchema.parse(body.email);
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  return new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify(body),
  });
}

/** Keep provider descriptions, database errors and token URLs out of public errors. */
export async function handleAuthRequest(
  request: Request,
  auth: ReturnType<typeof createAuth> = getAuth(),
) {
  try {
    request = await normalizeRequest(request);
  } catch {
    return Response.json(
      { code: "INVALID_REQUEST", message: "Invalid request" },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  }
  try {
    const response = await auth.handler(request);
    const headers = new Headers(response.headers);
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("Cache-Control", "no-store");
    const location = headers.get("location");
    if (
      location &&
      new URL(request.url).pathname.startsWith("/api/auth/callback/")
    ) {
      const target = new URL(location, request.url);
      if (target.searchParams.has("error")) {
        const error =
          target.searchParams.get("error") === "INVITATION_EMAIL_MISMATCH"
            ? "invitation_email_mismatch"
            : "authentication_failed";
        headers.set("location", `/login?error=${error}`);
      }
    }
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return Response.json(
      {
        code: "AUTHENTICATION_UNAVAILABLE",
        message: "Connexion temporairement indisponible.",
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  }
}
