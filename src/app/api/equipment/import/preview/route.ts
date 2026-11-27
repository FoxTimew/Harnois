import { requireUser } from "@/server/auth/require-user";
import { getDb } from "@/server/db";
import { previewEquipmentImport } from "@/server/services/equipment-import";
import {
  privateHeaders,
  importError,
  readImportBody,
} from "@/server/imports/http";
export async function POST(request: Request) {
  try {
    const { user, session } = await requireUser({
      headers: request.headers,
      permission: { action: "equipment:import", resource: "equipment" },
    });
    const { bytes, metadata } = await readImportBody(request);
    const result = await previewEquipmentImport(
      getDb(),
      { userId: user.id, sessionId: session.id },
      bytes,
      metadata,
    );
    return Response.json(result, { headers: privateHeaders });
  } catch (error) {
    return importError(error);
  }
}
