import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = "https://json.freeastrologyapi.com";
const API_KEY = process.env.ASTROLOGY_API_KEY || "I6i5bm4qBi5NXUkeoPmDd91CA9nBEIeh5zrPeV8y";

export async function POST(request: NextRequest) {
  try {
    const { 
      person1, // { birthDate, birthTime, latitude, longitude, timezone }
      person2  // { birthDate, birthTime, latitude, longitude, timezone }
    } = await request.json();

    const p1Date = new Date(person1.birthDate);
    const [p1Hours, p1Minutes] = (person1.birthTime || "12:00").split(":").map(Number);
    
    const p2Date = new Date(person2.birthDate);
    const [p2Hours, p2Minutes] = (person2.birthTime || "12:00").split(":").map(Number);

    // Correct API format: uses "male" and "female" objects
    const body = {
      male: {
        year: p1Date.getFullYear(),
        month: p1Date.getMonth() + 1,
        date: p1Date.getDate(),
        hours: p1Hours || 12,
        minutes: p1Minutes || 0,
        seconds: 0,
        latitude: person1.latitude || 28.6139,
        longitude: person1.longitude || 77.209,
        timezone: person1.timezone || 5.5,
      },
      female: {
        year: p2Date.getFullYear(),
        month: p2Date.getMonth() + 1,
        date: p2Date.getDate(),
        hours: p2Hours || 12,
        minutes: p2Minutes || 0,
        seconds: 0,
        latitude: person2.latitude || 28.6139,
        longitude: person2.longitude || 77.209,
        timezone: person2.timezone || 5.5,
      },
      config: {
        observation_point: "topocentric",
        language: "en",
        ayanamsha: "lahiri",
      },
    };

    // Correct endpoint: match-making/ashtakoot-score
    const response = await fetch(`${API_BASE_URL}/match-making/ashtakoot-score`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("API Error Response:", errorText);
      throw new Error(`API failed: ${response.status}`);
    }

    const data = await response.json();
    const output = data.output;

    // Calculate compatibility percentage
    const totalScore = output.total_score || 0;
    const maxScore = output.out_of || 36;
    const percentage = Math.round((totalScore / maxScore) * 100);

    // Determine compatibility level
    let level = "Low";
    let description = "This match may face challenges. Communication and understanding will be key.";
    
    if (percentage >= 75) {
      level = "Excellent";
      description = "An exceptional match! You share deep compatibility across all aspects.";
    } else if (percentage >= 60) {
      level = "Good";
      description = "A strong match with good potential for a harmonious relationship.";
    } else if (percentage >= 45) {
      level = "Moderate";
      description = "A decent match. Some areas may need extra attention and effort.";
    }

    return NextResponse.json({
      success: true,
      data: {
        totalScore,
        maxScore,
        percentage,
        level,
        description,
        breakdown: {
          varna: { score: output.varna_kootam?.score || 0, max: output.varna_kootam?.out_of || 1 },
          vashya: { score: output.vasya_kootam?.score || 0, max: output.vasya_kootam?.out_of || 2 },
          tara: { score: output.tara_kootam?.score || 0, max: output.tara_kootam?.out_of || 3 },
          yoni: { score: output.yoni_kootam?.score || 0, max: output.yoni_kootam?.out_of || 4 },
          grahaMaitri: { score: output.graha_maitri_kootam?.score || 0, max: output.graha_maitri_kootam?.out_of || 5 },
          gana: { score: output.gana_kootam?.score || 0, max: output.gana_kootam?.out_of || 6 },
          bhakoot: { score: output.rasi_kootam?.score || 0, max: output.rasi_kootam?.out_of || 7 },
          nadi: { score: output.nadi_kootam?.score || 0, max: output.nadi_kootam?.out_of || 8 },
        },
      },
    });
  } catch (error) {
    console.error("Compatibility API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to calculate compatibility" },
      { status: 500 }
    );
  }
}
