import { NextRequest, NextResponse } from "next/server";
import { fetchFromAstroEngine } from "@/lib/astro-client";
import { supabase } from "@/lib/supabase";
import { getVedicSignsFromChart, VEDIC_SIGNS_CACHE_VERSION } from "@/lib/vedic-signs";

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
  Leo: "Sun", Virgo: "Mercury", Libra: "Venus", Scorpio: "Mars",
  Sagittarius: "Jupiter", Capricorn: "Saturn", Aquarius: "Saturn", Pisces: "Jupiter",
};

const MONTH_MAP: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

// Generate a cache key from birth data
function generateCacheKey(birthMonth: string, birthDay: string, birthYear: string, birthHour: string, birthMinute: string, birthPeriod: string, birthPlace: string, knowsBirthTime: boolean): string {
  const parts = [VEDIC_SIGNS_CACHE_VERSION, birthMonth, birthDay, birthYear, knowsBirthTime ? birthHour : "unknown", knowsBirthTime ? birthMinute : "unknown", knowsBirthTime ? birthPeriod : "unknown", birthPlace];
  return parts.join("_").toLowerCase().replace(/[^a-z0-9_]/g, "_");
}

// Convert 12-hour AM/PM to 24-hour format
function to24Hour(hour: string, minute: string, period: string): { hour: number; minute: number } {
  let h = Number(hour);
  const m = Number(minute);
  if (period?.toUpperCase() === "PM" && h !== 12) h += 12;
  if (period?.toUpperCase() === "AM" && h === 12) h = 0;
  return { hour: h, minute: m };
}

export async function POST(request: NextRequest) {
  try {
    const { birthMonth, birthDay, birthYear, birthHour, birthMinute, birthPeriod, birthPlace, knowsBirthTime } = await request.json();

    const monthNum = MONTH_MAP[String(birthMonth).toLowerCase()] || Number(birthMonth);
    const dayNum = Number(birthDay);
    const yearNum = Number(birthYear);
    const place = typeof birthPlace === "string" ? birthPlace.trim() : "";
    const date = new Date(Date.UTC(yearNum, monthNum - 1, dayNum));
    const validDate = Number.isInteger(yearNum) && yearNum >= 1000 && yearNum <= new Date().getUTCFullYear() &&
      Number.isInteger(monthNum) && monthNum >= 1 && monthNum <= 12 &&
      Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 31 &&
      date.getUTCFullYear() === yearNum && date.getUTCMonth() === monthNum - 1 && date.getUTCDate() === dayNum;
    if (!validDate || !place) {
      return NextResponse.json(
        { success: false, error: "A valid birth date and birthplace are required." },
        { status: 400 }
      );
    }

    const hasBirthTime = knowsBirthTime !== false && birthHour != null && birthPeriod != null;
    const hour = hasBirthTime ? String(birthHour) : "12";
    const minute = hasBirthTime ? String(birthMinute ?? "0") : "0";
    const period = hasBirthTime ? String(birthPeriod).toUpperCase() : "PM";
    if (hasBirthTime && (!Number.isInteger(Number(hour)) || Number(hour) < 1 || Number(hour) > 12 ||
      !Number.isInteger(Number(minute)) || Number(minute) < 0 || Number(minute) > 59 ||
      !["AM", "PM"].includes(period))) {
      return NextResponse.json({ success: false, error: "Choose a valid birth time." }, { status: 400 });
    }

    // Check cache first
    const cacheKey = generateCacheKey(String(monthNum), String(dayNum), String(yearNum), hour, minute, period, place, hasBirthTime);
    try {
      const { data: cached } = await supabase.from("astrology_signs_cache").select("*").eq("id", cacheKey).single();
      if (cached) {
        return NextResponse.json({
          success: true,
          ...cached.data,
        });
      }
    } catch (cacheError) {
      console.error("Cache read error:", cacheError);
    }

    // Convert birth data to astro-engine format
    const time = hasBirthTime
      ? to24Hour(hour, minute, period)
      : { hour: 12, minute: 0 };

    // Call astro-engine for precise calculation
    const astroResult = await fetchFromAstroEngine("/calculate", {
      year: yearNum,
      month: monthNum,
      day: dayNum,
      hour: time.hour,
      minute: time.minute,
      second: 0,
      place,
    }, 15000);

    const vedicSigns = getVedicSignsFromChart(astroResult.chart);
    if (!vedicSigns) {
      return NextResponse.json({ success: false, error: "The birth chart did not include complete Vedic sign data. Please try again." }, { status: 502 });
    }
    const sunSignName = vedicSigns.sun;
    const moonSignName = vedicSigns.moon;
    const risingSignName = vedicSigns.ascendant;

    // Format response to match what the frontend expects
    const signs = {
      sunSign: {
        name: sunSignName,
        symbol: SIGN_SYMBOLS[sunSignName] || "♈",
        element: SIGN_ELEMENTS[sunSignName] || "Fire",
        description: SIGN_DESCRIPTIONS[sunSignName]?.sun || "",
      },
      moonSign: hasBirthTime ? {
        name: moonSignName,
        symbol: SIGN_SYMBOLS[moonSignName] || "♈",
        element: SIGN_ELEMENTS[moonSignName] || "Fire",
        description: SIGN_DESCRIPTIONS[moonSignName]?.moon || "",
      } : null,
      ascendant: hasBirthTime ? {
        name: risingSignName,
        symbol: SIGN_SYMBOLS[risingSignName] || "♈",
        element: SIGN_ELEMENTS[risingSignName] || "Fire",
        description: SIGN_DESCRIPTIONS[risingSignName]?.rising || "",
      } : null,
      modality: SIGN_MODALITIES[sunSignName] || "Cardinal",
      polarity: SIGN_POLARITIES[sunSignName] || "Masculine",
      rulingPlanet: SIGN_RULERS[sunSignName] || "Mars",
      cosmicInsight: hasBirthTime
        ? `Your ${sunSignName} Sun with ${moonSignName} Moon and ${risingSignName} rising creates a unique blend of ${SIGN_ELEMENTS[sunSignName]} drive, ${SIGN_ELEMENTS[moonSignName]} emotional depth, and ${SIGN_ELEMENTS[risingSignName]} outward expression. This combination shapes how you pursue goals, process feelings, and present yourself to the world.`
        : `Your Vedic Sun sign is ${sunSignName}. Add your birth time to calculate your Moon sign and ascendant reliably.`,
    };

    // Cache the signs result
    try {
      await supabase.from("astrology_signs_cache").upsert({
        id: cacheKey,
        data: signs,
        cached_at: new Date().toISOString(),
      }, { onConflict: "id" });
    } catch (cacheWriteError) {
      console.error("Cache write error:", cacheWriteError);
    }

    // Also save the FULL chart data to Firestore for chat/Elysia to use
    try {
      const userId = request.headers.get("x-user-id");
      if (userId) {
        await supabase.from("natal_charts").upsert({
          id: userId,
          chart: astroResult.chart,
          dasha: astroResult.dasha,
          active_transits: astroResult.active_transits,
          calculated_at: new Date().toISOString(),
        }, { onConflict: "id" });
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
