import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const TABLE = "admin_profit_report_cache";
const MAX_AGE_MS = 60_000;
export function profitReportCacheKey(params: URLSearchParams) {
  // Never persist credentials. Timing, source, dates and conversion rate are independent reports.
  return createHash("sha256").update(JSON.stringify([
    2, "astrorekha", params.get("dayMode") || "business_1130_ist", params.get("adSource") || "all",
    params.get("startDate"), params.get("endDate"), params.get("exchangeRate") || "auto",
  ])).digest("hex");
}

export async function cachedProfitReport(
  db: SupabaseClient, key: string, load: () => Promise<Response>,
  schedule: (task: () => Promise<void>) => void,
): Promise<Response> {
  const saved = await db.from(TABLE).select("payload,fetched_at,refresh_error").eq("cache_key", key).maybeSingle();
  if (saved.error) throw new Error("Profit report storage is unavailable. Please retry.");
  const refresh = async () => {
    const token = randomUUID();
    const claim = await db.rpc("claim_profit_report_refresh", { p_key: key, p_token: token });
    if (claim.error) throw new Error("Unable to prepare the saved Profit Sheet.");
    if (!claim.data) return null;
    try {
      const response = await load();
      if (!response.ok) throw new Error("Unable to refresh the Profit Sheet. Previous saved figures are retained.");
      const payload = await response.json();
      const fetchedAt = new Date().toISOString();
      const write = await db.from(TABLE).update({ payload: { ...payload, fetchedAt }, fetched_at: fetchedAt,
        refresh_token: null, refresh_until: null, refresh_error: null }).eq("cache_key", key).eq("refresh_token", token);
      if (write.error) throw new Error("Unable to save the refreshed Profit Sheet.");
      return { ...payload, fetchedAt, savedReport: true, refreshing: false };
    } catch (error) {
      await db.from(TABLE).update({ refresh_token: null, refresh_until: null,
        refresh_error: "Refresh failed. Showing the last saved report; use Refresh to retry." }).eq("cache_key", key).eq("refresh_token", token);
      throw error;
    }
  };
  if (saved.data?.payload) {
    const stale = Date.now() - Date.parse(saved.data.fetched_at) >= MAX_AGE_MS;
    if (stale) schedule(async () => { try { await refresh(); } catch { console.error("[profit snapshot] Background refresh failed"); } });
    return Response.json({ ...saved.data.payload, fetchedAt: saved.data.fetched_at, savedReport: true, refreshing: stale,
      syncWarning: [saved.data.payload.syncWarning, saved.data.refresh_error].filter(Boolean).join(" ") || null });
  }
  const loaded = await refresh();
  if (!loaded) return Response.json({ preparing: true, rows: [], message: "Preparing this reporting window for the first time." }, { status: 202 });
  return Response.json(loaded);
}

export async function invalidateProfitReports(db: SupabaseClient) {
  const result = await db.from(TABLE).delete().neq("cache_key", "");
  if (result.error) throw new Error("Unable to refresh saved reports. Please retry.");
}
