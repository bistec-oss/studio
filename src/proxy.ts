import { NextRequest, NextResponse } from "next/server"

// /api/acp is a machine-to-machine surface authenticated by its own API key
// (resolveApiKey, DB-backed — src/mcp/auth.ts), not by the session cookie —
// exempt it from the session gate so the route-level key check governs (and
// fails closed when the key doesn't resolve to a live ApiKey row).
const PUBLIC_PREFIXES = ["/login", "/api/auth", "/api/acp"]

// Next 16: the `middleware` convention is deprecated in favour of `proxy`
// (runs on the nodejs runtime; this cookie-presence gate is runtime-agnostic).
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Exact path or a true sub-path — avoids a public prefix matching an
  // unintended sibling route (e.g. "/loginsomething").
  if (PUBLIC_PREFIXES.some(p => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next()
  }

  // NOTE: this is a cheap presence gate only — it does not validate the session.
  // Authoritative auth (session validity + role) is enforced per-route via
  // getCurrentUser()/requireRole(); the cookie check just short-circuits
  // obviously-unauthenticated navigation to the login page.
  // better-auth prefixes the cookie with "__Secure-" whenever it issues secure
  // cookies (any https deployment, i.e. every production/Coolify deploy) — only
  // the unprefixed name appears over plain http (local dev), so check both.
  const session =
    req.cookies.get("better-auth.session_token") ??
    req.cookies.get("__Secure-better-auth.session_token")
  if (!session) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?|ttf|ico)).*)",
  ],
}
