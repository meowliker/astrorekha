import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { soulmateTrackingCredentials, soulmateTrackingRate } from "@/lib/us-soulmate-tracking-data";
import { trackingDate, trackingDayStartUtc, nextTrackingDayStartUtc, type TrackingDayMode } from "@/lib/tracking-dashboard";
import { fetchMetaTrackingActivities, fetchMetaTrackingChildren, fetchMetaTrackingHourlySpend } from "@/lib/us-soulmate-tracking-meta-detail";

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
    const dayModeParam = params.get("dayMode");
    if (dayModeParam && dayModeParam !== "business_1130_ist" && dayModeParam !== "calendar_ist") return json({ error: "Choose a valid reporting window." }, 400);
    const dayMode: TrackingDayMode = dayModeParam === "calendar_ist" ? "calendar_ist" : "business_1130_ist";
    const start = params.get("start");
    const end = params.get("end");
    const today = trackingDate(new Date(), dayMode);
    if (!dateValid(start) || !dateValid(end) || start > end || end > today || (Date.parse(end) - Date.parse(start)) / 86_400_000 > 30) {
      return json({ error: "Choose a valid IST date range of up to 31 days." }, 400);
    }
    const includeBoth = params.get("mode") === "activities" && params.get("includeBoth") === "1";
    const accountRange = { startMillis: Date.parse(trackingDayStartUtc(start, includeBoth ? "calendar_ist" : dayMode)), endMillis: Date.parse(nextTrackingDayStartUtc(end, includeBoth ? "business_1130_ist" : dayMode)) };
    const credentials = await soulmateTrackingCredentials(supabase, accountRange);
    if (params.get("mode") === "activities") {
      const selected = params.get("accountId");
      const results = await Promise.all(credentials.filter((account) => !selected || selected === "all" || account.accountId === selected).map(async (account) => {
        try { return { rows: (await fetchMetaTrackingActivities(account, { start, end }, dayMode, includeBoth)).filter((row) => row.campaignId && account.campaignIds.includes(row.campaignId)), error: null }; }
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
    if (!credential.campaignIds.includes(campaignId)) return json({ error: "This campaign is not selected for Soulmate." }, 403);
    // A token can access multiple ad accounts. Do not trust a client-supplied
    // campaign ID just because the selected account itself is allowed.
    const ownership = await fetch(`https://graph.facebook.com/v21.0/${campaignId}?fields=id,account_id`, {
      headers: { Authorization: `Bearer ${credential.accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(10000),
    });
    const campaign = await ownership.json();
    if (!ownership.ok || campaign.id !== campaignId || String(campaign.account_id) !== accountId) return json({ error: "This campaign does not belong to the selected Soulmate ad account." }, 403);
    const { rate } = await soulmateTrackingRate(supabase);
    if (params.get("mode") === "children") return json(await fetchMetaTrackingChildren(credential, campaignId, { start, end }, rate, dayMode));
    if (params.get("mode") === "hourly") {
      if (start !== end) return json({ error: "Choose one day for hourly spend." }, 400);
      return json(await fetchMetaTrackingHourlySpend(credential, campaignId, start, rate, dayMode));
    }
    return json({ error: "Unknown detail request." }, 400);
  } catch (error) {
    console.error("[admin/soulmate/tracking/details]", error instanceof Error ? error.message : error);
    return json({ error: error instanceof Error ? error.message : "Meta detail unavailable" }, 500);
  }
}
