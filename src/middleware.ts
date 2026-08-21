import { type NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (process.env.NODE_ENV === "production" && pathname.startsWith("/page-previews")) {
    return new NextResponse("Not found", { status: 404 });
  }
  
  // Protected routes that require onboarding completion
  const protectedRoutes = [
    "/dashboard",
    "/reports",
    "/chat",
    "/palm-reading",
    "/horoscope",
    "/birth-chart",
    "/compatibility",
    "/prediction-2026",
    "/soulmate-sketch",
    "/future-partner",
    "/profile",
    "/settings",
  ];
  
  // Routes that cancelled users can still access (to manage their subscription)
  const allowedForCancelledUsers = [
    "/manage-subscription",
    "/login",
    "/welcome",
  ];
  
  // Check if current path is protected
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));
  const isAllowedForCancelled = allowedForCancelledUsers.some(route => pathname.startsWith(route));
  
  if (isProtectedRoute) {
    // Check for access cookie
    const hasAccess = request.cookies.get("ar_access");
    
    if (!hasAccess) {
      // Redirect to welcome/onboarding
      return NextResponse.redirect(new URL("/welcome", request.url));
    }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/page-previews/:path*",
    "/dashboard/:path*",
    "/reports/:path*",
    "/chat/:path*",
    "/palm-reading/:path*",
    "/horoscope/:path*",
    "/birth-chart/:path*",
    "/compatibility/:path*",
    "/prediction-2026/:path*",
    "/soulmate-sketch/:path*",
    "/future-partner/:path*",
    "/profile/:path*",
    "/settings/:path*",
  ],
};
