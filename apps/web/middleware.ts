import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const protectedPrefixes = ["/dashboard"];

export function middleware(request: NextRequest) {
  const isProtectedRoute = protectedPrefixes.some((prefix) =>
    request.nextUrl.pathname.startsWith(prefix),
  );

  if (!isProtectedRoute) {
    return NextResponse.next();
  }

  // Auth redirect is intentionally deferred until Supabase session middleware is wired.
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
