import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Two different APIs for different content
const OHMANDA_API_URL = "https://ohmanda.com/api/horoscope";
const NEWASTRO_API_URL = "https://newastro.vercel.app";
const FREE_HOROSCOPE_API_URL = "https://freehoroscopeapi.com/api/v1/get-horoscope/daily";

const ZODIAC_SIGNS = [
  "aries", "taurus", "gemini", "cancer", "leo", "virgo",
  "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"
];

// Get today's date in YYYY-MM-DD format
function getTodayDate(): string {
  const now = new Date();
  return now.toISOString().split("T")[0];
}

// Get tomorrow's date in YYYY-MM-DD format  
function getTomorrowDate(): string {
  const now = new Date();
  now.setDate(now.getDate() + 1);
  return now.toISOString().split("T")[0];
}

// Fetch TODAY's horoscope from ohmanda.com
async function fetchTodayHoroscope(sign: string): Promise<string> {
  try {
    const response = await fetch(`${OHMANDA_API_URL}/${sign.toLowerCase()}/`, {
      method: "GET",
      headers: { "Accept": "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Ohmanda API request failed: ${response.status}`);
    }

    const data = await response.json();
    const horoscope = typeof data.horoscope === "string" ? data.horoscope.trim() : "";
    if (horoscope) return horoscope;
  } catch (error) {
    console.warn("Primary horoscope provider failed:", error);
  }

  const fallbackResponse = await fetch(`${FREE_HOROSCOPE_API_URL}?sign=${encodeURIComponent(sign)}&day=TODAY`, {
    method: "GET",
    headers: { "Accept": "application/json" },
  });

  if (!fallbackResponse.ok) {
    throw new Error(`Fallback horoscope API request failed: ${fallbackResponse.status}`);
  }

  const fallbackData = await fallbackResponse.json();
  return fallbackData.data?.horoscope || "";
}

// Fetch TOMORROW's horoscope from newastro.vercel.app (different source for different content)
async function fetchTomorrowHoroscope(sign: string): Promise<string> {
  const response = await fetch(`${NEWASTRO_API_URL}/${sign.toLowerCase()}`, {
    method: "GET",
    headers: { "Accept": "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Newastro API request failed: ${response.status}`);
  }

  const data = await response.json();
  return data.horoscope || "";
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const sign = searchParams.get("sign")?.toLowerCase();
  const day = searchParams.get("day") || "today"; // today or tomorrow

  if (!sign || !ZODIAC_SIGNS.includes(sign)) {
    return NextResponse.json(
      { success: false, error: "Valid sign is required" },
      { status: 400 }
    );
  }

  try {
    const targetDate = day === "tomorrow" ? getTomorrowDate() : getTodayDate();
    const cacheId = `horoscope_${sign}_${targetDate}`;

    // Check if horoscope is already cached for this sign+date
    const { data: cached } = await supabase
      .from("horoscope_cache")
      .select("horoscope")
      .eq("id", cacheId)
      .single();

    if (cached?.horoscope?.horoscope_data) {
      return NextResponse.json({
        success: true,
        horoscope: cached.horoscope.horoscope_data,
        sign,
        date: targetDate,
        cached: true,
      });
    }

    // Not cached - fetch from external API (different source for today vs tomorrow)
    const horoscopeText = day === "tomorrow" 
      ? await fetchTomorrowHoroscope(sign)
      : await fetchTodayHoroscope(sign);

    // Save to cache (non-blocking)
    (async () => {
      try {
        await supabase.from("horoscope_cache").upsert({
          id: cacheId,
          horoscope: { horoscope_data: horoscopeText },
          sign,
          period: "daily",
          cache_key: targetDate,
          fetched_at: new Date().toISOString(),
        }, { onConflict: "id" });
      } catch (e) { /* ignore cache errors */ }
    })();

    return NextResponse.json({
      success: true,
      horoscope: horoscopeText,
      sign,
      date: targetDate,
      cached: false,
    });
  } catch (error) {
    console.error("Horoscope API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch horoscope" },
      { status: 500 }
    );
  }
}
