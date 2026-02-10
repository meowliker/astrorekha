import { NextRequest, NextResponse } from "next/server";

// Divine API Configuration
const DIVINE_API_KEY = process.env.DIVINE_API_KEY || "";
const DIVINE_API_URL = "https://divineapi.com/api/1.0";

// Fallback API (free, no auth required)
const FALLBACK_API_BASE = "https://horoscope-app-api.vercel.app/api/v1";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const sign = searchParams.get("sign");
  const period = searchParams.get("period") || "daily"; // daily, weekly, monthly
  const day = searchParams.get("day") || "today"; // today, tomorrow, yesterday

  if (!sign) {
    return NextResponse.json(
      { success: false, error: "Sign is required" },
      { status: 400 }
    );
  }

  const signLower = sign.toLowerCase();

  // Try Divine API first if configured
  if (DIVINE_API_KEY) {
    try {
      const divineData = await fetchFromDivineAPI(signLower, period, day);
      if (divineData) {
        return NextResponse.json({
          success: true,
          data: divineData,
          period,
          sign,
          source: "divine",
        });
      }
    } catch (error) {
      console.error("Divine API error, falling back:", error);
    }
  }

  // Fallback to free API
  try {
    const fallbackData = await fetchFromFallbackAPI(signLower, period, day);
    return NextResponse.json({
      success: true,
      data: fallbackData,
      period,
      sign,
      source: "fallback",
    });
  } catch (error) {
    console.error("Horoscope API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch horoscope data" },
      { status: 500 }
    );
  }
}

// Divine API fetch function
async function fetchFromDivineAPI(sign: string, period: string, day: string) {
  // Calculate date based on day parameter
  const now = new Date();
  let targetDate = now;
  if (day === "tomorrow") {
    targetDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  } else if (day === "yesterday") {
    targetDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }
  const dateStr = targetDate.toISOString().split("T")[0];

  // Divine API uses form-urlencoded format
  const formData = new URLSearchParams();
  formData.append("api_key", DIVINE_API_KEY);
  formData.append("sign", sign);
  formData.append("date", dateStr);

  const response = await fetch(`${DIVINE_API_URL}/get_daily_horoscope.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData.toString(),
  });

  if (!response.ok) {
    throw new Error(`Divine API request failed: ${response.status}`);
  }

  const data = await response.json();
  
  // Check for API error response
  if (data.success === 0) {
    throw new Error(data.message || "Divine API returned error");
  }
  
  // Transform Divine API response to match our expected format
  const prediction = data.data?.prediction || {};
  const luckInfo = prediction.luck || [];
  
  // Extract lucky info from luck array
  let luckyColor = null;
  let luckyNumber = null;
  for (const item of luckInfo) {
    if (typeof item === "string") {
      if (item.includes("Colors of the day")) {
        luckyColor = item.replace(/Colors of the day\s*[:\u2013]\s*/i, "").trim();
      }
      if (item.includes("Lucky Numbers of the day")) {
        luckyNumber = item.replace(/Lucky Numbers of the day\s*[:\u2013]\s*/i, "").trim();
      }
    }
  }
  
  // Combine all prediction text
  const horoscopeText = [
    prediction.personal,
    prediction.health,
    prediction.profession,
    prediction.emotions,
    prediction.travel,
  ].filter(Boolean).join(" ");
  
  return {
    horoscope_data: horoscopeText || "",
    date: dateStr,
    lucky_number: luckyNumber,
    lucky_color: luckyColor,
    mood: null,
    compatibility: null,
    prediction: prediction,
  };
}

// Fallback API fetch function
async function fetchFromFallbackAPI(sign: string, period: string, day: string) {
  let url = "";

  switch (period) {
    case "weekly":
      url = `${FALLBACK_API_BASE}/get-horoscope/weekly?sign=${sign}`;
      break;
    case "monthly":
      url = `${FALLBACK_API_BASE}/get-horoscope/monthly?sign=${sign}`;
      break;
    case "daily":
    default:
      url = `${FALLBACK_API_BASE}/get-horoscope/daily?sign=${sign}&day=${day.toUpperCase()}`;
      break;
  }

  const response = await fetch(url, { method: "GET" });

  if (!response.ok) {
    throw new Error(`Fallback API request failed: ${response.status}`);
  }

  const data = await response.json();
  return data.data;
}
