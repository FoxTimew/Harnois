import { requireUser } from "@/server/auth/require-user";
import { employeeCsvTemplate } from "@/server/imports/employee-csv";
import { privateHeaders, importError } from "@/server/imports/http";
export async function GET(request: Request) {
  try {
    await requireUser({
      headers: request.headers,
      permission: { action: "employees:import", resource: "employees" },
    });
    return new Response(employeeCsvTemplate(), {
      headers: {
        ...privateHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="harnois-employes-modele.csv"',
      },
    });
  } catch (error) {
    return importError(error);
  }
}
