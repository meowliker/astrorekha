import { NextRequest, NextResponse } from "next/server";
import { sanitizeAnswers } from "@/app/soulmate/chat-data";
import { saveSoulmateSession, sessionCredentials } from "@/lib/soulmate-session";

export async function POST(request: NextRequest) {
  try {
    const origin = new URL(request.headers.get("origin") || "");
    if (origin.host !== (request.headers.get("host") || request.nextUrl.host)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    const text = await request.text();
    if (text.length > 6000) return NextResponse.json({ error: "Request too large" }, { status: 413 });
    const body = JSON.parse(text);
    const credentials = sessionCredentials(body.session);
    const answers = sanitizeAnswers(body.answers);
    if (!credentials || !answers.name || Object.keys(answers).length !== Object.keys(body.answers || {}).length) return NextResponse.json({ error: "Invalid answers" }, { status: 400 });
    await saveSoulmateSession(credentials, answers);
    return NextResponse.json({ saved: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Answers could not be saved yet" }, { status: 503 });
  }
}
