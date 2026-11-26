import { handleMfaRequest } from "@/server/auth/mfa-http";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: RouteContext<"/api/mfa/[...action]">,
) {
  return handleMfaRequest(request, (await context.params).action.join("/"));
}
export const POST = GET;
