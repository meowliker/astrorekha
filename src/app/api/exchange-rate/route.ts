
import { getErrorMessage } from "@/lib/error-message";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Cache the rate for 1 hour to avoid too many API calls
let cachedRate: { rate: number; timestamp: number } | null = null;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

export async function GET() {
  try {
    // Check if we have a valid cached rate
    if (cachedRate && Date.now() - cachedRate.timestamp < CACHE_DURATION) {
      return NextResponse.json({
        rate: cachedRate.rate,
        cached: true,
        timestamp: cachedRate.timestamp,
      });
    }

    // Fetch from exchangerate-api.com (free tier available)
    const response = await fetch(
      "https://api.exchangerate-api.com/v4/latest/USD",
      { next: { revalidate: 3600 } } // Cache for 1 hour
    );

    if (!response.ok) {
      // Fallback to a reasonable rate if API fails
      return NextResponse.json({
        rate: 93.32, // Current rate as fallback
        cached: false,
        fallback: true,
        error: "API unavailable, using fallback rate",
      });
    }

    const data = await response.json();
    const inrRate = data.rates?.INR;

    if (!inrRate) {
      return NextResponse.json({
        rate: 93.32,
        cached: false,
        fallback: true,
        error: "INR rate not found, using fallback",
      });
    }

    // Update cache
    cachedRate = {
      rate: inrRate,
      timestamp: Date.now(),
    };

    return NextResponse.json({
      rate: inrRate,
      cached: false,
      timestamp: cachedRate.timestamp,
    });
  } catch (error) {
    console.error("Exchange rate fetch error:", error);
    return NextResponse.json({
      rate: 93.32, // Fallback rate
      cached: false,
      fallback: true,
      error: getErrorMessage(error),
    });
  }
}
