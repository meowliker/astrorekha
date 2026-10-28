import { NextRequest, NextResponse } from "next/server";
import { recordMarketingEvent } from "@/lib/us-soulmate-marketing-events";
import { US_SOULMATE_FUNNEL } from "@/lib/us-soulmate-orders";
import { sanitizePaymentAttribution } from "@/lib/attribution";

const events = new Set(["landing_view", "chat_start", "chat_complete", "offer_view", "add_to_cart", "checkout_view", "stripe_redirect", "payment_submit", "engaged", "checkout_error"]);
export async function POST(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "production") return new NextResponse(null, { status: 204 });
  if (request.headers.get("origin") !== `https://${request.headers.get("host")}`) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const text = await request.text();
  if (text.length > 12000) return new NextResponse(null, { status: 413 });
  try {
    const body = JSON.parse(text);
    if (!events.has(body.event) || !/^[a-f0-9-]{36}$/i.test(body.sessionId || "")) return new NextResponse(null, { status: 400 });
    let arrival: URL | null = null;
    try {
      const candidate = new URL(body.url);
      if (candidate.protocol === "https:" && ["astrorekha.com", "www.astrorekha.com"].includes(candidate.hostname) && /^\/us\/soulmate(?:\/|$)/.test(candidate.pathname)) arrival = candidate;
    } catch { /* Older clients did not include the arrival URL. */ }
    const plan = ["standard", "express"].includes(body.plan) ? body.plan : null;
    const success = await recordMarketingEvent({
      eventName: `us_soulmate_${body.event}`, productType: US_SOULMATE_FUNNEL,
      sessionId: body.sessionId, productId: plan ? `us_soulmate_${plan}` : null,
      url: arrival?.href || null,
      path: ["checkout_view", "payment_submit"].includes(body.event) ? "/us/soulmate/checkout" : "/us/soulmate",
      attribution: sanitizePaymentAttribution(body.attribution),
      metadata: { funnel: US_SOULMATE_FUNNEL, plan },
    });
    return NextResponse.json({ success }, { status: success ? 200 : 503 });
  } catch { return new NextResponse(null, { status: 400 }); }
}
