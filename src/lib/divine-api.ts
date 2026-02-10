// Divine API Integration
// Documentation: https://developers.divineapi.com/

const DIVINE_API_BASE_URL = "https://divineapi.com/api/1.0";
const DIVINE_HOROSCOPE_URL = "https://divineapi.com/api/1.0";
const DIVINE_API_KEY = process.env.DIVINE_API_KEY || "";

// ============ TYPES ============

export interface DivineAstrologyRequest {
  day: number;
  month: number;
  year: number;
  hour: number;
  min: number;
  lat: number;
  lon: number;
  tzone: number;
}

export interface DivineHoroscopeRequest {
  sign: string;
  day?: string; // "today", "yesterday", "tomorrow" or date format
  lang?: string; // "en", "hi", etc.
}

export interface DivineCompatibilityRequest {
  // Person 1
  p1_day: number;
  p1_month: number;
  p1_year: number;
  p1_hour: number;
  p1_min: number;
  p1_lat: number;
  p1_lon: number;
  p1_tzone: number;
  // Person 2
  p2_day: number;
  p2_month: number;
  p2_year: number;
  p2_hour: number;
  p2_min: number;
  p2_lat: number;
  p2_lon: number;
  p2_tzone: number;
}

// ============ API REQUEST HELPERS ============

async function divineApiRequest<T>(
  baseUrl: string,
  endpoint: string,
  body: any
): Promise<T> {
  if (!DIVINE_API_KEY) {
    throw new Error("Divine API key not configured. Please add DIVINE_API_KEY to your environment variables.");
  }

  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${DIVINE_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Divine API error:", response.status, errorText);
    throw new Error(`Divine API request failed: ${response.status}`);
  }

  return response.json();
}

// Helper to create request body from birth details
export function createDivineBirthData(
  birthDate: Date,
  birthTime: string,
  latitude: number,
  longitude: number,
  timezone: number
): DivineAstrologyRequest {
  const [hours, minutes] = birthTime.split(":").map(Number);

  return {
    day: birthDate.getDate(),
    month: birthDate.getMonth() + 1,
    year: birthDate.getFullYear(),
    hour: hours || 12,
    min: minutes || 0,
    lat: latitude,
    lon: longitude,
    tzone: timezone,
  };
}

// ============ INDIAN/VEDIC ASTROLOGY ============

export async function getPlanetaryPositions(body: DivineAstrologyRequest) {
  return divineApiRequest(
    DIVINE_API_BASE_URL,
    "/indian-api/v1/planetary-positions",
    body
  );
}

export async function getBirthDetails(body: DivineAstrologyRequest) {
  return divineApiRequest(
    DIVINE_API_BASE_URL,
    "/indian-api/v1/birth-details",
    body
  );
}

export async function getAscendant(body: DivineAstrologyRequest) {
  return divineApiRequest(
    DIVINE_API_BASE_URL,
    "/indian-api/v1/ascendant",
    body
  );
}

export async function getMoonSign(body: DivineAstrologyRequest) {
  return divineApiRequest(
    DIVINE_API_BASE_URL,
    "/indian-api/v1/moon-sign",
    body
  );
}

export async function getSunSign(body: DivineAstrologyRequest) {
  return divineApiRequest(
    DIVINE_API_BASE_URL,
    "/indian-api/v1/sun-sign",
    body
  );
}

export async function getNakshatra(body: DivineAstrologyRequest) {
  return divineApiRequest(
    DIVINE_API_BASE_URL,
    "/indian-api/v1/nakshatra",
    body
  );
}

export async function getKundli(body: DivineAstrologyRequest) {
  return divineApiRequest(
    DIVINE_API_BASE_URL,
    "/indian-api/v1/kundli",
    body
  );
}

export async function getDasha(body: DivineAstrologyRequest) {
  return divineApiRequest(
    DIVINE_API_BASE_URL,
    "/indian-api/v1/current-dasha",
    body
  );
}

export async function getMahaDasha(body: DivineAstrologyRequest) {
  return divineApiRequest(
    DIVINE_API_BASE_URL,
    "/indian-api/v1/maha-dasha",
    body
  );
}

export async function getAntarDasha(body: DivineAstrologyRequest & { md: string }) {
  return divineApiRequest(
    DIVINE_API_BASE_URL,
    "/indian-api/v1/antar-dasha",
    body
  );
}

// ============ WESTERN ASTROLOGY ============

export async function getWesternNatalChart(body: DivineAstrologyRequest) {
  return divineApiRequest(
    DIVINE_API_BASE_URL,
    "/western-api/v1/natal-wheel-chart",
    body
  );
}

export async function getWesternPlanets(body: DivineAstrologyRequest) {
  return divineApiRequest(
    DIVINE_API_BASE_URL,
    "/western-api/v1/planets",
    body
  );
}

export async function getWesternHouses(body: DivineAstrologyRequest) {
  return divineApiRequest(
    DIVINE_API_BASE_URL,
    "/western-api/v1/houses",
    body
  );
}

export async function getWesternAspects(body: DivineAstrologyRequest) {
  return divineApiRequest(
    DIVINE_API_BASE_URL,
    "/western-api/v1/aspects",
    body
  );
}

export async function getGeneralSignReport(body: DivineAstrologyRequest, planet: string) {
  return divineApiRequest(
    DIVINE_API_BASE_URL,
    `/western-api/v1/general-sign-report/${planet}`,
    body
  );
}

export async function getGeneralHouseReport(body: DivineAstrologyRequest, planet: string) {
  return divineApiRequest(
    DIVINE_API_BASE_URL,
    `/western-api/v1/general-house-report/${planet}`,
    body
  );
}

// ============ HOROSCOPE ============

