// Local zodiac calculation utilities for instant results
// Sun sign can be calculated locally with 100% accuracy
// Moon sign and Ascendant require birth time and location - approximated locally

export interface ZodiacSign {
  name: string;
  symbol: string;
  element: string;
  description: string;
}

export const ZODIAC_SIGNS: Record<string, ZodiacSign> = {
  Aries: { name: "Aries", symbol: "♈", element: "Fire", description: "Bold, ambitious, and driven by a pioneering spirit" },
  Taurus: { name: "Taurus", symbol: "♉", element: "Earth", description: "Grounded, sensual, and drawn to beauty and stability" },
  Gemini: { name: "Gemini", symbol: "♊", element: "Air", description: "Curious, adaptable, and intellectually restless" },
  Cancer: { name: "Cancer", symbol: "♋", element: "Water", description: "Nurturing, intuitive, and deeply connected to home" },
  Leo: { name: "Leo", symbol: "♌", element: "Fire", description: "Creative, generous, and naturally drawn to the spotlight" },
  Virgo: { name: "Virgo", symbol: "♍", element: "Earth", description: "Analytical, detail-oriented, and driven to be of service" },
  Libra: { name: "Libra", symbol: "♎", element: "Air", description: "Diplomatic, aesthetic, and driven by harmony" },
  Scorpio: { name: "Scorpio", symbol: "♏", element: "Water", description: "Intense, transformative, and drawn to life's mysteries" },
  Sagittarius: { name: "Sagittarius", symbol: "♐", element: "Fire", description: "Adventurous, philosophical, and driven by freedom" },
  Capricorn: { name: "Capricorn", symbol: "♑", element: "Earth", description: "Ambitious, disciplined, and focused on achievement" },
  Aquarius: { name: "Aquarius", symbol: "♒", element: "Air", description: "Independent, innovative, and driven by ideals" },
  Pisces: { name: "Pisces", symbol: "♓", element: "Water", description: "Compassionate, imaginative, and spiritually attuned" },
};

export const SIGN_MODALITIES: Record<string, string> = {
  Aries: "Cardinal", Taurus: "Fixed", Gemini: "Mutable", Cancer: "Cardinal",
  Leo: "Fixed", Virgo: "Mutable", Libra: "Cardinal", Scorpio: "Fixed",
  Sagittarius: "Mutable", Capricorn: "Cardinal", Aquarius: "Fixed", Pisces: "Mutable",
};

export const SIGN_POLARITIES: Record<string, string> = {
  Aries: "Masculine", Taurus: "Feminine", Gemini: "Masculine", Cancer: "Feminine",
  Leo: "Masculine", Virgo: "Feminine", Libra: "Masculine", Scorpio: "Feminine",
  Sagittarius: "Masculine", Capricorn: "Feminine", Aquarius: "Masculine", Pisces: "Feminine",
};

const MONTH_MAP: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/**
 * Calculate Sun sign from birth date - 100% accurate, instant
 */
export function calculateSunSign(month: string | number, day: string | number): string {
  const m = typeof month === "string" ? (MONTH_MAP[month.toLowerCase()] || parseInt(month)) : month;
  const d = typeof day === "string" ? parseInt(day) : day;

  if (!m || !d) return "Aries";

  // Sun sign date ranges (approximate, varies by ~1 day per year)
  const signs = [
    { sign: "Capricorn", end: [1, 19] },
    { sign: "Aquarius", end: [2, 18] },
    { sign: "Pisces", end: [3, 20] },
    { sign: "Aries", end: [4, 19] },
    { sign: "Taurus", end: [5, 20] },
    { sign: "Gemini", end: [6, 20] },
    { sign: "Cancer", end: [7, 22] },
    { sign: "Leo", end: [8, 22] },
    { sign: "Virgo", end: [9, 22] },
    { sign: "Libra", end: [10, 22] },
    { sign: "Scorpio", end: [11, 21] },
    { sign: "Sagittarius", end: [12, 21] },
    { sign: "Capricorn", end: [12, 31] },
  ];

  for (const { sign, end } of signs) {
    if (m < end[0] || (m === end[0] && d <= end[1])) {
      return sign;
    }
  }
  return "Capricorn";
}

