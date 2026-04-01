import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

function getSessionUserId(request: NextRequest, fallbackUserId?: string | null): string | null {
  const accessCookie = request.cookies.get("ar_access")?.value;
  if (!accessCookie) return null;

  if (accessCookie !== "1" && accessCookie.trim()) {
    return accessCookie.trim();
  }

  const headerUserId = request.headers.get("x-user-id")?.trim();
  if (headerUserId) return headerUserId;

  const queryUserId = request.nextUrl.searchParams.get("userId")?.trim();
  if (queryUserId) return queryUserId;

  return fallbackUserId?.trim() || null;
}

type KeyValue = { label: string; value: string };
type PlanetRow = {
  planet: string;
  sign: string;
  house: string;
  nakshatra: string;
  pada: string;
};

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

function makeBirthChartCacheKey(userProfile: Record<string, any> | null, user: Record<string, any> | null): string | null {
  const monthRaw = userProfile?.birth_month || user?.birth_month || "";
  const dayRaw = userProfile?.birth_day || user?.birth_day || "";
  const yearRaw = userProfile?.birth_year || user?.birth_year || "";

  if (!monthRaw || !dayRaw || !yearRaw) return null;

  const month = getMonthNumber(String(monthRaw));
  const day = parseInt(String(dayRaw), 10) || 1;
  const year = parseInt(String(yearRaw), 10) || 2000;

  const knowsBirthTime =
    userProfile?.knows_birth_time !== undefined
      ? !!userProfile.knows_birth_time
      : true;

  const birthTime = knowsBirthTime
    ? to24HourTime(
        String(userProfile?.birth_hour || user?.birth_hour || "12"),
        String(userProfile?.birth_minute || user?.birth_minute || "00"),
        String(userProfile?.birth_period || user?.birth_period || "PM")
      )
    : "12:00";

  const birthDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const birthPlace = String(userProfile?.birth_place || user?.birth_place || "unknown");
  const base = `chart_${birthDate}_${birthTime}_${birthPlace}`.replace(/[^a-zA-Z0-9_]/g, "_");
  return `${base}_vedic`;
}

