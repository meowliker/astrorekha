import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { generateBirthChartReport } from "@/lib/birth-chart-report-generator";
import { getBirthDateIso, getBirthTime24 } from "@/lib/birth-details";

export const maxDuration = 60;

type AnyRecord = Record<string, any>;

function getMonthNumber(month: string): number {
  const monthMap: Record<string, number> = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
  };

  const trimmed = String(month || "").trim().toLowerCase();
  if (monthMap[trimmed]) return monthMap[trimmed];

  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && numeric >= 1 && numeric <= 12) {
    return numeric;
  }

  return 1;
}

function to24HourTime(hour: string, minute: string, period: string): string {
  let h = parseInt(String(hour || "12"), 10);
  const m = String(minute || "00").padStart(2, "0");
  const p = String(period || "PM").toUpperCase();

  if (!Number.isFinite(h) || h < 1 || h > 12) h = 12;
  if (p === "PM" && h !== 12) h += 12;
  if (p === "AM" && h === 12) h = 0;

  return `${String(h).padStart(2, "0")}:${m}`;
}

function makeBirthChartCacheKey(userProfile: AnyRecord | null, user: AnyRecord | null): string | null {
  const monthRaw =
    userProfile?.birth_month ||
    user?.birth_month ||
    "";
  const dayRaw =
    userProfile?.birth_day ||
    user?.birth_day ||
    "";
  const yearRaw =
    userProfile?.birth_year ||
    user?.birth_year ||
    "";

  if (!monthRaw || !dayRaw || !yearRaw) {
    return null;
  }

  const birthDate = getBirthDateIso({
    birthMonth: monthRaw,
    birthDay: dayRaw,
    birthYear: yearRaw,
  });
  if (!birthDate) return null;

  const knowsBirthTime =
    userProfile?.knows_birth_time !== undefined
      ? !!userProfile.knows_birth_time
      : true;

  const birthTime = knowsBirthTime
    ? getBirthTime24({
        birthHour: userProfile?.birth_hour || user?.birth_hour,
        birthMinute: userProfile?.birth_minute || user?.birth_minute,
        birthPeriod: userProfile?.birth_period || user?.birth_period,
        knowsBirthTime,
      })
    : "12:00";
  if (!birthTime) return null;

  const birthPlace = String(userProfile?.birth_place || user?.birth_place || "").trim();
  if (!birthPlace) return null;

  const base = `chart_${birthDate}_${birthTime}_${birthPlace}`.replace(/[^a-zA-Z0-9_]/g, "_");
  return `${base}_vedic`;
}

function getSessionUserId(request: NextRequest, fallbackUserId?: string | null): string | null {
  const accessCookie = request.cookies.get("ar_access")?.value;
  if (!accessCookie) return null;

  // Backward/forward compatible: if cookie ever stores user id, use it; otherwise use x-user-id.
  if (accessCookie !== "1" && accessCookie.trim()) {
    return accessCookie.trim();
  }

  const headerUserId = request.headers.get("x-user-id")?.trim();
  if (headerUserId) return headerUserId;

  const queryUserId = request.nextUrl.searchParams.get("userId")?.trim();
  if (queryUserId) return queryUserId;

  return fallbackUserId?.trim() || null;
}

export async function POST(request: NextRequest) {
  const requestBody = await request
    .json()
    .catch(() => ({} as { force?: boolean; userId?: string }));
  const userId = getSessionUserId(request, requestBody?.userId);

  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabaseAdmin = getSupabaseAdmin();

  try {
    const force = !!requestBody?.force;

    if (!force) {
      const { data: existingComplete } = await supabaseAdmin
        .from("birth_chart_reports")
        .select("id, status, sections, generated_at, created_at")
        .eq("user_id", userId)
        .eq("status", "complete")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingComplete) {
        return NextResponse.json({
          report_id: existingComplete.id,
          status: existingComplete.status,
          sections: existingComplete.sections || {},
          generated_at: existingComplete.generated_at || new Date().toISOString(),
        });
      }
    }

    const { data: userProfile } = await supabaseAdmin
      .from("user_profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    const { data: user } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    const birthChartCacheKey = makeBirthChartCacheKey(userProfile || null, user || null);
    if (!birthChartCacheKey) {
      return NextResponse.json(
        {
          error: "birth_details_required",
          message: "Please complete birth date, time, and place before generating the report.",
        },
        { status: 400 }
      );
    }

    let birthChart: AnyRecord | null = null;
    const { data } = await supabaseAdmin
      .from("birth_charts")
      .select("*")
      .eq("id", birthChartCacheKey)
      .maybeSingle();
    birthChart = data;

    const { data: natalChart } = await supabaseAdmin
      .from("natal_charts")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    const chartData = {
      ...(natalChart || {}),
      ...(birthChart || {}),
    };

    if (!birthChart && !natalChart) {
      return NextResponse.json({ error: "no_birth_chart_found" }, { status: 404 });
    }

    const { data: insertedReport, error: insertError } = await supabaseAdmin
      .from("birth_chart_reports")
      .insert({
        user_id: userId,
        birth_chart_id: birthChart?.id || null,
        status: "generating",
      })
      .select("id")
      .single();

    if (insertError || !insertedReport?.id) {
      console.error("[birth-chart-report/generate] failed to create report row", insertError);
      return NextResponse.json({ error: "generation_failed" }, { status: 500 });
    }

    const reportId = insertedReport.id as string;

    try {
      const generated = await generateBirthChartReport(chartData, userProfile || {}, user || {}, {
        userId,
        reportId,
      });

      const { error: updateError } = await supabaseAdmin
        .from("birth_chart_reports")
        .update({
          status: "complete",
          sections: generated.sections,
          generated_at: new Date().toISOString(),
        })
        .eq("id", reportId);

      if (updateError) {
        console.error("[birth-chart-report/generate] failed to update report row", updateError);
        return NextResponse.json({ error: "generation_failed" }, { status: 500 });
      }

      return NextResponse.json({
        report_id: reportId,
        status: "complete",
        sections: generated.sections,
        generated_at: new Date().toISOString(),
      });
    } catch (generationError) {
      console.error("[birth-chart-report/generate] generation failed", generationError);
      await supabaseAdmin
        .from("birth_chart_reports")
        .update({ status: "failed" })
        .eq("id", reportId);

      return NextResponse.json({ error: "generation_failed" }, { status: 500 });
    }
  } catch (error) {
    console.error("[birth-chart-report/generate] error", error);
    return NextResponse.json({ error: "generation_failed" }, { status: 500 });
  }
}
