import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = "https://json.freeastrologyapi.com";
const API_KEY = process.env.ASTROLOGY_API_KEY || "I6i5bm4qBi5NXUkeoPmDd91CA9nBEIeh5zrPeV8y";

export async function POST(request: NextRequest) {
  try {
    const { latitude, longitude, timezone } = await request.json();

    const now = new Date();
    const body = {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      date: now.getDate(),
      hours: now.getHours(),
      minutes: now.getMinutes(),
      seconds: 0,
      latitude: latitude || 28.6139, // Default: Delhi
      longitude: longitude || 77.209,
      timezone: timezone || 5.5,
      config: {
        observation_point: "topocentric",
        ayanamsha: "lahiri",
      },
    };

    // Fetch multiple endpoints in parallel
    const [sunRiseSet, rahuKalam, abhijitMuhurat, nakshatra] = await Promise.all([
      fetchAPI("/sun-rise-set", body),
      fetchAPI("/rahu-kalam", body),
      fetchAPI("/abhijit-muhurat", body),
      fetchAPI("/nakshatra-durations", body),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        sunRiseSet,
        rahuKalam,
        abhijitMuhurat,
        nakshatra,
        date: now.toISOString(),
      },
    });
  } catch (error) {
    console.error("Daily astrology API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch daily astrology data" },
      { status: 500 }
    );
  }
}

async function fetchAPI(endpoint: string, body: any) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    console.error(`API ${endpoint} failed:`, response.status);
    return null;
  }

  return response.json();
}
