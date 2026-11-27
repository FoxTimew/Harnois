import { requireUser } from "@/server/auth/require-user";
import { getDb } from "@/server/db";
import { getServerEnv } from "@/server/env";
import { equipmentCertificate } from "@/server/services/equipment-documents";
import { privateHeaders, importError } from "@/server/imports/http";
import { ServiceError } from "@/server/services/errors";
export async function POST(request: Request) {
  try {
    const { user, session } = await requireUser({
      headers: request.headers,
      permission: { action: "equipment:documents", resource: "equipment" },
    });
    if (
      request.headers.get("origin") !==
      new URL(getServerEnv().BETTER_AUTH_URL).origin
    )
      throw new ServiceError("FORBIDDEN", 403);
    const reader = request.body?.getReader();
    if (!reader) throw new ServiceError("INVALID_REQUEST");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.length;
        if (size > 32768) {
          await reader.cancel();
          throw new ServiceError("INVALID_REQUEST", 413);
        }
        chunks.push(next.value);
      }
    } finally {
      reader.releaseLock();
    }
    const input: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const pdf = await equipmentCertificate(
      getDb(),
      { userId: user.id, sessionId: session.id },
      input,
    );
    return new Response(new Uint8Array(pdf), {
      headers: {
        ...privateHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="harnois-certificate.pdf"',
      },
    });
  } catch (error) {
    return importError(error);
  }
}
