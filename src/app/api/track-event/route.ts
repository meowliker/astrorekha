import { NextResponse } from "next/server";

// Retired marketing endpoint. Old tabs and schedules must not contact Brevo or read customer data.
export async function POST() {
  return NextResponse.json({ error: "This feature has been removed." }, { status: 410, headers: { "Cache-Control": "no-store" } });
}
