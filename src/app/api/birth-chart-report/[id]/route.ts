import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getBirthDateIso, getBirthTime24 } from "@/lib/birth-details";

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
type PlanetaryColumnKey = "sign" | "house" | "nakshatra" | "pada";

const ZODIAC_SIGNS = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces",
];

const PLANET_ORDER = [
  "Ascendant",
  "Sun",
  "Moon",
  "Mars",
  "Mercury",
  "Jupiter",
  "Venus",
  "Saturn",
  "Rahu",
  "Ketu",
];

const SIGN_LORD_BY_NAME: Record<string, string> = {
  aries: "Mars",
  mesha: "Mars",
  taurus: "Venus",
  vrishabha: "Venus",
  gemini: "Mercury",
  mithuna: "Mercury",
  cancer: "Moon",
  karka: "Moon",
  leo: "Sun",
  simha: "Sun",
  virgo: "Mercury",
  kanya: "Mercury",
  libra: "Venus",
  tula: "Venus",
  scorpio: "Mars",
  vrischika: "Mars",
  sagittarius: "Jupiter",
  dhanu: "Jupiter",
  capricorn: "Saturn",
  makara: "Saturn",
  aquarius: "Saturn",
  kumbha: "Saturn",
  pisces: "Jupiter",
  meena: "Jupiter",
};

function canonicalizePlanetName(value: string): string | null {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

  const aliases: Record<string, string> = {
    asc: "Ascendant",
    ascendant: "Ascendant",
    sun: "Sun",
    moon: "Moon",
    mars: "Mars",
    mercury: "Mercury",
    merc: "Mercury",
    jupiter: "Jupiter",
    jup: "Jupiter",
    venus: "Venus",
    saturn: "Saturn",
    sat: "Saturn",
    rahu: "Rahu",
    ketu: "Ketu",
  };

  return aliases[normalized] || null;
}

function getSignLord(value: string): string {
  const key = String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w]/g, "");
  return SIGN_LORD_BY_NAME[key] || "—";
}

function hasAscendantPlanetSource(data: Record<string, any> | null | undefined): boolean {
  if (!data) return false;
  return (
    Array.isArray(data?.planet_positions) &&
    data.planet_positions.some((p: any) => canonicalizePlanetName(safeText(p?.name)) === "Ascendant")
  );
}

