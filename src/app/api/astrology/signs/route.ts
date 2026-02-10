import { NextRequest, NextResponse } from "next/server";
import { fetchFromAstroEngine } from "@/lib/astro-client";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

const SIGN_SYMBOLS: Record<string, string> = {
  Aries: "♈", Taurus: "♉", Gemini: "♊", Cancer: "♋",
  Leo: "♌", Virgo: "♍", Libra: "♎", Scorpio: "♏",
  Sagittarius: "♐", Capricorn: "♑", Aquarius: "♒", Pisces: "♓",
};

const SIGN_DESCRIPTIONS: Record<string, { sun: string; moon: string; rising: string }> = {
  Aries: { sun: "Bold, ambitious, and driven by a pioneering spirit", moon: "Emotionally impulsive with a need for independence and action", rising: "Comes across as confident, energetic, and direct" },
  Taurus: { sun: "Grounded, sensual, and drawn to beauty and stability", moon: "Emotionally steady with a deep need for security and comfort", rising: "Appears calm, reliable, and naturally elegant" },
  Gemini: { sun: "Curious, adaptable, and intellectually restless", moon: "Emotionally versatile with a need to communicate and connect", rising: "Comes across as witty, sociable, and quick-minded" },
  Cancer: { sun: "Nurturing, intuitive, and deeply connected to home and family", moon: "Emotionally sensitive with powerful instincts and empathy", rising: "Appears warm, approachable, and protective" },
  Leo: { sun: "Creative, generous, and naturally drawn to the spotlight", moon: "Emotionally expressive with a need for recognition and love", rising: "Comes across as radiant, confident, and charismatic" },
  Virgo: { sun: "Analytical, detail-oriented, and driven to be of service", moon: "Emotionally grounded through routine, health, and helping others", rising: "Appears modest, intelligent, and put-together" },
  Libra: { sun: "Diplomatic, aesthetic, and driven by harmony and partnership", moon: "Emotionally balanced with a deep need for fairness and beauty", rising: "Comes across as charming, graceful, and socially aware" },
  Scorpio: { sun: "Intense, transformative, and drawn to life's deeper mysteries", moon: "Emotionally powerful with fierce loyalty and deep intuition", rising: "Appears magnetic, mysterious, and perceptive" },
  Sagittarius: { sun: "Adventurous, philosophical, and driven by freedom and truth", moon: "Emotionally optimistic with a need for exploration and meaning", rising: "Comes across as enthusiastic, open-minded, and jovial" },
  Capricorn: { sun: "Ambitious, disciplined, and focused on long-term achievement", moon: "Emotionally reserved but deeply responsible and loyal", rising: "Appears serious, capable, and naturally authoritative" },
  Aquarius: { sun: "Independent, innovative, and driven by humanitarian ideals", moon: "Emotionally detached but deeply caring about collective well-being", rising: "Comes across as unique, progressive, and intellectually stimulating" },
  Pisces: { sun: "Compassionate, imaginative, and deeply connected to the unseen", moon: "Emotionally absorptive with powerful empathy and artistic sensitivity", rising: "Appears gentle, dreamy, and spiritually attuned" },
};

const SIGN_ELEMENTS: Record<string, string> = {
  Aries: "Fire", Taurus: "Earth", Gemini: "Air", Cancer: "Water",
  Leo: "Fire", Virgo: "Earth", Libra: "Air", Scorpio: "Water",
  Sagittarius: "Fire", Capricorn: "Earth", Aquarius: "Air", Pisces: "Water",
};

const SIGN_MODALITIES: Record<string, string> = {
  Aries: "Cardinal", Taurus: "Fixed", Gemini: "Mutable", Cancer: "Cardinal",
  Leo: "Fixed", Virgo: "Mutable", Libra: "Cardinal", Scorpio: "Fixed",
  Sagittarius: "Mutable", Capricorn: "Cardinal", Aquarius: "Fixed", Pisces: "Mutable",
};

const SIGN_POLARITIES: Record<string, string> = {
  Aries: "Masculine", Taurus: "Feminine", Gemini: "Masculine", Cancer: "Feminine",
  Leo: "Masculine", Virgo: "Feminine", Libra: "Masculine", Scorpio: "Feminine",
  Sagittarius: "Masculine", Capricorn: "Feminine", Aquarius: "Masculine", Pisces: "Feminine",
};

const SIGN_RULERS: Record<string, string> = {
  Aries: "Mars", Taurus: "Venus", Gemini: "Mercury", Cancer: "Moon",
  Leo: "Sun", Virgo: "Mercury", Libra: "Venus", Scorpio: "Pluto",
  Sagittarius: "Jupiter", Capricorn: "Saturn", Aquarius: "Uranus", Pisces: "Neptune",
};

const MONTH_MAP: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

// Generate a cache key from birth data
function generateCacheKey(birthMonth: string, birthDay: string, birthYear: string, birthHour?: string, birthMinute?: string, birthPeriod?: string, birthPlace?: string): string {
  const parts = [birthMonth, birthDay, birthYear, birthHour || "unknown", birthMinute || "00", birthPeriod || "unknown", birthPlace || "unknown"];
  return parts.join("_").toLowerCase().replace(/[^a-z0-9_]/g, "_");
}

