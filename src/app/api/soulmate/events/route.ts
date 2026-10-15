import { NextRequest, NextResponse } from "next/server";
import { recordMarketingEvent } from "@/lib/marketing-events";
import { SOULMATE_FUNNEL } from "@/lib/soulmate-orders";
import { sanitizePaymentAttribution } from "@/lib/attribution";

const events = new Set(["landing_view", "chat_start", "chat_complete", "offer_view", "checkout_view", "payu_redirect", "engaged", "checkout_error"]);
export async function POST(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "production") return new NextResponse(null, { status: 204 });
  if (request.headers.get("origin") !== `https://${request.headers.get("host")}`) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const text = await request.text();
  if (text.length > 12000) return new NextResponse(null, { status: 413 });
  try {
    const body = JSON.parse(text);
    if (!events.has(body.event) || !/^[a-f0-9-]{36}$/i.test(body.sessionId || "")) return new NextResponse(null, { status: 400 });
    const plan = ["standard", "express"].includes(body.plan) ? body.plan : null;
    const success = await recordMarketingEvent({
      eventName: `soulmate_${body.event}`, productType: SOULMATE_FUNNEL,
      sessionId: body.sessionId, productId: plan ? `soulmate_${plan}` : null,
      path: body.event === "checkout_view" ? "/soulmate/checkout" : "/soulmate",
      attribution: sanitizePaymentAttribution(body.attribution),
      metadata: { funnel: SOULMATE_FUNNEL, plan },
    });
    return NextResponse.json({ success }, { status: success ? 200 : 503 });
  } catch { return new NextResponse(null, { status: 400 }); }
}
