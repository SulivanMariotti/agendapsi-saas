import { NextResponse } from "next/server";

// Protect professional panel routes.
// NOTE: We only check the presence of the session cookie at the Edge.
// Token verification happens server-side in /profissional.
export function middleware(request) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/profissional")) return NextResponse.next();

  const hasSession = Boolean(request.cookies.get("__session")?.value);
  if (hasSession) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/profissional/:path*"],
};