// Convert 12-hour AM/PM to 24-hour format
function to24Hour(hour: string, minute: string, period: string): { hour: number; minute: number } {
  let h = parseInt(hour) || 12;
  const m = parseInt(minute) || 0;
  if (period?.toUpperCase() === "PM" && h !== 12) h += 12;
  if (period?.toUpperCase() === "AM" && h === 12) h = 0;
  return { hour: h, minute: m };
}

export async function POST(request: NextRequest) {
  try {
    const { birthMonth, birthDay, birthYear, birthHour, birthMinute, birthPeriod, birthPlace } = await request.json();

    if (!birthMonth || !birthDay || !birthYear) {
      return NextResponse.json(
        { success: false, error: "Birth date is required" },
        { status: 400 }
      );
    }

    // Check cache first
    const cacheKey = generateCacheKey(birthMonth, birthDay, birthYear, birthHour, birthMinute, birthPeriod, birthPlace);
    try {
      const cachedDoc = await getDoc(doc(db, "astrology_signs_cache", cacheKey));
      if (cachedDoc.exists()) {
        return NextResponse.json({
          success: true,
          ...cachedDoc.data(),
        });
      }
    } catch (cacheError) {
      console.error("Cache read error:", cacheError);
    }

    // Convert birth data to astro-engine format
    const monthNum = MONTH_MAP[birthMonth.toLowerCase()] || parseInt(birthMonth) || 1;
    const dayNum = parseInt(birthDay) || 1;
    const yearNum = parseInt(birthYear) || 2000;
    const time = birthHour && birthPeriod
      ? to24Hour(birthHour, birthMinute || "0", birthPeriod)
      : { hour: 12, minute: 0 };

    // Call astro-engine for precise calculation
    const astroResult = await fetchFromAstroEngine("/calculate", {
      year: yearNum,
      month: monthNum,
      day: dayNum,
      hour: time.hour,
      minute: time.minute,
      second: 0,
      place: birthPlace || "New Delhi, India",
    });

    const bigThree = astroResult.chart?.big_three || {};
    const sunSignName = bigThree.sun?.sign || "Aries";
    const moonSignName = bigThree.moon?.sign || "Aries";
    const risingSignName = bigThree.rising?.sign || sunSignName;

    // Format response to match what the frontend expects
    const signs = {
      sunSign: {
        name: sunSignName,
        symbol: SIGN_SYMBOLS[sunSignName] || "♈",
        element: SIGN_ELEMENTS[sunSignName] || "Fire",
        description: SIGN_DESCRIPTIONS[sunSignName]?.sun || "",
      },
      moonSign: {
        name: moonSignName,
        symbol: SIGN_SYMBOLS[moonSignName] || "♈",
        element: SIGN_ELEMENTS[moonSignName] || "Fire",
        description: SIGN_DESCRIPTIONS[moonSignName]?.moon || "",
      },
      ascendant: {
        name: risingSignName,
        symbol: SIGN_SYMBOLS[risingSignName] || "♈",
        element: SIGN_ELEMENTS[risingSignName] || "Fire",
        description: SIGN_DESCRIPTIONS[risingSignName]?.rising || "",
      },
      modality: SIGN_MODALITIES[sunSignName] || "Cardinal",
      polarity: SIGN_POLARITIES[sunSignName] || "Masculine",
      rulingPlanet: SIGN_RULERS[sunSignName] || "Mars",
      cosmicInsight: `Your ${sunSignName} Sun with ${moonSignName} Moon and ${risingSignName} rising creates a unique blend of ${SIGN_ELEMENTS[sunSignName]} drive, ${SIGN_ELEMENTS[moonSignName]} emotional depth, and ${SIGN_ELEMENTS[risingSignName]} outward expression. This combination shapes how you pursue goals, process feelings, and present yourself to the world.`,
    };

    // Cache the signs result
    try {
      await setDoc(doc(db, "astrology_signs_cache", cacheKey), {
        ...signs,
        cachedAt: new Date().toISOString(),
      });
    } catch (cacheWriteError) {
      console.error("Cache write error:", cacheWriteError);
    }

    // Also save the FULL chart data to Firestore for chat/Elysia to use
    try {
      const userId = request.headers.get("x-user-id");
      if (userId) {
        await setDoc(doc(db, "natal_charts", userId), {
          chart: astroResult.chart,
          dasha: astroResult.dasha,
          active_transits: astroResult.active_transits,
          calculatedAt: new Date().toISOString(),
        });
      }
    } catch (chartSaveError) {
      console.error("Failed to save full chart:", chartSaveError);
    }

    return NextResponse.json({
      success: true,
      ...signs,
    });
  } catch (error) {
    console.error("Astrology signs API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to calculate signs. Please try again." },
      { status: 500 }
    );
  }
}
