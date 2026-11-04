import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, unsign } from "@/lib/server/auth/tokens";

/**
 * Page gate for PERKPILOT_AUTH=passkey: visitors without a validly signed
 * session cookie are sent to /login. This is a cheap first line only — every
 * API route re-validates the session against the database, so a revoked or
 * expired session can load the app shell but can't read or do anything.
 */
const PUBLIC_PATHS = ["/login", "/signup", "/offline"];

export function proxy(request: NextRequest) {
  if (process.env.PERKPILOT_AUTH !== "passkey") return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  let valid = false;
  try {
    valid = Boolean(unsign(request.cookies.get(SESSION_COOKIE)?.value));
  } catch {
    valid = false; // AUTH_SECRET missing: fail closed
  }
  if (valid) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Pages only: API routes do their own (database-backed) auth; static files are public.
  matcher: ["/((?!api/|_next/|icons/|sw\\.js|manifest\\.webmanifest|favicon\\.ico|robots\\.txt).*)"],
};
