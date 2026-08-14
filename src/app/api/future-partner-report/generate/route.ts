import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { generateFuturePartnerReport } from "@/lib/future-partner-report";
import { normalizeFuturePartnerReportData } from "@/lib/future-partner-report-data";
import { normalizeBirthDetailsSnapshot } from "@/lib/birth-details";

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

function isRecentGeneratingRow(row: any): boolean {
  if (row?.status !== "generating") return false;

  const updatedAtMs = Date.parse(String(row?.updated_at || row?.created_at || ""));
  if (!Number.isFinite(updatedAtMs)) return true;

  return Date.now() - updatedAtMs < 2 * 60 * 1000;
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

  const cachedReport = normalizeFuturePartnerReportData(existingRow?.report_data);
  if (existingRow?.status === "complete" && cachedReport) {
    return NextResponse.json({
      success: true,
      cached: true,
      report: cachedReport,
      generated_at: existingRow.generated_at,
      status: "complete",
    });
  }

  const nowIso = new Date().toISOString();
  if (isRecentGeneratingRow(existingRow)) {
    return NextResponse.json(
      {
        success: true,
        status: "generating",
        message: "Future partner report generation is already in progress.",
      },
      { status: 202 }
    );
  }

  let generationRow = existingRow;
  if (!existingRow) {
    const { data: insertedRow, error: insertError } = await supabase
      .from("future_partner_reports")
      .insert({
        user_id: userId,
        status: "generating",
        report_data: {},
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select("*")
      .maybeSingle();

    if (insertError) {
      if (insertError.code === "23505") {
        return NextResponse.json(
          {
            success: true,
            status: "generating",
            message: "Future partner report generation is already in progress.",
          },
          { status: 202 }
        );
      }

      console.error("[future-partner/generate] insert lock error", insertError);
      return NextResponse.json({ error: "generation_failed" }, { status: 500 });
    }

    generationRow = insertedRow;
  } else {
    const { data: updatedRow, error: lockError } = await supabase
      .from("future_partner_reports")
      .update({
        status: "generating",
        report_data: cachedReport || {},
        updated_at: nowIso,
      })
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();

    if (lockError || !updatedRow) {
      console.error("[future-partner/generate] update lock error", lockError);
      return NextResponse.json({ error: "generation_failed" }, { status: 500 });
    }

    generationRow = updatedRow;
  }

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

  const profileBirthSnapshot = normalizeBirthDetailsSnapshot(
    {
      birthMonth: userProfile?.birth_month,
      birthDay: userProfile?.birth_day,
      birthYear: userProfile?.birth_year,
      birthHour: userProfile?.birth_hour,
      birthMinute: userProfile?.birth_minute,
      birthPeriod: userProfile?.birth_period,
      birthPlace: userProfile?.birth_place,
      knowsBirthTime: userProfile?.knows_birth_time,
      gender: userProfile?.gender,
      relationshipStatus: userProfile?.relationship_status,
    },
    "future_partner_generate_profile"
  );

  const userBirthSnapshot = normalizeBirthDetailsSnapshot(
    {
      birthMonth: user.birth_month,
      birthDay: user.birth_day,
      birthYear: user.birth_year,
      birthHour: user.birth_hour,
      birthMinute: user.birth_minute,
      birthPeriod: user.birth_period,
      birthPlace: user.birth_place,
      knowsBirthTime: true,
      gender: user.gender,
      relationshipStatus: user.relationship_status,
    },
    "future_partner_generate_user"
  );

  const birthSnapshot = profileBirthSnapshot?.completeForBirthChart
    ? profileBirthSnapshot
    : userBirthSnapshot?.completeForBirthChart
      ? userBirthSnapshot
      : profileBirthSnapshot || userBirthSnapshot;

  if (!birthSnapshot?.completeForBirthChart) {
    await supabase
      .from("future_partner_reports")
      .update({
        status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    return NextResponse.json(
      {
        error: "birth_details_required",
        message: "Please complete birth date, time, and place before generating the report.",
      },
      { status: 400 }
    );
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

  try {
    const report = await generateFuturePartnerReport({
      user,
      userProfile,
      chartData,
      usageLogContext: {
        userId,
        reportId: generationRow?.id || null,
      },
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