function hasPanchangSource(data: Record<string, any> | null | undefined): boolean {
  return !!data?.panchang && typeof data.panchang === "object";
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

function getBirthDateFromProfile(userProfile: Record<string, any> | null, user: Record<string, any> | null): string | null {
  const monthRaw = userProfile?.birth_month || user?.birth_month || "";
  const dayRaw = userProfile?.birth_day || user?.birth_day || "";
  const yearRaw = userProfile?.birth_year || user?.birth_year || "";
  if (!monthRaw || !dayRaw || !yearRaw) return null;

  return getBirthDateIso({
    birthMonth: monthRaw,
    birthDay: dayRaw,
    birthYear: yearRaw,
  });
}

function getBirthTimeFromProfile(userProfile: Record<string, any> | null, user: Record<string, any> | null): string | null {
  const knowsBirthTime =
    userProfile?.knows_birth_time !== undefined
      ? !!userProfile.knows_birth_time
      : true;

  if (!knowsBirthTime) return "12:00";

  return getBirthTime24({
    birthHour: userProfile?.birth_hour || user?.birth_hour,
    birthMinute: userProfile?.birth_minute || user?.birth_minute,
    birthPeriod: userProfile?.birth_period || user?.birth_period,
    knowsBirthTime,
  });
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
  if (!birthTime) return null;
  const birthPlace = String(userProfile?.birth_place || user?.birth_place || "").trim();
  if (!birthPlace) return null;

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

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .split(" ")
    .map((part) => (part ? `${part[0].toUpperCase()}${part.slice(1)}` : part))
    .join(" ");
}

function normalizePlanetAndSign(planetRaw: string, signRaw: string): { planet: string; sign: string } {
  let planet = String(planetRaw || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  const incomingSign = String(signRaw || "").trim();
  let sign = incomingSign || "—";

  // If sign is already known, still strip it from a packed planet token like
  // "AscendantCancer" so columns remain visually clean and separated.
  if (sign !== "—") {
    const compactSign = sign.replace(/\s+/g, "");
    const lowerPlanet = planet.toLowerCase();
    const lowerSign = sign.toLowerCase();
    const lowerCompact = compactSign.toLowerCase();

    if (lowerPlanet.endsWith(` ${lowerSign}`)) {
      planet = planet.slice(0, planet.length - sign.length).trim();
    } else if (lowerPlanet.endsWith(lowerCompact) && lowerPlanet.length > lowerCompact.length) {
      planet = planet.slice(0, planet.length - compactSign.length).trim();
    }

    if (!planet) planet = "Ascendant";
    return { planet, sign };
  }

  for (const zodiac of ZODIAC_SIGNS) {
    const compact = zodiac.replace(/\s+/g, "");
    const lowerPlanet = planet.toLowerCase();

    if (lowerPlanet.endsWith(` ${zodiac.toLowerCase()}`)) {
      return {
        planet: planet.slice(0, planet.length - zodiac.length).trim(),
        sign: zodiac,
      };
    }

    if (lowerPlanet.endsWith(compact.toLowerCase()) && lowerPlanet.length > compact.length) {
      const withoutSign = planet.slice(0, planet.length - compact.length).trim();
      if (withoutSign.length > 0) {
        return {
          planet: withoutSign,
          sign: zodiac,
        };
      }
    }
  }

  return { planet, sign };
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

function formatNumber(value: unknown, fractionDigits = 6): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return num.toFixed(fractionDigits).replace(/\.?0+$/, "");
}

function timezoneToOffset(timezone: unknown): string {
  const tz = Number(timezone);
  if (!Number.isFinite(tz)) return "+05:30";
  const sign = tz >= 0 ? "+" : "-";
  const abs = Math.abs(tz);
  const hours = Math.floor(abs);
  const minutes = Math.round((abs - hours) * 60);
  return `${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function getBirthDateTime(birthData: Record<string, any>): Date | null {
  const date = safeText(birthData?.birthDetails?.date);
  const time = safeText(birthData?.birthDetails?.time);
  const tz = timezoneToOffset(birthData?.birthDetails?.timezone);
  if (date === "—" || time === "—") return null;
  const iso = `${date}T${String(time).padStart(5, "0")}:00${tz}`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pickByBirthTime<T extends { start?: string; end?: string }>(
  items: T[] | undefined,
  birthAt: Date | null
): T | null {
  if (!Array.isArray(items) || items.length === 0) return null;
  if (!birthAt) return items[0];

  const birthTs = birthAt.getTime();
  for (const item of items) {
    const startTs = Date.parse(String(item?.start || ""));
    const endTs = Date.parse(String(item?.end || ""));
    if (!Number.isNaN(startTs) && !Number.isNaN(endTs) && birthTs >= startTs && birthTs <= endTs) {
      return item;
    }
  }

  return items[0];
}

function toReadableDateTime(value: unknown): string {
  const text = safeText(value);
  if (text === "—") return "—";
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function toReadableTime(value: unknown): string {
  const text = safeText(value);
  if (text === "—") return "—";
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function filterAvailableRows(rows: KeyValue[]): KeyValue[] {
  return rows.filter((row) => safeText(row.value) !== "—");
}

function getAvailablePlanetaryColumns(rows: PlanetRow[]): PlanetaryColumnKey[] {
  const columns: PlanetaryColumnKey[] = ["sign", "house", "nakshatra", "pada"];
  return columns.filter((column) => rows.some((row) => safeText(row[column]) !== "—"));
}

function buildPlanetaryRows(birthData: Record<string, any>, natalChart: Record<string, any> | null): PlanetRow[] {
  const rows: PlanetRow[] = [];

  const natalPlanets = natalChart?.chart?.planets;
  if (natalPlanets && typeof natalPlanets === "object") {
    for (const [planet, raw] of Object.entries(natalPlanets as Record<string, any>)) {
      const data = raw || {};
      const signValue = safeText(data?.tropical?.sign || data?.sign || data?.rasi);
      const normalized = normalizePlanetAndSign(planet, signValue);
      const canonicalPlanet = canonicalizePlanetName(normalized.planet);
      if (!canonicalPlanet) continue;
      rows.push({
        planet: canonicalPlanet,
        sign: normalized.sign,
        house: safeText(data?.house_western || data?.house),
        nakshatra: safeText(data?.nakshatra || data?.vedic?.nakshatra),
        pada: safeText(data?.pada || data?.vedic?.pada),
      });
    }
  }

  if (rows.length === 0) {
    const prokeralaPlanetPositions = birthData?.planet_positions;
    if (Array.isArray(prokeralaPlanetPositions)) {
      for (const raw of prokeralaPlanetPositions as Array<Record<string, any>>) {
        const canonicalPlanet = canonicalizePlanetName(raw?.name || "");
        if (!canonicalPlanet) continue;
        rows.push({
          planet: canonicalPlanet,
          sign: safeText(raw?.rasi?.name),
          house: safeText(raw?.position),
          nakshatra: safeText(raw?.nakshatra?.name),
          pada: safeText(raw?.nakshatra?.pada),
        });
      }
    }
  }

  if (rows.length === 0) {
    const fallbackPlanets = birthData?.planets;
    if (fallbackPlanets && typeof fallbackPlanets === "object") {
      for (const [planet, raw] of Object.entries(fallbackPlanets as Record<string, any>)) {
        const data = raw || {};
        const signValue = safeText(data?.zodiac_sign || data?.sign);
        const normalized = normalizePlanetAndSign(planet, signValue);
        const canonicalPlanet = canonicalizePlanetName(normalized.planet);
        if (!canonicalPlanet) continue;
        rows.push({
          planet: canonicalPlanet,
          sign: normalized.sign,
          house: safeText(data?.house),
          nakshatra: safeText(data?.name || data?.nakshatra),
          pada: safeText(data?.pada),
        });
      }
    }
  }

  rows.sort((a, b) => {
    const ai = PLANET_ORDER.indexOf(a.planet);
    const bi = PLANET_ORDER.indexOf(b.planet);
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

  if (
    !birthChartData ||
    Object.keys(birthChartData).length === 0 ||
    !hasAscendantPlanetSource(birthChartData) ||
    !hasPanchangSource(birthChartData)
  ) {
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

  if (
    (
      !birthChartData ||
      Object.keys(birthChartData).length === 0 ||
      !hasAscendantPlanetSource(birthChartData) ||
      !hasPanchangSource(birthChartData)
    ) &&
    (userProfile || user)
  ) {
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
  const panchang = birthChartData?.panchang || {};
  const nakshatraDetails = kundli?.nakshatra_details || {};
  const currentDasha = natalChart?.dasha?.current_period;
  const birthAt = getBirthDateTime(birthChartData);
  const activeTithi = pickByBirthTime<Record<string, any>>(
    Array.isArray(panchang?.tithi) ? panchang.tithi : undefined,
    birthAt
  );
  const activeKaran = pickByBirthTime<Record<string, any>>(
    Array.isArray(panchang?.karana) ? panchang.karana : undefined,
    birthAt
  );
  const activeYoga = pickByBirthTime<Record<string, any>>(
    Array.isArray(panchang?.yoga) ? panchang.yoga : undefined,
    birthAt
  );
  const activeNakshatra = pickByBirthTime<Record<string, any>>(
    Array.isArray(panchang?.nakshatra) ? panchang.nakshatra : undefined,
    birthAt
  );
  const prokeralaPlanetPositions = Array.isArray(birthChartData?.planet_positions)
    ? (birthChartData.planet_positions as Array<Record<string, any>>)
    : [];
  const ascendantFromPlanetPosition = prokeralaPlanetPositions.find(
    (p) => canonicalizePlanetName(safeText(p?.name)) === "Ascendant"
  );

  const lagnaValue = safeText(
    ascendantFromPlanetPosition?.rasi?.name ||
      birthChartData?.planets?.Ascendant?.zodiac_sign ||
      natalChart?.chart?.ascendant?.sidereal?.sign ||
      natalChart?.chart?.ascendant?.sign ||
      nakshatraDetails?.zodiac?.name
  );
  const lagnaLordValue = safeText(
    ascendantFromPlanetPosition?.rasi?.lord?.name ||
      birthChartData?.planets?.Ascendant?.lord ||
      getSignLord(lagnaValue)
  );

  const basicDetails = [
    { label: "Name", value: safeText(user?.name || userProfile?.name) },
    { label: "Sex", value: toTitleCase(safeText(userProfile?.gender || user?.gender)) },
    { label: "Date of Birth", value: formatBirthDate(userProfile as Record<string, any> | null) },
    { label: "Time of Birth", value: formatBirthTime(userProfile as Record<string, any> | null, birthChartData) },
    { label: "Day of Birth", value: safeText(panchang?.vaara) },
    { label: "Place of Birth", value: safeText(userProfile?.birth_place || birthChartData?.birthDetails?.place) },
    { label: "Timezone", value: safeText(user?.timezone || birthChartData?.birthDetails?.timezone) },
    { label: "Latitude", value: formatNumber(birthChartData?.birthDetails?.latitude) },
    { label: "Longitude", value: formatNumber(birthChartData?.birthDetails?.longitude) },
    { label: "Julian Day", value: safeText(natalChart?.chart?.birth_data?.julian_day) },
    { label: "Ayanamsa (Lahiri)", value: safeText(natalChart?.chart?.birth_data?.ayanamsa_lahiri) },
    {
      label: "Bal Dasa",
      value: safeText(natalChart?.dasha?.balance_at_birth),
    },
  ];

  const astroDetails = [
    { label: "Lagna", value: lagnaValue },
    { label: "Lagna Lord", value: lagnaLordValue },
    { label: "Rasi", value: safeText(nakshatraDetails?.chandra_rasi?.name) },
    { label: "Rasi Lord", value: safeText(nakshatraDetails?.chandra_rasi?.lord?.name) },
    {
      label: "Nakshatra-Pada",
      value: (() => {
        const nakshatraName = safeText(nakshatraDetails?.nakshatra?.name);
        const nakshatraPada = safeText(nakshatraDetails?.nakshatra?.pada);
        if (nakshatraName === "—") return "—";
        if (nakshatraPada === "—") return nakshatraName;
        return `${nakshatraName} ${nakshatraPada}`;
      })(),
    },
    { label: "Nakshatra Lord", value: safeText(nakshatraDetails?.nakshatra?.lord?.name) },
    { label: "Sun Sign (Indian)", value: safeText(nakshatraDetails?.soorya_rasi?.name) },
    { label: "Moon Sign", value: safeText(nakshatraDetails?.chandra_rasi?.name) },
    { label: "Tithi", value: safeText(activeTithi?.name) },
    { label: "Paksha", value: safeText(activeTithi?.paksha) },
    { label: "Yoga", value: safeText(activeYoga?.name) },
    { label: "Karan", value: safeText(activeKaran?.name) },
    { label: "Sunrise", value: toReadableTime(panchang?.sunrise) },
    { label: "Sunset", value: toReadableTime(panchang?.sunset) },
    { label: "Moonrise", value: toReadableTime(panchang?.moonrise) },
    { label: "Moonset", value: toReadableTime(panchang?.moonset) },
    { label: "Birth Nakshatra (Panchang)", value: safeText(activeNakshatra?.name) },
    { label: "Birth Nakshatra Start", value: toReadableDateTime(activeNakshatra?.start) },
    { label: "Birth Nakshatra End", value: toReadableDateTime(activeNakshatra?.end) },
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
  const planetaryColumns = getAvailablePlanetaryColumns(planetaryPositions);
  const chartSvgs = {
    lagna_chart_svg: safeText(birthChartData?.chart?.output) !== "—" ? birthChartData?.chart?.output : null,
    navamsa_chart_svg: safeText(birthChartData?.navamsaChart?.output) !== "—" ? birthChartData?.navamsaChart?.output : null,
  };

  return NextResponse.json({
    ...report,
    chart_details: {
      basic_details: filterAvailableRows(basicDetails),
      astro_details: filterAvailableRows(astroDetails),
      planetary_positions: planetaryPositions,
      planetary_columns: planetaryColumns,
      ...chartSvgs,
    },
  });
}