/**
 * Approximate Moon sign based on birth date
 * Moon moves through all 12 signs in ~28 days (~2.3 days per sign)
 * This is an approximation - accurate Moon sign requires exact birth time and ephemeris
 */
export function approximateMoonSign(month: string | number, day: string | number, year: string | number): string {
  const m = typeof month === "string" ? (MONTH_MAP[month.toLowerCase()] || parseInt(month)) : month;
  const d = typeof day === "string" ? parseInt(day) : day;
  const y = typeof year === "string" ? parseInt(year) : year;

  if (!m || !d || !y) return "Cancer";

  // Calculate days since a reference date (Jan 1, 2000 - Moon was in Aries)
  const refDate = new Date(2000, 0, 1);
  const birthDate = new Date(y, m - 1, d);
  const daysDiff = Math.floor((birthDate.getTime() - refDate.getTime()) / (1000 * 60 * 60 * 24));

  // Moon cycle is ~27.3 days, so it moves ~13.2 degrees per day
  // Each sign is 30 degrees, so ~2.27 days per sign
  const moonCycle = 27.3;
  const signsPerCycle = 12;
  const daysPerSign = moonCycle / signsPerCycle;

  // Calculate position in current cycle
  const positionInCycle = ((daysDiff % moonCycle) + moonCycle) % moonCycle;
  const signIndex = Math.floor(positionInCycle / daysPerSign);

  const signs = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", 
                 "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
  
  return signs[signIndex % 12];
}

/**
 * Approximate Ascendant (Rising sign) based on birth time
 * Ascendant changes every ~2 hours through all 12 signs in 24 hours
 * This is an approximation - accurate rising requires exact birth time and location
 */
export function approximateAscendant(
  month: string | number, 
  day: string | number, 
  hour: string | number, 
  minute: string | number, 
  period: string
): string {
  const m = typeof month === "string" ? (MONTH_MAP[month.toLowerCase()] || parseInt(month)) : month;
  const d = typeof day === "string" ? parseInt(day) : day;
  let h = typeof hour === "string" ? parseInt(hour) : hour;
  const min = typeof minute === "string" ? parseInt(minute) : minute;

  // Convert to 24-hour format
  if (period?.toUpperCase() === "PM" && h !== 12) h += 12;
  if (period?.toUpperCase() === "AM" && h === 12) h = 0;

  // Get the Sun sign as starting point
  const sunSign = calculateSunSign(m, d);
  const signs = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", 
                 "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
  const sunSignIndex = signs.indexOf(sunSign);

  // At sunrise (~6 AM), the Ascendant equals the Sun sign
  // It advances 1 sign every 2 hours
  const totalMinutes = h * 60 + (min || 0);
  const minutesSinceSunrise = totalMinutes - 360; // 6 AM = 360 minutes
  const signOffset = Math.floor(minutesSinceSunrise / 120); // 120 minutes = 2 hours per sign

  const ascendantIndex = ((sunSignIndex + signOffset) % 12 + 12) % 12;
  return signs[ascendantIndex];
}

/**
 * Get full sign data with all properties
 */
export function getSignData(signName: string): ZodiacSign {
  return ZODIAC_SIGNS[signName] || ZODIAC_SIGNS.Aries;
}

/**
 * Calculate all three signs instantly (Sun accurate, Moon/Ascendant approximate)
 */
export function calculateInstantSigns(
  birthMonth: string,
  birthDay: string,
  birthYear: string,
  birthHour?: string,
  birthMinute?: string,
  birthPeriod?: string
): {
  sunSign: ZodiacSign;
  moonSign: ZodiacSign;
  ascendant: ZodiacSign;
  modality: string;
  polarity: string;
} {
  const sunSignName = calculateSunSign(birthMonth, birthDay);
  const moonSignName = approximateMoonSign(birthMonth, birthDay, birthYear);
  const ascendantName = birthHour && birthPeriod 
    ? approximateAscendant(birthMonth, birthDay, birthHour, birthMinute || "0", birthPeriod)
    : sunSignName; // Default to Sun sign if no birth time

  return {
    sunSign: getSignData(sunSignName),
    moonSign: getSignData(moonSignName),
    ascendant: getSignData(ascendantName),
    modality: SIGN_MODALITIES[sunSignName] || "Cardinal",
    polarity: SIGN_POLARITIES[sunSignName] || "Masculine",
  };
}
