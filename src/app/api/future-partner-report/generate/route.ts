import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { generateFuturePartnerReport } from "@/lib/future-partner-report";

export const maxDuration = 60;

function getPublicErrorMessage(raw: unknown): string {
  const message = String((raw as any)?.message || "").toLowerCase();
  if (
    message.includes("overloaded_error") ||
    message.includes("overloaded") ||
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("529")
  ) {
    return "Prediction service is busy right now. Please try again in 30-60 seconds.";
  }
  return "Failed to generate report. Please try again.";
}

function getSessionUserId(request: NextRequest): string | null {
  const accessCookie = request.cookies.get("ar_access")?.value;
  if (!accessCookie) return null;

  if (accessCookie !== "1" && accessCookie.trim()) {
    return accessCookie.trim();
  }

  const headerUserId = request.headers.get("x-user-id")?.trim();
  if (headerUserId) return headerUserId;

  const queryUserId = request.nextUrl.searchParams.get("userId")?.trim();
  if (queryUserId) return queryUserId;

  return null;
}

export async function POST(request: NextRequest) {
  const userId = getSessionUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (userError || !user) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  const unlocked = user.unlocked_features || {};
  if (!unlocked.futurePartnerReport) {
    return NextResponse.json({ error: "feature_locked" }, { status: 403 });
  }

  const { data: existingRow, error: existingError } = await supabase
    .from("future_partner_reports")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (existingError) {
    console.error("[future-partner/generate] existing row error", existingError);
    return NextResponse.json({ error: "generation_failed" }, { status: 500 });
  }

  if (existingRow?.status === "complete" && existingRow?.report_data) {
    return NextResponse.json({
      success: true,
      cached: true,
      report: existingRow.report_data,
      generated_at: existingRow.generated_at,
      status: "complete",
    });
  }

  const nowIso = new Date().toISOString();

  const { data: userProfileById } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  let userProfile = userProfileById;
  if (!userProfile) {
    const { data: userProfileByUserId } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    userProfile = userProfileByUserId;
  }

  const { data: birthChart } = await supabase
    .from("birth_charts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: natalChart } = await supabase
    .from("natal_charts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const chartData = {
    ...(natalChart || {}),
    ...(birthChart || {}),
  };

  const { error: upsertError } = await supabase
    .from("future_partner_reports")
    .upsert(
      {
        user_id: userId,
        status: "generating",
        report_data: existingRow?.report_data || {},
        created_at: existingRow?.created_at || nowIso,
        updated_at: nowIso,
      },
      { onConflict: "user_id" }
    );

  if (upsertError) {
    console.error("[future-partner/generate] upsert error", upsertError);
    return NextResponse.json({ error: "generation_failed" }, { status: 500 });
  }

  try {
    const report = await generateFuturePartnerReport({
      user,
      userProfile,
      chartData,
    });

    const generatedAt = new Date().toISOString();

    const { data: completed, error: completeError } = await supabase
      .from("future_partner_reports")
      .update({
        status: "complete",
        report_data: report,
        generated_at: generatedAt,
        updated_at: generatedAt,
      })
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();

    if (completeError || !completed) {
      console.error("[future-partner/generate] complete update error", completeError);
      return NextResponse.json({ error: "generation_failed" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      status: "complete",
      report: completed.report_data,
      generated_at: completed.generated_at,
    });
  } catch (error: any) {
    console.error("[future-partner/generate] provider error", error);

    await supabase
      .from("future_partner_reports")
      .update({
        status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    return NextResponse.json(
      {
        error: "generation_failed",
        message: getPublicErrorMessage(error),
      },
      { status: 500 }
    );
  }
}
