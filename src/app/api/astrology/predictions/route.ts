import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = "https://json.freeastrologyapi.com";
const API_KEY = process.env.ASTROLOGY_API_KEY || "I6i5bm4qBi5NXUkeoPmDd91CA9nBEIeh5zrPeV8y";

export async function POST(request: NextRequest) {
  try {
    const { birthDate, birthTime, latitude, longitude, timezone } = await request.json();

    const date = new Date(birthDate);
    const [hours, minutes] = (birthTime || "12:00").split(":").map(Number);

    const body = {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      date: date.getDate(),
      hours: hours || 12,
      minutes: minutes || 0,
      seconds: 0,
      latitude: latitude || 28.6139,
      longitude: longitude || 77.209,
      timezone: timezone || 5.5,
      config: {
        observation_point: "topocentric",
        ayanamsha: "lahiri",
      },
    };

    // Fetch Maha Dasas for predictions
    const [mahaDasas, currentDasa] = await Promise.all([
      fetchAPI("/vimsottari/maha-dasas", body),
      fetchAPI("/vimsottari/dasa-information", {
        ...body,
        target_date: new Date().toISOString().split("T")[0],
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        mahaDasas,
        currentDasa,
        birthDetails: {
          date: birthDate,
          time: birthTime,
        },
      },
    });
  } catch (error) {
    console.error("Predictions API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate predictions" },
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
