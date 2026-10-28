import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { summarizeSoulmateAnalytics, type SoulmateAnalyticsEvent, type SoulmateAnalyticsOrder } from "@/lib/us-soulmate-analytics";
import { US_SOULMATE_FUNNEL, US_SOULMATE_ORDERS_TABLE } from "@/lib/us-soulmate-orders";
import { analyticsRange, analyticsToday, defaultAnalyticsStart } from "@/lib/us-soulmate-analytics-range";
export const dynamic = "force-dynamic";

async function bounceRate(startDate: string, endDate: string) {
  const property = process.env.US_SOULMATE_GA4_PROPERTY_ID || process.env.US_SOULMATE_GOOGLE_ANALYTICS_PROPERTY_ID;
  const email = process.env.US_SOULMATE_GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.US_SOULMATE_GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!property || !email || !key) return { value: null, sessions: null, status: "GA4 reporting credentials are not configured." };
  try {
    const auth = new google.auth.GoogleAuth({ credentials: { client_email: email, private_key: key }, scopes: ["https://www.googleapis.com/auth/analytics.readonly"] });
    const api = google.analyticsdata({ version: "v1beta", auth });
    const { data } = await api.properties.runReport({ property: `properties/${property}`, requestBody: {
      dateRanges: [{ startDate, endDate }], metrics: [{ name: "bounceRate" }, { name: "sessions" }],
      dimensionFilter: { filter: { fieldName: "landingPage", inListFilter: { values: ["/us/soulmate", "/us/soulmate/"] } } },
    } }, { timeout: 8000 });
    const values = data.rows?.[0]?.metricValues;
    return { value: values && Number(values[1]?.value) > 0 ? Number(values[0]?.value) * 100 : null, sessions: Number(values?.[1]?.value || 0), status: "GA4; dates follow the property's timezone. Reporting may be delayed." };
  } catch { return { value: null, sessions: null, status: "GA4 report unavailable. Check property access and credentials." }; }
}

export async function GET(request: NextRequest) {
  const db = getSupabaseAdmin({ fresh: true });
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const session = await db.from("admin_sessions").select("expires_at").eq("id", token).maybeSingle();
  if (session.error || !session.data || Date.parse(session.data.expires_at) <= Date.now()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const today = analyticsToday();
  const startDate = request.nextUrl.searchParams.get("start") || defaultAnalyticsStart(today);
  const endDate = request.nextUrl.searchParams.get("end") || today;
  let range: ReturnType<typeof analyticsRange>;
  try { range = analyticsRange(startDate, endDate, today); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid dates." }, { status: 400 }); }
  try {
    const events: SoulmateAnalyticsEvent[] = [], orders: SoulmateAnalyticsOrder[] = [];
    await Promise.all([
      (async () => { for (let offset = 0; ; offset += 1000) {
        if (offset >= 100000) throw new Error("Choose a smaller date range.");
        const result = await db.from("us_soulmate_marketing_events").select("event_name,session_id,utm_source,utm_campaign,created_at")
          .eq("product_type", US_SOULMATE_FUNNEL).gte("created_at", range.start).lt("created_at", range.end)
          .order("created_at").order("id").range(offset, offset + 999);
        if (result.error) throw new Error("Unable to read soulmate events.");
        events.push(...result.data); if (result.data.length < 1000) break;
      } })(),
      (async () => { for (let offset = 0; ; offset += 1000) {
        if (offset >= 100000) throw new Error("Choose a smaller date range.");
        const result = await db.from(US_SOULMATE_ORDERS_TABLE).select("id,amount,attribution")
          .eq("funnel", US_SOULMATE_FUNNEL).eq("payment_mode", "live").eq("payment_status", "paid")
          .eq("attribution->>trackingEnvironment", "production")
          .gte("paid_at", range.start).lt("paid_at", range.end)
          .order("paid_at").order("id").range(offset, offset + 999);
        if (result.error) throw new Error("Unable to read verified soulmate orders.");
        orders.push(...result.data); if (result.data.length < 1000) break;
      } })(),
    ]);
    return NextResponse.json({ ...summarizeSoulmateAnalytics(events, orders), bounce: range.partialDay ? { value: null, sessions: null, status: "GA4 bounce rate is unavailable for the partial launch day; GA4 daily reports cannot match the 11:30 AM IST cutoff." } : await bounceRate(startDate, endDate), startDate, endDate, startAt: range.start, endAt: range.end }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load report" }, { status: 503 }); }
}
