import { NextRequest, NextResponse } from "next/server";
import { getBirthDateParts } from "@/lib/birth-details";
import { buildPastLifeReport } from "@/lib/past-life-report";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function getSessionUserId(request: NextRequest): string | null {
  const accessCookie = request.cookies.get("ar_access")?.value;
  if (!accessCookie) return null;

  if (accessCookie && accessCookie !== "1" && accessCookie.trim()) {
    return accessCookie.trim();
  }

  const headerUserId = request.headers.get("x-user-id")?.trim();
  if (headerUserId) return headerUserId;

  return null;
}

function getBirthDateFromProfile(userProfile: Record<string, any> | null, user: Record<string, any> | null): string | null {
  const parts = getBirthDateParts({
    birthMonth: userProfile?.birth_month || user?.birth_month,
    birthDay: userProfile?.birth_day || user?.birth_day,
    birthYear: userProfile?.birth_year || user?.birth_year,
  });
  if (!parts) return null;
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function getBirthTimeFromProfile(userProfile: Record<string, any> | null, user: Record<string, any> | null): string | null {
  const knowsBirthTime =
    userProfile?.knows_birth_time !== undefined
      ? !!userProfile.knows_birth_time
      : true;

  if (!knowsBirthTime) return "12:00";

  const hour = Number(String(userProfile?.birth_hour || user?.birth_hour || "").trim());
  const minute = Number(String(userProfile?.birth_minute || user?.birth_minute || "0").trim());
  const period = String(userProfile?.birth_period || user?.birth_period || "").trim().toUpperCase();

  if (!Number.isInteger(hour) || hour < 1 || hour > 12) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  if (period !== "AM" && period !== "PM") return null;

  let normalizedHour = hour;
  if (period === "PM" && normalizedHour !== 12) normalizedHour += 12;
  if (period === "AM" && normalizedHour === 12) normalizedHour = 0;

  return `${String(normalizedHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function makeBirthChartCacheKey(userProfile: Record<string, any> | null, user: Record<string, any> | null): string | null {
  const birthDate = getBirthDateFromProfile(userProfile, user);
  const birthTime = getBirthTimeFromProfile(userProfile, user);
  const birthPlace = String(userProfile?.birth_place || user?.birth_place || "").trim();
  if (!birthDate || !birthTime || !birthPlace) return null;

  const base = `chart_${birthDate}_${birthTime}_${birthPlace}`.replace(/[^a-zA-Z0-9_]/g, "_");
  return `${base}_vedic`;
}

function hasCompletePastLifeBirthDetails(
  userProfile: Record<string, any> | null,
  user: Record<string, any> | null
): boolean {
  return !!(
    getBirthDateFromProfile(userProfile, user) &&
    getBirthTimeFromProfile(userProfile, user) &&
    String(userProfile?.birth_place || user?.birth_place || "").trim()
  );
}

async function getPastLifeChartData(
  request: NextRequest,
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  userProfile: Record<string, any> | null,
  user: Record<string, any> | null
): Promise<Record<string, any> | null> {
  const cacheKey = makeBirthChartCacheKey(userProfile, user);
  if (!cacheKey) return null;

  const { data: cachedChart } = await supabase
    .from("birth_charts")
    .select("id, data")
    .eq("id", cacheKey)
    .maybeSingle();

  if (cachedChart?.data) {
    return cachedChart.data as Record<string, any>;
  }

  const birthDate = getBirthDateFromProfile(userProfile, user);
  const birthTime = getBirthTimeFromProfile(userProfile, user);
  const birthPlace = String(userProfile?.birth_place || user?.birth_place || "").trim();
  if (!birthDate || !birthTime || !birthPlace) return null;

  let latitude = 28.6139;
  let longitude = 77.209;
  let timezone = 5.5;

  try {
    const geoRes = await fetch(`${request.nextUrl.origin}/api/astrology/geo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ place_name: birthPlace }),
      cache: "no-store",
    });

    if (geoRes.ok) {
      const geo = await geoRes.json();
      if (geo?.success && geo?.data) {
        latitude = Number(geo.data.latitude) || latitude;
        longitude = Number(geo.data.longitude) || longitude;
        timezone = Number(geo.data.timezone) || timezone;
      }
    }

    const chartRes = await fetch(`${request.nextUrl.origin}/api/astrology/birth-chart`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        birthDate,
        birthTime,
        latitude,
        longitude,
        timezone,
        chartType: "vedic",
      }),
      cache: "no-store",
    });

    if (!chartRes.ok) return null;
    const chartJson = await chartRes.json();
    if (!chartJson?.success || !chartJson?.data) return null;

    const data = {
      ...chartJson.data,
      userBirthDetails: {
        date: birthDate,
        time: birthTime,
        place: birthPlace,
      },
      cachedAt: new Date().toISOString(),
    };

    await supabase.from("birth_charts").upsert(
      {
        id: cacheKey,
        data,
        cached_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

    await supabase.from("birth_chart_user_links").upsert(
      {
        user_id: userId,
        birth_chart_id: cacheKey,
      },
      { onConflict: "user_id,birth_chart_id" }
    );

    return data;
  } catch (error) {
    console.error("[past-life/generate] chart hydration failed", error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({} as { force?: boolean }));
  const userId = getSessionUserId(request);

  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const force = !!body?.force;

  try {
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (userError || !user) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }

    if (!user.unlocked_features?.pastLifeReport) {
      return NextResponse.json({ error: "feature_locked" }, { status: 403 });
    }

    if (!force) {
      const { data: existingComplete } = await supabase
        .from("past_life_reports")
        .select("id, status, report_data, birth_data, generated_at")
        .eq("user_id", userId)
        .eq("status", "complete")
        .maybeSingle();

      if (existingComplete?.report_data) {
        return NextResponse.json({
          id: existingComplete.id,
          status: "complete",
          report: existingComplete.report_data,
          birthData: existingComplete.birth_data || null,
          generated_at: existingComplete.generated_at || null,
          cached: true,
        });
      }
    }

    const { data: userProfile } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (!hasCompletePastLifeBirthDetails(userProfile || null, user)) {
      return NextResponse.json(
        {
          error: "missing_birth_details",
          message: "Please complete your birth date, birth time, and birth place before generating this report.",
        },
        { status: 400 }
      );
    }

    const chartData = await getPastLifeChartData(request, supabase, userId, userProfile || null, user);

    const nowIso = new Date().toISOString();
    await supabase.from("past_life_reports").upsert(
      {
        user_id: userId,
        status: "generating",
        updated_at: nowIso,
      },
      { onConflict: "user_id" }
    );

    const report = buildPastLifeReport({
      userId,
      name: user.name || null,
      email: user.email || null,
      userProfile: userProfile || null,
      user,
      chartData,
      generatedAt: nowIso,
    });

    if (!report) {
      await supabase
        .from("past_life_reports")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("user_id", userId);
      return NextResponse.json({ error: "missing_birth_details" }, { status: 400 });
    }

    const { data: saved, error: saveError } = await supabase
      .from("past_life_reports")
      .upsert(
        {
          user_id: userId,
          status: "complete",
          birth_data: report.birthData,
          report_data: report,
          generated_at: report.generatedAt,
          updated_at: report.generatedAt,
        },
        { onConflict: "user_id" }
      )
      .select("id, generated_at")
      .maybeSingle();

    if (saveError || !saved) {
      console.error("[past-life/generate] save error", saveError);
      return NextResponse.json({ error: "save_failed" }, { status: 500 });
    }

    return NextResponse.json({
      id: saved.id,
      status: "complete",
      report,
      birthData: report.birthData,
      generated_at: saved.generated_at || report.generatedAt,
      cached: false,
    });
  } catch (error) {
    console.error("[past-life/generate] unexpected", error);
    return NextResponse.json({ error: "generation_failed" }, { status: 500 });
  }
}
