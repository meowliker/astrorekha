import { NextRequest, NextResponse } from "next/server";

// Common city coordinates for fallback
const CITY_COORDINATES: Record<string, { latitude: number; longitude: number; timezone: number }> = {
  "new delhi": { latitude: 28.6139, longitude: 77.209, timezone: 5.5 },
  "delhi": { latitude: 28.6139, longitude: 77.209, timezone: 5.5 },
  "mumbai": { latitude: 19.076, longitude: 72.8777, timezone: 5.5 },
  "bangalore": { latitude: 12.9716, longitude: 77.5946, timezone: 5.5 },
  "bengaluru": { latitude: 12.9716, longitude: 77.5946, timezone: 5.5 },
  "chennai": { latitude: 13.0827, longitude: 80.2707, timezone: 5.5 },
  "kolkata": { latitude: 22.5726, longitude: 88.3639, timezone: 5.5 },
  "hyderabad": { latitude: 17.385, longitude: 78.4867, timezone: 5.5 },
  "pune": { latitude: 18.5204, longitude: 73.8567, timezone: 5.5 },
  "ahmedabad": { latitude: 23.0225, longitude: 72.5714, timezone: 5.5 },
  "jaipur": { latitude: 26.9124, longitude: 75.7873, timezone: 5.5 },
  "lucknow": { latitude: 26.8467, longitude: 80.9462, timezone: 5.5 },
  "new york": { latitude: 40.7128, longitude: -74.006, timezone: -5 },
  "los angeles": { latitude: 34.0522, longitude: -118.2437, timezone: -8 },
  "london": { latitude: 51.5074, longitude: -0.1278, timezone: 0 },
  "paris": { latitude: 48.8566, longitude: 2.3522, timezone: 1 },
  "tokyo": { latitude: 35.6762, longitude: 139.6503, timezone: 9 },
  "sydney": { latitude: -33.8688, longitude: 151.2093, timezone: 11 },
  "dubai": { latitude: 25.2048, longitude: 55.2708, timezone: 4 },
  "singapore": { latitude: 1.3521, longitude: 103.8198, timezone: 8 },
};

export async function POST(request: NextRequest) {
  try {
    const { place_name } = await request.json();

    if (!place_name || place_name.length < 2) {
      return NextResponse.json(
        { success: false, error: "Place name is required" },
        { status: 400 }
      );
    }

    // Check local database first
    const normalizedPlace = place_name.toLowerCase().trim();
    for (const [city, coords] of Object.entries(CITY_COORDINATES)) {
      if (normalizedPlace.includes(city) || city.includes(normalizedPlace)) {
        return NextResponse.json({
          success: true,
          data: {
            latitude: coords.latitude,
            longitude: coords.longitude,
            timezone: coords.timezone,
            place_name: place_name,
          },
        });
      }
    }

    // Use OpenStreetMap Nominatim API (free, no API key required)
    try {
      const nominatimResponse = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(place_name)}&format=json&limit=1`,
        {
          headers: {
            "User-Agent": "PalmCosmic/1.0",
          },
        }
      );

      if (nominatimResponse.ok) {
        const results = await nominatimResponse.json();
        if (results && results.length > 0) {
          const result = results[0];
          // Estimate timezone based on longitude (rough approximation)
          const estimatedTimezone = Math.round(parseFloat(result.lon) / 15);
          
          return NextResponse.json({
            success: true,
            data: {
              latitude: parseFloat(result.lat),
              longitude: parseFloat(result.lon),
              timezone: estimatedTimezone,
              place_name: result.display_name || place_name,
            },
          });
        }
      }
    } catch (nominatimError) {
      console.error("Nominatim lookup failed:", nominatimError);
    }

    // Default fallback to New Delhi if nothing found
    return NextResponse.json({
      success: true,
      data: {
        latitude: 28.6139,
        longitude: 77.209,
        timezone: 5.5,
        place_name: place_name,
      },
    });
  } catch (error) {
    console.error("Geo lookup error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to lookup location" },
      { status: 500 }
    );
  }
}
