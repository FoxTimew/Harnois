import { requireUser } from "@/server/auth/require-user";
import { getDb } from "@/server/db";
import { exportEquipment } from "@/server/services/equipment";
import { privateHeaders, importError } from "@/server/imports/http";
export async function GET(request: Request) {
  try {
    const { user, session } = await requireUser({
      headers: request.headers,
      permission: { action: "equipment:export", resource: "equipment" },
    });
    const csv = await exportEquipment(
      getDb(),
      { userId: user.id, sessionId: session.id },
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return new Response(csv, {
      headers: {
        ...privateHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="harnois-equipements.csv"',
      },
    });
  } catch (error) {
    return importError(error);
  }
}
