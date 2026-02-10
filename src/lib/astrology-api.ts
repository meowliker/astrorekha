const API_BASE_URL = "https://json.freeastrologyapi.com";
const API_KEY = process.env.ASTROLOGY_API_KEY || "I6i5bm4qBi5NXUkeoPmDd91CA9nBEIeh5zrPeV8y";

interface AstrologyRequestBody {
  year: number;
  month: number;
  date: number;
  hours: number;
  minutes: number;
  seconds: number;
  latitude: number;
  longitude: number;
  timezone: number;
  config?: {
    observation_point?: string;
    ayanamsha?: string;
  };
}

interface MatchMakingRequest {
  p1_year: number;
  p1_month: number;
  p1_date: number;
  p1_hours: number;
  p1_minutes: number;
  p1_seconds: number;
  p1_latitude: number;
  p1_longitude: number;
  p1_timezone: number;
  p2_year: number;
  p2_month: number;
  p2_date: number;
  p2_hours: number;
  p2_minutes: number;
  p2_seconds: number;
  p2_latitude: number;
  p2_longitude: number;
  p2_timezone: number;
}

async function apiRequest<T>(endpoint: string, body: any): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json();
}

// Helper to create request body from birth details
export function createBirthDataBody(
  birthDate: Date,
  birthTime: string,
  latitude: number,
  longitude: number,
  timezone: number
): AstrologyRequestBody {
  const [hours, minutes] = birthTime.split(":").map(Number);
  
  return {
    year: birthDate.getFullYear(),
    month: birthDate.getMonth() + 1,
    date: birthDate.getDate(),
    hours: hours || 12,
    minutes: minutes || 0,
    seconds: 0,
    latitude,
    longitude,
    timezone,
    config: {
      observation_point: "topocentric",
      ayanamsha: "lahiri",
    },
  };
}

// ============ PLANETS & CHARTS ============

export async function getPlanets(body: AstrologyRequestBody) {
  return apiRequest("/planets", body);
}

export async function getPlanetsExtended(body: AstrologyRequestBody) {
  return apiRequest("/planets/extended", body);
}

export async function getHoroscopeChartSVG(body: AstrologyRequestBody) {
  return apiRequest<{ output: string }>("/horoscope-chart-svg-code", body);
}

export async function getNavamsaChartSVG(body: AstrologyRequestBody) {
  return apiRequest<{ output: string }>("/navamsa-chart-svg-code", body);
}

// ============ WESTERN ASTROLOGY ============

export async function getWesternPlanets(body: AstrologyRequestBody) {
  return apiRequest("/western-horoscope/planets", body);
}

export async function getWesternHouses(body: AstrologyRequestBody) {
  return apiRequest("/western-horoscope/houses", body);
}

export async function getWesternAspects(body: AstrologyRequestBody) {
  return apiRequest("/western-horoscope/aspects", body);
}

export async function getNatalWheelChart(body: AstrologyRequestBody) {
  return apiRequest<{ output: string }>("/western-horoscope/natal-wheel-chart", body);
}

// ============ PANCHANG (Daily Info) ============

export async function getSunRiseSet(body: AstrologyRequestBody) {
  return apiRequest<{
    sunrise: string;
    sunset: string;
  }>("/sun-rise-set", body);
}

export async function getTithiTimings(body: AstrologyRequestBody) {
  return apiRequest("/tithi-durations", body);
}

export async function getNakshatraDurations(body: AstrologyRequestBody) {
  return apiRequest("/nakshatra-durations", body);
}

export async function getGoodBadTimes(body: AstrologyRequestBody) {
  return apiRequest("/good-bad-times", body);
}

export async function getRahuKalam(body: AstrologyRequestBody) {
  return apiRequest<{
    start: string;
    end: string;
  }>("/rahu-kalam", body);
}

export async function getAbhijitMuhurat(body: AstrologyRequestBody) {
  return apiRequest<{
    start: string;
    end: string;
  }>("/abhijit-muhurat", body);
}

export async function getBrahmaMuhurat(body: AstrologyRequestBody) {
  return apiRequest<{
    start: string;
    end: string;
  }>("/brahma-muhurat", body);
}

export async function getAmritKaal(body: AstrologyRequestBody) {
  return apiRequest<{
    start: string;
    end: string;
  }>("/amrit-kaal", body);
}

// ============ MATCH MAKING ============

export async function getAshtakootScore(body: MatchMakingRequest) {
  return apiRequest<{
    total_score: number;
    max_score: number;
    varna: { score: number; max: number };
    vashya: { score: number; max: number };
    tara: { score: number; max: number };
    yoni: { score: number; max: number };
    graha_maitri: { score: number; max: number };
    gana: { score: number; max: number };
    bhakoot: { score: number; max: number };
    nadi: { score: number; max: number };
  }>("/ashtakoot-score", body);
}

// ============ DASA PREDICTIONS ============

export async function getMahaDasas(body: AstrologyRequestBody) {
  return apiRequest("/vimsottari/maha-dasas", body);
}

export async function getMahaDasasAndAntarDasas(body: AstrologyRequestBody) {
  return apiRequest("/vimsottari/maha-dasas-and-antar-dasas", body);
}

export async function getDasaInfoForDate(body: AstrologyRequestBody & { target_date: string }) {
  return apiRequest("/vimsottari/dasa-information", body);
}

// ============ GEO LOCATION ============

export async function getGeoLocation(placeName: string) {
  return apiRequest<{
    latitude: number;
    longitude: number;
    timezone: number;
    place_name: string;
  }>("/geo-details", { place_name: placeName });
}

// ============ HELPER FUNCTIONS ============

export function getZodiacSign(month: number, day: number): string {
  const signs = [
    { sign: "Capricorn", symbol: "♑", start: [12, 22], end: [1, 19] },
    { sign: "Aquarius", symbol: "♒", start: [1, 20], end: [2, 18] },
    { sign: "Pisces", symbol: "♓", start: [2, 19], end: [3, 20] },
    { sign: "Aries", symbol: "♈", start: [3, 21], end: [4, 19] },
    { sign: "Taurus", symbol: "♉", start: [4, 20], end: [5, 20] },
    { sign: "Gemini", symbol: "♊", start: [5, 21], end: [6, 20] },
    { sign: "Cancer", symbol: "♋", start: [6, 21], end: [7, 22] },
    { sign: "Leo", symbol: "♌", start: [7, 23], end: [8, 22] },
    { sign: "Virgo", symbol: "♍", start: [8, 23], end: [9, 22] },
    { sign: "Libra", symbol: "♎", start: [9, 23], end: [10, 22] },
    { sign: "Scorpio", symbol: "♏", start: [10, 23], end: [11, 21] },
    { sign: "Sagittarius", symbol: "♐", start: [11, 22], end: [12, 21] },
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
