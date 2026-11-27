import { requireUser } from "@/server/auth/require-user";
import { equipmentCsvTemplate } from "@/server/imports/equipment-csv";
import { privateHeaders, importError } from "@/server/imports/http";
export async function GET(request: Request) {
  try {
    await requireUser({
      headers: request.headers,
      permission: { action: "equipment:import", resource: "equipment" },
    });
    return new Response(equipmentCsvTemplate(), {
      headers: {
        ...privateHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="harnois-equipements-modele.csv"',
      },
    });
  } catch (error) {
    return importError(error);
  }
}
