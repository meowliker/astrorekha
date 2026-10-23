import { NextRequest, NextResponse } from "next/server";
import { runSoulmateFulfillment } from "@/lib/soulmate-fulfillment";
import { runSoulmateWhatsApp } from "@/lib/soulmate-whatsapp";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    // Channels settle independently: a WhatsApp failure must not stop email delivery.
    const [email, whatsapp] = await Promise.allSettled([runSoulmateFulfillment(), runSoulmateWhatsApp()]);
    const result = email.status === "fulfilled" ? email.value : { processed: 0, failures: 1, needsReview: 0 };
    const whatsappResult = whatsapp.status === "fulfilled" ? whatsapp.value : { processed: 0, failures: 1 };
    return NextResponse.json({ ...result, whatsapp: whatsappResult }, { status: result.failures || result.needsReview || whatsappResult.failures ? 503 : 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Soulmate delivery worker unavailable" }, { status: 503 });
  }
}
