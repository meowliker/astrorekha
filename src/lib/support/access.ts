import { NextRequest } from "next/server";
import { createReportSession, REPORT_SESSION_COOKIE } from "@/lib/report-session";
import { GET as readSession } from "@/app/api/auth/session/route";
import { db, checked } from "./auth";
import { identifier, SupportError } from "./policy";

// Exercise the same authenticated account resolver used by the sketch page.
// The probe's cookie never leaves this server or appears in a support response.
export async function inspectCustomerAccess(customerId: string) {
  identifier(customerId);
  const response = await readSession(new NextRequest("https://astrorekha.com/api/auth/session", {
    headers: { cookie: `${REPORT_SESSION_COOKIE}=${createReportSession(customerId)}` },
  }));
  if (!response.ok) throw new SupportError("The app could not resolve this account. Retry the access check before preparing a reply.", response.status);
  const { user } = await response.json();
  if (user?.id !== customerId) throw new SupportError("Account identity did not match", 409);
  const sketch = checked(await db().from("soulmate_sketches")
    .select("status,question_answers,provider_job_id,sketch_image_url,updated_at")
    .eq("user_id", customerId).maybeSingle());
  const hasAnswers = !!Object.keys(sketch?.question_answers || {}).length;
  return {
    customerId, email: user.email,
    checkedAt: new Date().toISOString(),
    sessionFlowVersion: "2026-11-14-signed-sketch-session",
    verified: { signedAccountResolver: true, localUserIdRequired: false, legacyAccessCookieRequired: false },
    verificationScope: "Server account/session resolution only. This does not observe the customer's browser, prove email delivery, or claim a report is ready.",
    sketch: { unlocked: !!user.unlocked_features?.soulmateSketch, status: sketch?.status || "not_started", hasSavedAnswers: hasAnswers, hasProviderJob: !!sketch?.provider_job_id, hasSavedImage: !!sketch?.sketch_image_url },
    loginUrl: "https://astrorekha.com/login?next=/soulmate-sketch",
    reportPath: "/soulmate-sketch",
    nextStep: !user.unlocked_features?.soulmateSketch ? "Inspect the verified purchase; use restore_access only for its purchased feature."
      : hasAnswers || sketch?.provider_job_id ? "Inspect saved inputs and resume recover_report for soulmateSketch when needed; verify its completed image before a ready draft."
        : "The app now restores identity from the signed session and keeps browser answers through sign-in. Ask the customer to reopen Soulmate Sketch and continue the questionnaire only if it appears. Do not invent answers or claim the sketch is ready. Check linked records before requesting inputs.",
  };
}
