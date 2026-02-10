import { NextRequest, NextResponse } from "next/server";

// Prokerala API Configuration
const PROKERALA_BASE_URL = "https://api.prokerala.com/v2";
const PROKERALA_CLIENT_ID = process.env.PROKERALA_CLIENT_ID;
const PROKERALA_CLIENT_SECRET = process.env.PROKERALA_CLIENT_SECRET;

// Cache for Prokerala access token
let cachedToken: { token: string; expiresAt: number } | null = null;

// Get OAuth2 access token from Prokerala
async function getProkeralaAccessToken(): Promise<string> {
  // Return cached token if still valid
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  const response = await fetch("https://api.prokerala.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: PROKERALA_CLIENT_ID!,
      client_secret: PROKERALA_CLIENT_SECRET!,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get Prokerala token: ${response.status}`);
  }

  const data = await response.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000, // Expire 1 min early
  };

  return data.access_token;
}

// Fetch from Prokerala API
async function fetchProkeralaAPI(endpoint: string, params: Record<string, string>, token: string) {
  const url = `${PROKERALA_BASE_URL}${endpoint}?${new URLSearchParams(params)}`;
  
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    console.error(`Prokerala API ${endpoint} failed:`, response.status);
    return null;
  }

  // Check if response is SVG (for chart endpoints)
  const contentType = response.headers.get("content-type");
  if (contentType?.includes("image/svg") || endpoint.includes("chart")) {
    return { output: await response.text() };
  }

  return response.json();
}

export async function POST(request: NextRequest) {
  try {
    const { birthDate, birthTime, latitude, longitude, timezone, chartType } = await request.json();

    // Check if Prokerala credentials are configured
    if (!PROKERALA_CLIENT_ID || !PROKERALA_CLIENT_SECRET) {
      return NextResponse.json({
        success: false,
        error: "Prokerala API credentials not configured. Please add PROKERALA_CLIENT_ID and PROKERALA_CLIENT_SECRET to .env.local",
      }, { status: 500 });
    }

    const date = new Date(birthDate);
    const [hours, minutes] = (birthTime || "12:00").split(":").map(Number);

    // Format datetime for Prokerala API (ISO 8601 format)
    const datetime = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(hours || 12).padStart(2, '0')}:${String(minutes || 0).padStart(2, '0')}:00${timezone >= 0 ? '+' : ''}${String(Math.floor(timezone)).padStart(2, '0')}:${String(Math.abs((timezone % 1) * 60)).padStart(2, '0')}`;

    const coordinates = `${latitude || 28.6139},${longitude || 77.209}`;
    const isWestern = chartType === "western";

    // Get access token
    const token = await getProkeralaAccessToken();

    // Prokerala uses /v2/astrology/ endpoints
    // Fetch kundli data (contains planet positions, nakshatra, etc.)
    const kundliData = await fetchProkeralaAPI("/astrology/kundli", {
      ayanamsa: "1", // Lahiri
      datetime,
      coordinates,
    }, token);

    // Fetch chart SVG
    const chartData = await fetchProkeralaAPI("/astrology/chart", {
      ayanamsa: "1",
      datetime,
      coordinates,
      chart_type: "rasi",
      chart_style: isWestern ? "south-indian" : "north-indian",
      format: "svg",
    }, token);

    // Try to get Navamsa chart for Vedic
    let navamsaChart = null;
    if (!isWestern) {
      try {
        navamsaChart = await fetchProkeralaAPI("/astrology/chart", {
          ayanamsa: "1",
          datetime,
          coordinates,
          chart_type: "navamsa",
          chart_style: "north-indian",
          format: "svg",
        }, token);
      } catch {
        // Navamsa failed, continue without it
      }
    }

    // Extract planet positions from kundli data
    const planets: Record<string, any> = {};
    if (kundliData?.data?.nakshatra_details) {
      const nd = kundliData.data.nakshatra_details;
      if (nd.nakshatra) {
        planets["Nakshatra"] = {
          name: nd.nakshatra.name,
          lord: nd.nakshatra.lord?.name,
          pada: nd.nakshatra.pada,
        };
      }
      if (nd.chandra_rasi) {
        planets["Moon"] = {
          zodiac_sign: nd.chandra_rasi.name,
          lord: nd.chandra_rasi.lord?.name,
        };
      }
      if (nd.soorya_rasi) {
        planets["Sun"] = {
          zodiac_sign: nd.soorya_rasi.name,
          lord: nd.soorya_rasi.lord?.name,
        };
      }
      if (nd.zodiac) {
        planets["Ascendant"] = {
          zodiac_sign: nd.zodiac.name,
        };
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        chart: chartData,
        planets,
        navamsaChart,
        kundli: kundliData?.data,
        chartType: isWestern ? "western" : "vedic",
        birthDetails: { date: birthDate, time: birthTime, latitude, longitude, timezone },
      },
    });
  } catch (error) {
    console.error("Birth chart API error:", error);
    return NextResponse.json(
      { success: false, error: `Failed to generate birth chart: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}
