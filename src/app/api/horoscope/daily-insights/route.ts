import { NextRequest, NextResponse } from "next/server";

// Divine API Configuration
const DIVINE_API_KEY = process.env.DIVINE_API_KEY || "";
const DIVINE_API_URL = "https://divineapi.com/api/1.0";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const sign = searchParams.get("sign")?.toLowerCase();

  if (!sign) {
    return NextResponse.json(
      { success: false, error: "Sign is required" },
      { status: 400 }
    );
  }

  if (!DIVINE_API_KEY) {
    return NextResponse.json({
      success: false,
      error: "Divine API not configured",
      fallback: generateFallbackInsights(sign),
    });
  }

  try {
    // Fetch daily horoscope from Divine API
    const formData = new URLSearchParams();
    formData.append("api_key", DIVINE_API_KEY);
    formData.append("sign", sign.toLowerCase());
    formData.append("date", new Date().toISOString().split("T")[0]);
    
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

    // Extract prediction data from Divine API response
    const prediction = data.data?.prediction || {};
    const luckInfo = prediction.luck || [];
    
    // Extract lucky info from luck array
    // Divine API format: "Colors of the day : Fern, Sunset", "Lucky Numbers of the day : 3, 7, 21"
    let luckyColor = "Blue";
    let luckyNumber = "7";
    let cosmicTip = "";
    let tipForSingles = "";
    let tipForCouples = "";
    
    for (const item of luckInfo) {
      if (typeof item === "string") {
        // Divine API format: "Colors of the day : Fern, Sunset"
        // Split by " : " or " – " to get the value after the label
        if (item.includes("Colors of the day")) {
          luckyColor = item.replace(/Colors of the day\s*[:\u2013]\s*/i, "").trim() || "Blue";
        }
        if (item.includes("Lucky Numbers of the day")) {
          luckyNumber = item.replace(/Lucky Numbers of the day\s*[:\u2013]\s*/i, "").trim() || "7";
        }
        if (item.includes("Cosmic Tip")) {
          cosmicTip = item.replace(/Cosmic Tip\s*[:\u2013]\s*/i, "").trim() || "";
        }
        if (item.includes("Tips for singles")) {
          tipForSingles = item.replace(/Tips for singles\s*[:\u2013]\s*/i, "").trim() || "";
        }
        if (item.includes("Tips for couples")) {
          tipForCouples = item.replace(/Tips for couples\s*[:\u2013]\s*/i, "").trim() || "";
        }
      }
    }
    
    // Get first color and first number only
    const firstColor = luckyColor.split(",")[0]?.trim() || "Blue";
    const firstNumber = luckyNumber.split(",")[0]?.trim() || "7";

    // Extract insights from the response
    const insights = {
      dailyTip: cosmicTip || prediction.personal?.substring(0, 100) + "..." || "Stay positive and trust your intuition today.",
      dos: [
        prediction.profession ? `Career: ${prediction.profession.substring(0, 50)}...` : "Focus on your goals",
        prediction.health ? `Health: ${prediction.health.substring(0, 50)}...` : "Take time for self-care",
        tipForSingles || tipForCouples || "Connect with loved ones",
      ],
      donts: extractDonts(data),
      luckyTime: "10:00 AM - 12:00 PM",
      luckyNumber: firstNumber,
      luckyColor: firstColor,
      mood: prediction.emotions ? "Balanced" : "Optimistic",
      compatibility: null,
    };

    return NextResponse.json({
      success: true,
      data: insights,
      source: "divine",
    });
  } catch (error) {
    console.error("Divine API error:", error);
    
    // Return fallback data
    return NextResponse.json({
      success: true,
      data: generateFallbackInsights(sign),
      source: "fallback",
    });
  }
}

// Extract daily tip from horoscope text
function extractDailyTip(data: any): string {
  const prediction = data.prediction || data.horoscope || data.data?.prediction || "";
  
  if (prediction) {
    // Get the first sentence or first 100 characters
    const sentences = prediction.split(/[.!?]/);
    if (sentences[0] && sentences[0].length > 20) {
      return sentences[0].trim() + ".";
    }
  }
  
  return "Stay positive and trust your intuition today.";
}

// Extract do's from horoscope
function extractDos(data: any): string[] {
  // Divine API might have specific fields for this
  if (data.dos || data.data?.dos) {
    return Array.isArray(data.dos) ? data.dos : [data.dos];
  }
  
  // Generate based on mood/prediction
  const mood = data.mood || data.data?.mood || "";
  const dos = [
    "Focus on your goals",
    "Connect with loved ones",
    "Take time for self-care",
  ];
  
  if (mood.toLowerCase().includes("energetic")) {
    dos[0] = "Channel your energy into creative projects";
  }
  
  return dos;
}

// Extract don'ts from horoscope
function extractDonts(data: any): string[] {
  // Divine API might have specific fields for this
  if (data.donts || data.data?.donts) {
    return Array.isArray(data.donts) ? data.donts : [data.donts];
  }
  
  // Generate based on prediction
  return [
    "Avoid impulsive decisions",
    "Don't neglect your health",
    "Avoid conflicts",
  ];
}

// Fallback insights when Divine API is not available
function generateFallbackInsights(sign: string) {
  const tips = [
    "Trust your intuition and follow your heart today.",
    "Focus on building meaningful connections.",
    "Take time to reflect on your goals and aspirations.",
    "Embrace new opportunities that come your way.",
    "Stay positive and maintain a balanced perspective.",
  ];
  
  const dosList = [
    ["Focus on your priorities", "Practice gratitude", "Stay organized"],
    ["Connect with friends", "Try something new", "Exercise regularly"],
    ["Set clear boundaries", "Express yourself", "Rest when needed"],
    ["Plan ahead", "Be patient", "Show kindness"],
    ["Stay focused", "Communicate clearly", "Take breaks"],
  ];
  
  const dontsList = [
    ["Avoid overthinking", "Don't rush decisions", "Skip negative thoughts"],
    ["Avoid conflicts", "Don't overcommit", "Skip junk food"],
    ["Avoid procrastination", "Don't ignore intuition", "Skip drama"],
    ["Avoid stress", "Don't be too critical", "Skip comparisons"],
    ["Avoid distractions", "Don't neglect self-care", "Skip negativity"],
  ];
  
  const colors = ["Blue", "Green", "Yellow", "Purple", "Red", "Orange"];
  const moods = ["Optimistic", "Energetic", "Calm", "Confident", "Creative"];
  
  // Deterministic selection based on sign
  const seed = sign.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const index = seed % tips.length;
  
  return {
    dailyTip: tips[index],
    dos: dosList[index],
    donts: dontsList[index],
    luckyTime: "10:00 AM - 12:00 PM",
    luckyNumber: (seed % 9) + 1,
    luckyColor: colors[seed % colors.length],
    mood: moods[seed % moods.length],
    compatibility: null,
  };
}
