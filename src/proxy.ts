import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export function proxy(request: NextRequest) {
  // Presence only. Each protected page, action and handler still calls requireUser().
  if (
    /^\/(profile|admin|mfa|employees|references)(\/|$)/.test(
      request.nextUrl.pathname,
    ) &&
    !getSessionCookie(request)
  )
    return NextResponse.redirect(new URL("/login", request.url));
  const headers = new Headers(request.headers);
  headers.set(
    "x-harnois-path",
    request.nextUrl.pathname + request.nextUrl.search,
  );
  return NextResponse.next({ request: { headers } });
}
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
