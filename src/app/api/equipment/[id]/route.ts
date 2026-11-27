import { requireUser } from "@/server/auth/require-user";
import { getDb } from "@/server/db";
import { equipmentDetail } from "@/server/services/equipment";
import { privateHeaders, importError } from "@/server/imports/http";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, session } = await requireUser({ headers: request.headers });
    return Response.json(
      await equipmentDetail(
        getDb(),
        { userId: user.id, sessionId: session.id },
        (await params).id,
      ),
      { headers: privateHeaders },
    );
  } catch (error) {
    return importError(error);
  }
}
