import { prepareInvitation } from "@/server/auth/prepare-invitation";
import { getDb } from "@/server/db";
import { getServerEnv } from "@/server/env";

export const runtime = "nodejs";
export const POST = (request: Request) =>
  prepareInvitation(request, getDb(), getServerEnv());
