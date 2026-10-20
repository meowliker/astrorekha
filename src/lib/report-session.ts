import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

export const REPORT_SESSION_COOKIE = "ar_report_session";
const MAX_AGE = 60 * 60 * 24 * 30;
function signature(payload: string) {
  const secret = process.env.REPORT_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Report session signing is unavailable");
  return createHmac("sha256", secret).update(`astrorekha:report-session:v1:${payload}`).digest("base64url");
}
export function createReportSession(userId: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(now / 1000) + MAX_AGE })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}
export function verifyReportSession(token: string | undefined, now = Date.now()): string | null {
  if (!token || token.length > 2048) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const expected = Buffer.from(signature(parts[0]));
    const received = Buffer.from(parts[1]);
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (typeof payload.sub !== "string" || !payload.sub.trim() || !Number.isSafeInteger(payload.exp) || payload.exp <= Math.floor(now / 1000)) return null;
    return payload.sub;
  } catch { return null; }
}
export function reportSessionUser(request: NextRequest): string | null {
  // Legacy ar_access, query parameters, headers and request bodies are not identity proofs.
  return verifyReportSession(request.cookies.get(REPORT_SESSION_COOKIE)?.value);
}
export function setReportSession(response: NextResponse, userId: string): NextResponse {
  response.cookies.set(REPORT_SESSION_COOKIE, createReportSession(userId), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE,
  });
  return response;
}
