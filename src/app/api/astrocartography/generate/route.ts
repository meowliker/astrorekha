import { NextRequest, NextResponse } from "next/server";
import {
  buildAstrocartographyReport,
  hasUsableAstrocartographyLines,
  type AstrocartographyBirthData,
} from "@/lib/astrocartography-report";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getBirthDateParts, getBirthTime24 } from "@/lib/birth-details";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type AnyRecord = Record<string, any>;

const CITY_COORDINATES: Record<string, { latitude: number; longitude: number; timezone: number }> = {
  "new delhi": { latitude: 28.6139, longitude: 77.209, timezone: 5.5 },
  delhi: { latitude: 28.6139, longitude: 77.209, timezone: 5.5 },
  mumbai: { latitude: 19.076, longitude: 72.8777, timezone: 5.5 },
  bangalore: { latitude: 12.9716, longitude: 77.5946, timezone: 5.5 },
  bengaluru: { latitude: 12.9716, longitude: 77.5946, timezone: 5.5 },
  chennai: { latitude: 13.0827, longitude: 80.2707, timezone: 5.5 },
  kolkata: { latitude: 22.5726, longitude: 88.3639, timezone: 5.5 },
  hyderabad: { latitude: 17.385, longitude: 78.4867, timezone: 5.5 },
  pune: { latitude: 18.5204, longitude: 73.8567, timezone: 5.5 },
  ahmedabad: { latitude: 23.0225, longitude: 72.5714, timezone: 5.5 },
  jaipur: { latitude: 26.9124, longitude: 75.7873, timezone: 5.5 },
  lucknow: { latitude: 26.8467, longitude: 80.9462, timezone: 5.5 },
  raipur: { latitude: 21.2514, longitude: 81.6296, timezone: 5.5 },
  "new york": { latitude: 40.7128, longitude: -74.006, timezone: -5 },
  "los angeles": { latitude: 34.0522, longitude: -118.2437, timezone: -8 },
  london: { latitude: 51.5074, longitude: -0.1278, timezone: 0 },
  paris: { latitude: 48.8566, longitude: 2.3522, timezone: 1 },
  tokyo: { latitude: 35.6762, longitude: 139.6503, timezone: 9 },
  sydney: { latitude: -33.8688, longitude: 151.2093, timezone: 11 },
  dubai: { latitude: 25.2048, longitude: 55.2708, timezone: 4 },
  singapore: { latitude: 1.3521, longitude: 103.8198, timezone: 8 },
};

function getSessionUserId(request: NextRequest, fallbackUserId?: string | null): string | null {
  const accessCookie = request.cookies.get("ar_access")?.value;
  if (accessCookie && accessCookie !== "1" && accessCookie.trim()) {
    return accessCookie.trim();
  }

  const headerUserId = request.headers.get("x-user-id")?.trim();
  if (headerUserId) return headerUserId;

  const queryUserId = request.nextUrl.searchParams.get("userId")?.trim();
  if (queryUserId) return queryUserId;

  return fallbackUserId?.trim() || null;
}

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

  return 0;
}

function to24HourParts(hour: string, minute: string, period: string): { hour: number; minute: number } {
  let h = parseInt(String(hour || "12"), 10);
  let m = parseInt(String(minute || "0"), 10);
  const p = String(period || "PM").toUpperCase();

  if (!Number.isFinite(h) || h < 1 || h > 12) h = 12;
  if (!Number.isFinite(m) || m < 0 || m > 59) m = 0;
  if (p === "PM" && h !== 12) h += 12;
  if (p === "AM" && h === 12) h = 0;

  return { hour: h, minute: m };
}

