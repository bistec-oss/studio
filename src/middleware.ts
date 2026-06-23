import { NextRequest, NextResponse } from "next/server"

const PUBLIC_PREFIXES = ["/login", "/api/auth"]

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // better-auth sets this cookie on successful sign-in
  const session = req.cookies.get("better-auth.session_token")
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
