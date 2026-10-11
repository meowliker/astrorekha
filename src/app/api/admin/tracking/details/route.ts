import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getMetaAccountCredentialsForRange, getMetaAccountCredentialsFromEnv } from "@/lib/meta-ad-accounts";
import { businessDate } from "@/lib/tracking-dashboard";
import { fetchMetaTrackingActivities, fetchMetaTrackingChildren, fetchMetaTrackingHourlySpend } from "@/lib/tracking-meta-detail";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const dateValid = (value: string | null): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const token = request.headers.get("x-admin-session");
    if (!token) return json({ error: "Unauthorized" }, 401);
    const { data: session } = await supabase.from("admin_sessions").select("id,expires_at").eq("id", token).maybeSingle();
    if (!session || new Date(session.expires_at) <= new Date()) return json({ error: "Session expired" }, 401);
    const params = new URL(request.url).searchParams;
    const start = params.get("start");
    const end = params.get("end");
    const today = businessDate(new Date());
    if (!dateValid(start) || !dateValid(end) || start > end || end > today || (Date.parse(end) - Date.parse(start)) / 86_400_000 > 30) {
      return json({ error: "Choose a valid IST date range of up to 31 days." }, 400);
    }
    const configured = await getMetaAccountCredentialsForRange(supabase, { startDate: start, endDate: end });
    const credentials = configured.length ? configured : getMetaAccountCredentialsFromEnv({ startDate: start, endDate: end });
    if (params.get("mode") === "activities") {
      const selected = params.get("accountId");
      const results = await Promise.all(credentials.filter((account) => !selected || selected === "all" || account.accountId === selected).map(async (account) => {
        try { return { rows: await fetchMetaTrackingActivities(account, { start, end }), error: null }; }
        catch (error) { return { rows: [], error: `${account.label || account.accountId}: ${error instanceof Error ? error.message : "Meta activities unavailable"}` }; }
      }));
      return json({ activities: results.flatMap((result) => result.rows).sort((a, b) => b.at.localeCompare(a.at)),
        warnings: results.map((result) => result.error).filter(Boolean) });
    }
    const accountId = params.get("accountId");
    const campaignId = params.get("campaignId");
    if (!accountId || !/^\d+$/.test(accountId) || !campaignId || !/^\d+$/.test(campaignId)) return json({ error: "Choose a Meta campaign." }, 400);
    const credential = credentials.find((account) => account.accountId === accountId);
    if (!credential) return json({ error: "Meta account unavailable for this range." }, 404);
    const { data: savedRate } = await supabase.from("profit_sheet").select("exchange_rate").not("exchange_rate", "is", null).order("date", { ascending: false }).limit(1).maybeSingle();
    const configuredRate = Number(savedRate?.exchange_rate);
    const fallback = Number(process.env.USD_INR_EXCHANGE_RATE || process.env.EXCHANGE_RATE_USD_INR);
    const rate = configuredRate > 0 ? configuredRate : fallback > 0 ? fallback : 85;
    if (params.get("mode") === "children") return json(await fetchMetaTrackingChildren(credential, campaignId, { start, end }, rate));
    if (params.get("mode") === "hourly") {
      if (start !== end) return json({ error: "Choose one day for hourly spend." }, 400);
      return json(await fetchMetaTrackingHourlySpend(credential, campaignId, start, rate));
    }
    return json({ error: "Unknown detail request." }, 400);
  } catch (error) {
    console.error("[admin/tracking/details]", error instanceof Error ? error.message : error);
    return json({ error: error instanceof Error ? error.message : "Meta detail unavailable" }, 500);
  }
}
