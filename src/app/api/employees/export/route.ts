import { requireUser } from "@/server/auth/require-user";
import { getDb } from "@/server/db";
import { exportEmployees } from "@/server/services/employees";
import { privateHeaders, importError } from "@/server/imports/http";
export async function GET(request: Request) {
  try {
    const { user, session } = await requireUser({
      headers: request.headers,
      permission: { action: "employees:export", resource: "employees" },
    });
    const csv = await exportEmployees(
      getDb(),
      { userId: user.id, sessionId: session.id },
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return new Response(csv, {
      headers: {
        ...privateHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="harnois-employes.csv"',
      },
    });
  } catch (error) {
    return importError(error);
  }
}
