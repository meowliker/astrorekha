import { type NextRequest, NextResponse } from "next/server";

const ATTRIBUTION_KEYS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "campaign_id", "adset_id", "ad_id", "fbclid", "gclid", "gbraid", "wbraid", "gad_campaignid",
  "meta_campaign_id", "meta_adset_id", "meta_ad_id",
] as const;
const ATTRIBUTION_COOKIE_AGE = 30 * 24 * 60 * 60;

function withAttribution(request: NextRequest, response: NextResponse): NextResponse {
  const pathname = request.nextUrl.pathname;
  const prefix = /^\/us\/soulmate(?:\/|$)/.test(pathname) ? "ar_us_soulmate_utm" : /^\/soulmate(?:\/|$)/.test(pathname) ? "ar_soulmate_utm" : /^\/us(?:\/|$)/.test(pathname) ? "ar_us_main_utm" : "ar_utm";
  const params = request.nextUrl.searchParams;
  // A touch is a tagged landing, not every later navigation without campaign parameters.
  const tagged = ATTRIBUTION_KEYS.some((key) => params.has(key));
  const entry = ["/", "/discover", "/soulmate", "/soulmate/discover", "/us", "/us/soulmate", "/us/soulmate/discover"].includes(pathname.replace(/\/+$/, "") || "/");
  if (!tagged) {
    if (!entry) return response;
    // Reloading the same landing preserves its tags. A different entry starts a new touch.
    try { if (JSON.parse(request.cookies.get(`${prefix}_last`)?.value || "null")?.landing_path === pathname) return response; } catch { /* Replace malformed cookies. */ }
  }

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
  if (!request.cookies.has(`${prefix}_first`)) {
    response.cookies.set(`${prefix}_first`, value, cookieOptions);
  }
  response.cookies.set(`${prefix}_last`, value, cookieOptions);
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
    "/witch-archetype",
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
      // Keep campaign parameters visible and available after redirecting to the landing page.
      const landingUrl = request.nextUrl.clone();
      landingUrl.pathname = "/";
      return withAttribution(request, NextResponse.redirect(landingUrl));
    }
  }
  
  return withAttribution(request, NextResponse.next());
}

export const config = {
  matcher: ["/((?!api(?:/|$)|_next(?:/|$)|.*\\.[^/]+$).*)"],
};
