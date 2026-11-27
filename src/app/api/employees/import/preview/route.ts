import { requireUser } from "@/server/auth/require-user";
import { getDb } from "@/server/db";
import { previewEmployeeImport } from "@/server/services/employee-import";
import {
  privateHeaders,
  importError,
  readImportBody,
} from "@/server/imports/http";
export async function POST(request: Request) {
  try {
    const { user, session } = await requireUser({
      headers: request.headers,
      permission: { action: "employees:import", resource: "employees" },
    });
    const { bytes, metadata } = await readImportBody(request);
    const result = await previewEmployeeImport(
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
