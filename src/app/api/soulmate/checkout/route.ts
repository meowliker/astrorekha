import { sanitizePaymentAttribution } from "@/lib/attribution";
import { buildSoulmateCart } from "@/lib/soulmate-cart";
import crypto from "crypto";
import { saveSoulmateSession, sessionCredentials } from "@/lib/soulmate-session";
import { NextRequest, NextResponse } from "next/server";
import { deliveryPlans, sanitizeAnswers, steps } from "@/app/soulmate/chat-data";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { readOrderAttribution } from "@/lib/order-attribution";
import { SOULMATE_FUNNEL, SOULMATE_ORDERS_TABLE, SOULMATE_ORDER_PREFIX } from "@/lib/soulmate-orders";
import { checkoutParameters, soulmatePayUProductInfo, payuConfig, receiptPath, receiptCookie, type SoulmateOrder } from "@/lib/soulmate-payu";
import { toPayUPhoneNumber } from "@/lib/whatsapp";

export async function POST(request: NextRequest) {
  try {
    // Next's dev server can normalize 127.0.0.1 to localhost in nextUrl.
    // Compare the browser Origin with the actual HTTP Host instead.
    const originHeader = request.headers.get("origin") || "";
    let originUrl: URL;
    try { originUrl = new URL(originHeader); } catch { return NextResponse.json({ error: "Invalid checkout origin" }, { status: 403 }); }
    if (!["http:", "https:"].includes(originUrl.protocol) || originUrl.host !== (request.headers.get("host") || request.nextUrl.host)) return NextResponse.json({ error: "Invalid checkout origin" }, { status: 403 });
    const origin = originUrl.origin;
    const body = await request.json();
    const answers = sanitizeAnswers(body.answers);
    const plan = deliveryPlans.find((item) => item.id === body.plan);
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const phone = typeof body.phone === "string" && body.phone.length <= 20 ? toPayUPhoneNumber(body.phone) : "";
    const checkoutKey = typeof body.checkoutKey === "string" ? body.checkoutKey : "";
    if (!plan || steps.some((step) => !answers[step])) return NextResponse.json({ error: "Please complete your sketch preferences first." }, { status: 400 });
    if (!/^[^\s@|]+@[^\s@|]+\.[^\s@|]+$/.test(email) || email.length > 254 || !/^91[6-9]\d{9}$/.test(phone) || answers.name!.includes("|")) {
      return NextResponse.json({ error: "Please enter a valid email and Indian mobile number." }, { status: 400 });
    }
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(checkoutKey)) return NextResponse.json({ error: "Please reopen checkout and try again." }, { status: 400 });
    const session = body.session ? sessionCredentials(body.session) : null;
    if (body.session && !session) return NextResponse.json({ error: "Invalid sketch session" }, { status: 400 });
    if (session) await saveSoulmateSession(session, answers);
    const { mode } = payuConfig();
    let cart;
    try { cart = buildSoulmateCart(plan.id, body.addOns ?? []); } catch { return NextResponse.json({ error: "Invalid add-ons for this package." }, { status: 400 }); }
    const fingerprint = crypto.createHash("sha256").update(JSON.stringify({ answers, plan: plan.id, email, phone, mode, cart })).digest("hex");
    const db = getSupabaseAdmin();
    const attribution = await readOrderAttribution();
    const record = {
      id: `${SOULMATE_ORDER_PREFIX}${crypto.randomBytes(10).toString("hex")}`,
      session_id: session?.id || null,
      funnel: SOULMATE_FUNNEL, checkout_key: checkoutKey, checkout_fingerprint: fingerprint,
      plan: plan.id, customer_name: answers.name!, customer_email: email, customer_phone: phone, answers,
      base_amount: cart.baseAmount, gst_amount: cart.gstAmount, amount: cart.amount,
      catalog_version: 2, line_items: cart.lineItems, entitlements: cart.entitlements, add_ons: cart.addOns, review_status: "pending",
      delivery_hours: cart.entitlements.scheduled_hours,
      product_info: soulmatePayUProductInfo(cart.productInfo), payment_mode: mode,
      attribution: { ...attribution, landing_path: "/soulmate",
        marketing: sanitizePaymentAttribution(body.tracking?.attribution),
        sessionId: /^[a-f0-9-]{36}$/i.test(body.tracking?.sessionId || "") ? body.tracking.sessionId : null,
        trackingEnvironment: ["localhost", "127.0.0.1", "[::1]"].includes(originUrl.hostname) ? "local" : process.env.VERCEL_ENV === "production" && ["astrorekha.com", "www.astrorekha.com"].includes(originUrl.hostname) ? "production" : "preview",
        userAgent: request.headers.get("user-agent")?.slice(0, 512) || null,
      },
    };
    const { data, error } = await db.from(SOULMATE_ORDERS_TABLE).insert(record).select().single();
    let order = data as SoulmateOrder | null;
    if (error?.code === "23505") {
      const existing = await db.from(SOULMATE_ORDERS_TABLE).select("*").eq("checkout_key", checkoutKey).single();
      if (existing.error || existing.data?.checkout_fingerprint !== fingerprint) return NextResponse.json({ error: "Checkout details changed. Please reopen checkout." }, { status: 409 });
      order = existing.data as SoulmateOrder;
    } else if (error) {
      console.error("[soulmate/checkout] Order creation failed", error.code);
      return NextResponse.json({ error: "Checkout is temporarily unavailable. Please try again shortly." }, { status: 503 });
    }
    if (!order) throw new Error("Missing order");
    const receiptUrl = receiptPath(order.id);
    const response = NextResponse.json(order.payment_status !== "created"
      ? { receiptUrl, checkStatus: true }
      : { ...checkoutParameters(order, origin), receiptUrl, orderId: order.id }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(receiptCookie(order.id));
    return response;
  } catch (error) {
    console.error("[soulmate/checkout]", error instanceof SyntaxError ? "Invalid JSON" : "Checkout unavailable");
    return NextResponse.json({ error: "Unable to start payment. Please try again." }, { status: error instanceof SyntaxError ? 400 : 503 });
  }
}
