export const VEDIC_SIGNS_CACHE_VERSION = "vedic_lahiri_big_three_v2";

const SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
] as const;

type SignName = typeof SIGNS[number];

function knownSign(value: unknown): SignName | null {
  return typeof value === "string" && SIGNS.includes(value as SignName)
    ? value as SignName
    : null;
}

export function signFromLongitude(longitude: number): SignName | null {
  if (!Number.isFinite(longitude)) return null;
  const normalized = ((longitude % 360) + 360) % 360;
  return SIGNS[Math.floor(normalized / 30)];
}

export function getVedicSignsFromChart(chart: any): {
  sun: SignName;
  moon: SignName;
  ascendant: SignName;
} | null {
  const sun = knownSign(chart?.planets?.Sun?.sidereal?.sign);
  const moon = knownSign(chart?.planets?.Moon?.sidereal?.sign);
  const ascendantLongitude = Number(chart?.ascendant?.total_longitude);
  const ayanamsa = Number(chart?.birth_data?.ayanamsa_lahiri);
  const ascendant = chart?.ascendant?.total_longitude != null && chart?.birth_data?.ayanamsa_lahiri != null
    ? signFromLongitude(ascendantLongitude - ayanamsa)
    : null;

  return sun && moon && ascendant ? { sun, moon, ascendant } : null;
}
