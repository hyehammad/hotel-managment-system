import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect staff dashboard routes
  if (pathname.startsWith("/staff/dashboard")) {
    const sessionCookie = request.cookies.get("hms_staff_session");

    if (!sessionCookie?.value) {
      const loginUrl = new URL("/staff/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/staff/dashboard/:path*"],
};