export async function getDailyHoroscope(sign: string, day: string = "today", lang: string = "en") {
  const signLower = sign.toLowerCase();
  return divineApiRequest(
    DIVINE_HOROSCOPE_URL,
    "/api/v2/daily-horoscope",
    { sign: signLower, day, lang }
  );
}

export async function getWeeklyHoroscope(sign: string, lang: string = "en") {
  const signLower = sign.toLowerCase();
  return divineApiRequest(
    DIVINE_HOROSCOPE_URL,
    "/api/v2/weekly-horoscope",
    { sign: signLower, lang }
  );
}

export async function getMonthlyHoroscope(sign: string, lang: string = "en") {
  const signLower = sign.toLowerCase();
  return divineApiRequest(
    DIVINE_HOROSCOPE_URL,
    "/api/v2/monthly-horoscope",
    { sign: signLower, lang }
  );
}

export async function getYearlyHoroscope(sign: string, year: number, lang: string = "en") {
  const signLower = sign.toLowerCase();
  return divineApiRequest(
    DIVINE_HOROSCOPE_URL,
    "/api/v2/yearly-horoscope",
    { sign: signLower, year, lang }
  );
}

// ============ COMPATIBILITY / MATCH MAKING ============

export async function getAshtakootMatch(body: DivineCompatibilityRequest) {
  return divineApiRequest(
    DIVINE_API_BASE_URL,
    "/indian-api/v1/ashtakoot-match",
    body
  );
}

export async function getSynastryReport(body: DivineCompatibilityRequest) {
  return divineApiRequest(
    DIVINE_API_BASE_URL,
    "/western-api/v1/synastry",
    body
  );
}

// ============ PANCHANG ============

export async function getPanchang(body: DivineAstrologyRequest) {
  return divineApiRequest(
    DIVINE_API_BASE_URL,
    "/indian-api/v1/panchang",
    body
  );
}

export async function getSunriseSunset(body: DivineAstrologyRequest) {
  return divineApiRequest(
    DIVINE_API_BASE_URL,
    "/indian-api/v1/sunrise-sunset",
    body
  );
}

export async function getRahuKalam(body: DivineAstrologyRequest) {
  return divineApiRequest(
    DIVINE_API_BASE_URL,
    "/indian-api/v1/rahu-kalam",
    body
  );
}

// ============ NUMEROLOGY ============

export async function getNumerology(body: { name: string; day: number; month: number; year: number }) {
  return divineApiRequest(
    DIVINE_API_BASE_URL,
    "/indian-api/v1/numerology",
    body
  );
}

// ============ TAROT ============

export async function getSingleCardReading() {
  return divineApiRequest(
    DIVINE_HOROSCOPE_URL,
    "/api/v2/tarot/single-card",
    {}
  );
}

export async function getThreeCardReading() {
  return divineApiRequest(
    DIVINE_HOROSCOPE_URL,
    "/api/v2/tarot/three-card",
    {}
  );
}

// ============ HELPER FUNCTIONS ============

export function getZodiacSign(month: number, day: number): string {
  const signs = [
    { sign: "Capricorn", start: [12, 22], end: [1, 19] },
    { sign: "Aquarius", start: [1, 20], end: [2, 18] },
    { sign: "Pisces", start: [2, 19], end: [3, 20] },
    { sign: "Aries", start: [3, 21], end: [4, 19] },
    { sign: "Taurus", start: [4, 20], end: [5, 20] },
    { sign: "Gemini", start: [5, 21], end: [6, 20] },
    { sign: "Cancer", start: [6, 21], end: [7, 22] },
    { sign: "Leo", start: [7, 23], end: [8, 22] },
    { sign: "Virgo", start: [8, 23], end: [9, 22] },
    { sign: "Libra", start: [9, 23], end: [10, 22] },
    { sign: "Scorpio", start: [10, 23], end: [11, 21] },
    { sign: "Sagittarius", start: [11, 22], end: [12, 21] },
  ];

  for (const zodiac of signs) {
    const [startMonth, startDay] = zodiac.start;
    const [endMonth, endDay] = zodiac.end;

    if (startMonth === 12 && endMonth === 1) {
      if ((month === 12 && day >= startDay) || (month === 1 && day <= endDay)) {
        return zodiac.sign;
      }
    } else if (
      (month === startMonth && day >= startDay) ||
      (month === endMonth && day <= endDay)
    ) {
      return zodiac.sign;
    }
  }

  return "Aries";
}

export function getZodiacSymbol(sign: string): string {
  const symbols: Record<string, string> = {
    Aries: "♈",
    Taurus: "♉",
    Gemini: "♊",
    Cancer: "♋",
    Leo: "♌",
    Virgo: "♍",
    Libra: "♎",
    Scorpio: "♏",
    Sagittarius: "♐",
    Capricorn: "♑",
    Aquarius: "♒",
    Pisces: "♓",
  };
  return symbols[sign] || "♈";
}

export function getZodiacColor(sign: string): string {
  const colors: Record<string, string> = {
    Aries: "from-red-500 to-orange-500",
    Taurus: "from-green-500 to-emerald-500",
    Gemini: "from-yellow-500 to-amber-500",
    Cancer: "from-blue-300 to-cyan-400",
    Leo: "from-orange-500 to-yellow-500",
    Virgo: "from-green-400 to-teal-500",
    Libra: "from-pink-400 to-rose-500",
    Scorpio: "from-purple-600 to-indigo-600",
    Sagittarius: "from-purple-500 to-pink-500",
    Capricorn: "from-gray-600 to-slate-700",
    Aquarius: "from-cyan-500 to-blue-500",
    Pisces: "from-indigo-400 to-purple-500",
  };
  return colors[sign] || "from-primary to-purple-500";
}