function getBirthDateFromProfile(userProfile: Record<string, any> | null, user: Record<string, any> | null): string | null {
  const monthRaw = userProfile?.birth_month || user?.birth_month || "";
  const dayRaw = userProfile?.birth_day || user?.birth_day || "";
  const yearRaw = userProfile?.birth_year || user?.birth_year || "";
  if (!monthRaw || !dayRaw || !yearRaw) return null;

  const month = getMonthNumber(String(monthRaw));
  const day = parseInt(String(dayRaw), 10) || 1;
  const year = parseInt(String(yearRaw), 10) || 2000;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getBirthTimeFromProfile(userProfile: Record<string, any> | null, user: Record<string, any> | null): string {
  const knowsBirthTime =
    userProfile?.knows_birth_time !== undefined
      ? !!userProfile.knows_birth_time
      : true;

  if (!knowsBirthTime) return "12:00";

  return to24HourTime(
    String(userProfile?.birth_hour || user?.birth_hour || "12"),
    String(userProfile?.birth_minute || user?.birth_minute || "00"),
    String(userProfile?.birth_period || user?.birth_period || "PM")
  );
}

async function hydrateBirthChartFromApi(
  request: NextRequest,
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  reportId: string,
  userProfile: Record<string, any> | null,
  user: Record<string, any> | null,
  cacheKey: string
): Promise<Record<string, any> | null> {
  const birthDate = getBirthDateFromProfile(userProfile, user);
  if (!birthDate) return null;

  const birthTime = getBirthTimeFromProfile(userProfile, user);
  const birthPlace = String(userProfile?.birth_place || user?.birth_place || "").trim();

  let latitude = 28.6139;
  let longitude = 77.209;
  let timezone = 5.5;

  try {
    if (birthPlace) {
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
        place: birthPlace || "Unknown",
      },
      cachedAt: new Date().toISOString(),
    };

    await supabaseAdmin
      .from("birth_charts")
      .upsert(
        {
          id: cacheKey,
          data,
          cached_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

    await supabaseAdmin
      .from("birth_chart_reports")
      .update({ birth_chart_id: cacheKey })
      .eq("id", reportId);

    return data;
  } catch (error) {
    console.error("[birth-chart-report/:id] chart hydration failed", error);
    return null;
  }
}

function safeText(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : "—";
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "—";
}

function formatBirthDate(userProfile: Record<string, any> | null): string {
  const month = safeText(userProfile?.birth_month);
  const day = safeText(userProfile?.birth_day);
  const year = safeText(userProfile?.birth_year);

  if (month === "—" || day === "—" || year === "—") return "—";
  return `${day} ${month}, ${year}`;
}

function formatBirthTime(userProfile: Record<string, any> | null, birthData: Record<string, any>): string {
  const fromBirthData = safeText(birthData?.birthDetails?.time);
  if (fromBirthData !== "—") return fromBirthData;

  const hour = safeText(userProfile?.birth_hour);
  const minute = safeText(userProfile?.birth_minute);
  const period = safeText(userProfile?.birth_period);
  if (hour === "—" || minute === "—") return "—";
  return `${hour}:${String(minute).padStart(2, "0")} ${period === "—" ? "" : period}`.trim();
}

function buildPlanetaryRows(birthData: Record<string, any>, natalChart: Record<string, any> | null): PlanetRow[] {
  const rows: PlanetRow[] = [];

  const natalPlanets = natalChart?.chart?.planets;
  if (natalPlanets && typeof natalPlanets === "object") {
    for (const [planet, raw] of Object.entries(natalPlanets as Record<string, any>)) {
      const data = raw || {};
      rows.push({
        planet,
        sign: safeText(data?.tropical?.sign || data?.sign || data?.rasi),
        house: safeText(data?.house_western || data?.house),
        nakshatra: safeText(data?.nakshatra || data?.vedic?.nakshatra),
        pada: safeText(data?.pada || data?.vedic?.pada),
      });
    }
  }

  if (rows.length === 0) {
    const fallbackPlanets = birthData?.planets;
    if (fallbackPlanets && typeof fallbackPlanets === "object") {
      for (const [planet, raw] of Object.entries(fallbackPlanets as Record<string, any>)) {
        const data = raw || {};
        rows.push({
          planet,
          sign: safeText(data?.zodiac_sign || data?.sign),
          house: safeText(data?.house),
          nakshatra: safeText(data?.name || data?.nakshatra),
          pada: safeText(data?.pada),
        });
      }
    }
  }

  const order = ["Ascendant", "Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"];
  rows.sort((a, b) => {
    const ai = order.indexOf(a.planet);
    const bi = order.indexOf(b.planet);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  return rows;
}

export async function GET(
  request: NextRequest,
  context: { params: { id: string } }
) {
  const userId = getSessionUserId(request);

  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const reportId = context.params.id;

  if (!reportId) {
    return NextResponse.json({ error: "report_not_found" }, { status: 404 });
  }

  const supabaseAdmin = getSupabaseAdmin();

  const { data: report, error } = await supabaseAdmin
    .from("birth_chart_reports")
    .select("*")
    .eq("id", reportId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[birth-chart-report/:id] error", error);
    return NextResponse.json({ error: "report_fetch_failed" }, { status: 500 });
  }

  if (!report) {
    return NextResponse.json({ error: "report_not_found" }, { status: 404 });
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

  const { data: natalChart } = await supabaseAdmin
    .from("natal_charts")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  let birthChartData: Record<string, any> = {};
  if (report.birth_chart_id && typeof report.birth_chart_id === "string") {
    const { data: birthChart } = await supabaseAdmin
      .from("birth_charts")
      .select("data")
      .eq("id", report.birth_chart_id)
      .maybeSingle();
    birthChartData = (birthChart?.data as Record<string, any>) || {};
  }

  if (!birthChartData || Object.keys(birthChartData).length === 0) {
    const fallbackCacheKey = makeBirthChartCacheKey(
      (userProfile as Record<string, any> | null) || null,
      (user as Record<string, any> | null) || null
    );

    if (fallbackCacheKey) {
      const { data: fallbackBirthChart } = await supabaseAdmin
        .from("birth_charts")
        .select("id, data")
        .eq("id", fallbackCacheKey)
        .maybeSingle();

      if (fallbackBirthChart?.data) {
        birthChartData = fallbackBirthChart.data as Record<string, any>;
      }
    }
  }

  if ((!birthChartData || Object.keys(birthChartData).length === 0) && (userProfile || user)) {
    const fallbackCacheKey = makeBirthChartCacheKey(
      (userProfile as Record<string, any> | null) || null,
      (user as Record<string, any> | null) || null
    );
    if (fallbackCacheKey) {
      const hydrated = await hydrateBirthChartFromApi(
        request,
        supabaseAdmin,
        reportId,
        (userProfile as Record<string, any> | null) || null,
        (user as Record<string, any> | null) || null,
        fallbackCacheKey
      );
      if (hydrated) {
        birthChartData = hydrated;
      }
    }
  }

  const kundli = birthChartData?.kundli || {};
  const nakshatraDetails = kundli?.nakshatra_details || {};
  const currentDasha = natalChart?.dasha?.current_period;

  const basicDetails = [
    { label: "Name", value: safeText(user?.name || userProfile?.name) },
    { label: "Sex", value: safeText(userProfile?.gender || user?.gender) },
    { label: "Date of Birth", value: formatBirthDate(userProfile as Record<string, any> | null) },
    { label: "Time of Birth", value: formatBirthTime(userProfile as Record<string, any> | null, birthChartData) },
    { label: "Place of Birth", value: safeText(userProfile?.birth_place || birthChartData?.birthDetails?.place) },
    { label: "Timezone", value: safeText(user?.timezone || birthChartData?.birthDetails?.timezone) },
    { label: "Latitude", value: safeText(birthChartData?.birthDetails?.latitude) },
    { label: "Longitude", value: safeText(birthChartData?.birthDetails?.longitude) },
  ];

  const astroDetails = [
    { label: "Lagna", value: safeText(nakshatraDetails?.zodiac?.name) },
    { label: "Lagna Lord", value: safeText(nakshatraDetails?.zodiac?.lord?.name) },
    { label: "Rasi", value: safeText(nakshatraDetails?.chandra_rasi?.name) },
    { label: "Rasi Lord", value: safeText(nakshatraDetails?.chandra_rasi?.lord?.name) },
    {
      label: "Nakshatra-Pada",
      value: safeText(
        nakshatraDetails?.nakshatra?.name
          ? `${nakshatraDetails?.nakshatra?.name} ${safeText(nakshatraDetails?.nakshatra?.pada)}`
          : "—"
      ),
    },
    { label: "Nakshatra Lord", value: safeText(nakshatraDetails?.nakshatra?.lord?.name) },
    { label: "Sun Sign (Indian)", value: safeText(nakshatraDetails?.soorya_rasi?.name) },
    { label: "Moon Sign", value: safeText(nakshatraDetails?.chandra_rasi?.name) },
    {
      label: "Current Dasha",
      value: safeText(currentDasha?.label || currentDasha?.mahadasha),
    },
    {
      label: "Current Antardasha",
      value: safeText(currentDasha?.antardasha),
    },
  ];

  const planetaryPositions = buildPlanetaryRows(birthChartData, natalChart as Record<string, any> | null);
  const chartSvgs = {
    lagna_chart_svg: safeText(birthChartData?.chart?.output) !== "—" ? birthChartData?.chart?.output : null,
    navamsa_chart_svg: safeText(birthChartData?.navamsaChart?.output) !== "—" ? birthChartData?.navamsaChart?.output : null,
  };

  return NextResponse.json({
    ...report,
    chart_details: {
      basic_details: basicDetails,
      astro_details: astroDetails,
      planetary_positions: planetaryPositions,
      ...chartSvgs,
    },
  });
}
