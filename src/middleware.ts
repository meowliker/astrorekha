import { type NextRequest, NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
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
    const hasAccess = request.cookies.get("pc_access");
    
    if (!hasAccess) {
      // Redirect to welcome/onboarding
      return NextResponse.redirect(new URL("/welcome", request.url));
    }
    
    // Check for subscription cancelled cookie (set by client-side check)
    const subscriptionCancelled = request.cookies.get("pc_sub_cancelled");
    
    if (subscriptionCancelled?.value === "1" && !isAllowedForCancelled) {
      // Redirect cancelled users to manage subscription page
      return NextResponse.redirect(new URL("/manage-subscription", request.url));
    }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
