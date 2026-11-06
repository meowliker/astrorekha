import { NextRequest, NextResponse } from "next/server";
import {
  normalizeViewerEmail, readAnalyticsViewer, sameViewerOrigin, viewerCookie, viewerLogin,
  viewerLogout, viewerPermissions, viewerSessionSeconds,
} from "@/lib/partner-analytics-access";
import { readPartnerAnalytics } from "@/lib/partner-analytics-report";

export const dynamic = "force-dynamic";
const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET(request: NextRequest) {
  try {
    const viewer = await readAnalyticsViewer(request);
    if (!viewer) return json({ error: "Sign in to view this report." }, 401);
    const days = request.nextUrl.searchParams.get("days") || "30";
    if (days !== "7" && days !== "30" && days !== "90") return json({ error: "Invalid reporting period." }, 400);
    const permissions = viewerPermissions(viewer);
    let report;
    try {
      report = await readPartnerAnalytics(permissions, Number(days) as 7 | 30 | 90);
    } catch {
      return json({ viewer: viewer.label, error: "The analytics report is temporarily unavailable." }, 503);
    }
    const current = await readAnalyticsViewer(request);
    if (!current || current.id !== viewer.id || current.session_version !== viewer.session_version) {
      return json({ error: "Sign in to view this report." }, 401);
    }
    if (JSON.stringify(viewerPermissions(current)) !== JSON.stringify(permissions)) {
      return json({ error: "Your access changed. Refresh to load the updated report." }, 409);
    }
    return json({ viewer: current.label, report });
  } catch {
    return json({ error: "Analytics access is temporarily unavailable." }, 503);
  }
}

export async function POST(request: NextRequest) {
  if (!sameViewerOrigin(request)) return json({ error: "Invalid request origin." }, 403);
  try {
    const body = await request.json().catch(() => null);
    const cookie = {
      httpOnly: true, secure: process.env.NODE_ENV === "production" || request.nextUrl.protocol === "https:",
      sameSite: "lax" as const, path: "/api/partner-analytics",
    };
    if (body?.action === "logout") {
      await viewerLogout(request);
      const response = json({ success: true });
      response.cookies.set(viewerCookie, "", { ...cookie, maxAge: 0 });
      return response;
    }
    const email = normalizeViewerEmail(body?.email);
    if (body?.action !== "login" || !email || typeof body.password !== "string" || !/^[\w-]{32}$/.test(body.password)) {
      return json({ error: "Invalid email or password." }, 401);
    }
    const result = await viewerLogin(request, email, body.password);
    if (result.status === 429) return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
    if (result.status === 401) return json({ error: "Invalid email or password." }, 401);
    const response = json({ success: true });
    response.cookies.set(viewerCookie, result.token, { ...cookie, maxAge: viewerSessionSeconds });
    return response;
  } catch {
    return json({ error: "Sign-in is temporarily unavailable." }, 503);
  }
}