async function geocodePlace(placeName: string): Promise<{
  latitude: number;
  longitude: number;
  timezone: number;
  placeName: string;
}> {
  const normalizedPlace = placeName.toLowerCase().trim();
  for (const [city, coords] of Object.entries(CITY_COORDINATES)) {
    if (normalizedPlace.includes(city) || city.includes(normalizedPlace)) {
      return { ...coords, placeName };
    }
  }

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(placeName)}&format=json&limit=1`,
      {
        headers: {
          "User-Agent": "AstroRekha/1.0",
        },
      }
    );

    if (response.ok) {
      const results = await response.json();
      const first = Array.isArray(results) ? results[0] : null;
      const latitude = first ? Number(first.lat) : NaN;
      const longitude = first ? Number(first.lon) : NaN;

      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        return {
          latitude,
          longitude,
          timezone: Math.round(longitude / 15),
          placeName: first.display_name || placeName,
        };
      }
    }
  } catch (error) {
    console.error("[astrocartography/generate] geocode lookup failed", error);
  }

  return {
    latitude: 28.6139,
    longitude: 77.209,
    timezone: 5.5,
    placeName,
  };
}

function buildBirthData(userProfile: AnyRecord | null, user: AnyRecord | null): Omit<AstrocartographyBirthData, "latitude" | "longitude" | "timezone"> | null {
  const monthRaw = user?.birth_month || userProfile?.birth_month || "";
  const dayRaw = user?.birth_day || userProfile?.birth_day || "";
  const yearRaw = user?.birth_year || userProfile?.birth_year || "";
  const place = String(user?.birth_place || userProfile?.birth_place || "").trim();

  const birthDate = getBirthDateParts({
    birthMonth: monthRaw,
    birthDay: dayRaw,
    birthYear: yearRaw,
  });

  if (!birthDate || !place) {
    return null;
  }

  const knowsBirthTime =
    userProfile?.knows_birth_time !== undefined
      ? !!userProfile.knows_birth_time
      : true;

  const timeValue = knowsBirthTime
    ? getBirthTime24({
        birthHour: user?.birth_hour || userProfile?.birth_hour,
        birthMinute: user?.birth_minute || userProfile?.birth_minute,
        birthPeriod: user?.birth_period || userProfile?.birth_period,
        knowsBirthTime,
      })
    : "12:00";
  if (!timeValue) return null;
  const [hour, minute] = timeValue.split(":").map((value) => Number(value));

  return {
    day: birthDate.day,
    month: birthDate.month,
    year: birthDate.year,
    hour,
    minute,
    place,
  };
}

async function fetchAstrocartographyProvider(birthData: AstrocartographyBirthData): Promise<unknown> {
  const apiKey = process.env.ASTROLOGY_API;
  if (!apiKey) {
    throw new Error("missing_astrology_api_key");
  }

  const response = await fetch("https://json.astrologyapi.com/v1/acg/travel", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-astrologyapi-key": apiKey,
    },
    body: JSON.stringify({
      day: birthData.day,
      month: birthData.month,
      year: birthData.year,
      hour: birthData.hour,
      min: birthData.minute,
      second: 0,
      tzone: birthData.timezone,
      lat: birthData.latitude,
      lon: birthData.longitude,
      include_parans: false,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`provider_failed:${response.status}:${JSON.stringify(body).slice(0, 500)}`);
  }

  return body;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({} as { force?: boolean; userId?: string }));
  const userId = getSessionUserId(request, body?.userId);

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

    if (!user.unlocked_features?.astrocartographyReport) {
      return NextResponse.json({ error: "feature_locked" }, { status: 403 });
    }

    if (!force) {
      const { data: existingComplete } = await supabase
        .from("astrocartography_reports")
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

    const partialBirthData = buildBirthData(userProfile || null, user || null);
    if (!partialBirthData) {
      return NextResponse.json({ error: "missing_birth_details" }, { status: 400 });
    }

    const place = await geocodePlace(partialBirthData.place);
    const birthData: AstrocartographyBirthData = {
      ...partialBirthData,
      place: place.placeName,
      latitude: place.latitude,
      longitude: place.longitude,
      timezone: place.timezone,
    };

    const nowIso = new Date().toISOString();
    await supabase.from("astrocartography_reports").upsert(
      {
        user_id: userId,
        status: "generating",
        birth_data: birthData,
        updated_at: nowIso,
      },
      { onConflict: "user_id" }
    );

    let providerResponse: unknown;
    try {
      providerResponse = await fetchAstrocartographyProvider(birthData);
    } catch (error) {
      console.error("[astrocartography/generate] provider error", error);
      await supabase
        .from("astrocartography_reports")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("user_id", userId);
      return NextResponse.json({ error: "provider_failed" }, { status: 502 });
    }

    if (!hasUsableAstrocartographyLines(providerResponse)) {
      console.error("[astrocartography/generate] provider returned no usable lines");
      await supabase
        .from("astrocartography_reports")
        .update({ status: "failed", provider_response: providerResponse, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
      return NextResponse.json({ error: "no_astrocartography_lines" }, { status: 502 });
    }

    const report = buildAstrocartographyReport(providerResponse, birthData);
    const { data: saved, error: saveError } = await supabase
      .from("astrocartography_reports")
      .upsert(
        {
          user_id: userId,
          status: "complete",
          birth_data: birthData,
          provider: "astrologyapi",
          provider_response: providerResponse,
          report_data: report,
          generated_at: report.generatedAt,
          updated_at: report.generatedAt,
        },
        { onConflict: "user_id" }
      )
      .select("id, generated_at")
      .maybeSingle();

    if (saveError || !saved) {
      console.error("[astrocartography/generate] save error", saveError);
      return NextResponse.json({ error: "save_failed" }, { status: 500 });
    }

    return NextResponse.json({
      id: saved.id,
      status: "complete",
      report,
      birthData,
      generated_at: saved.generated_at || report.generatedAt,
      cached: false,
    });
  } catch (error) {
    console.error("[astrocartography/generate] unexpected", error);
    return NextResponse.json({ error: "generation_failed" }, { status: 500 });
  }
}
