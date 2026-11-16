import { handleAuthRequest } from "@/server/auth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => handleAuthRequest(request);
export const POST = (request: Request) => handleAuthRequest(request);
