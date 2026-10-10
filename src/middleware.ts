import { type NextRequest, NextResponse } from "next/server";

const ATTRIBUTION_KEYS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "campaign_id", "adset_id", "ad_id", "fbclid",
] as const;
const ATTRIBUTION_COOKIE_AGE = 30 * 24 * 60 * 60;

function withAttribution(request: NextRequest, response: NextResponse): NextResponse {
  const params = request.nextUrl.searchParams;
  // A touch is a tagged landing, not every later navigation without campaign parameters.
  if (!ATTRIBUTION_KEYS.some((key) => params.has(key))) return response;

  const touch: Record<string, string | null> = {
    landing_path: request.nextUrl.pathname.slice(0, 512),
    captured_at: new Date().toISOString(),
  };
  for (const key of ATTRIBUTION_KEYS) {
    touch[key] = params.get(key)?.trim().slice(0, 256) || null;
  }
  const cookieOptions = {
    path: "/",
    maxAge: ATTRIBUTION_COOKIE_AGE,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
  const value = JSON.stringify(touch);
  if (!request.cookies.has("ar_utm_first")) {
    response.cookies.set("ar_utm_first", value, cookieOptions);
  }
  response.cookies.set("ar_utm_last", value, cookieOptions);
  return response;
}

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
    "/past-life",
    "/numerology",
    "/spirit-animal",
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
      return withAttribution(request, NextResponse.redirect(new URL("/welcome", request.url)));
    }
  }
  
  return withAttribution(request, NextResponse.next());
}

export const config = {
  matcher: ["/((?!api(?:/|$)|_next(?:/|$)|.*\\.[^/]+$).*)"],
};
