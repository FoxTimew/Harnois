import "server-only";
import { readJson } from "./read-json";
import { NextResponse } from "next/server";
import { z } from "zod";
import { invitationTokenSchema } from "@/lib/validation";
import type { PrismaClient } from "@/generated/prisma/client";
import type { ServerEnv } from "@/server/env";
import { findInvitationByToken } from "@/server/services/invitations";
import { consumeRateLimit, privateRateKey } from "./rate-limit";
import {
  flowCookieOptions,
  invitationCookieName,
  signFlowCookie,
} from "./flow-cookie";

export async function prepareInvitation(
  request: Request,
  db: PrismaClient,
  env: ServerEnv,
) {
  const headers = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  };
  if (request.headers.get("origin") !== new URL(env.BETTER_AUTH_URL).origin)
    return NextResponse.json(
      { code: "INVALID_ORIGIN" },
      { status: 403, headers },
    );
  if (
    !(await consumeRateLimit(
      db,
      privateRateKey(
        "invitation-prepare",
        request.headers.get("x-real-ip") ?? "unknown",
      ),
      5,
      600,
    ))
  )
    return NextResponse.json(
      { code: "TOO_MANY_REQUESTS" },
      { status: 429, headers },
    );
  try {
    const { token } = z
      .object({ token: invitationTokenSchema })
      .parse(await readJson(request, 1024));
    const invitation = await findInvitationByToken(db, token);
    const response = NextResponse.json(
      { email: invitation.email },
      { headers },
    );
    response.cookies.set(
      invitationCookieName,
      signFlowCookie(
        { id: invitation.id },
        invitationCookieName,
        env.BETTER_AUTH_SECRET,
      ),
      flowCookieOptions(env.BETTER_AUTH_URL),
    );
    return response;
  } catch {
    return NextResponse.json(
      { code: "INVITATION_INVALID" },
      { status: 400, headers },
    );
  }
}
