import { requireUser } from "@/server/auth/require-user";
import { getDb } from "@/server/db";
import { exportAudit } from "@/server/services/audit";
import { ServiceError } from "@/server/services/errors";
import { actionMessage } from "@/lib/action-result";
import { auditQuerySchema } from "@/lib/table-query";
export async function GET(request: Request) {
  try {
    const query = auditQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const { user, session } = await requireUser({
      headers: request.headers,
      permission: {
        action: "audit:export",
        resource: { type: "audit", category: "business" },
      },
    });
    const csv = await exportAudit(
      getDb(),
      { userId: user.id, sessionId: session.id },
      query,
    );
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="harnois-audit.csv"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const code = error instanceof ServiceError ? error.code : "INVALID_REQUEST";
    return Response.json(
      { error: actionMessage(code) },
      {
        status: error instanceof ServiceError ? error.status : 400,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
