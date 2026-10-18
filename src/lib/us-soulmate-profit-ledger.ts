import { assertUSAdAccountIsolation } from "./us-soulmate-account-isolation";
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { stripeRequest } from "./us-soulmate-stripe";
import { loadSoulmateProfitSettings } from "./us-soulmate-profit-settings";
import { fetchSoulmateMetaSpend } from "./us-soulmate-meta-spend";
import { DAY_MS, US_SOULMATE_PROFIT_START, profitDay, shiftProfitDate, soulmateProfitRows, type SoulmateProfitRow } from "./us-soulmate-profit";

type Refund = { event_id: string; order_id: string; date: string; amount_paise: number; gst_paise: number; occurred_at?: string };
export async function readSoulmateProfitLedger(db: SupabaseClient, start: string, end: string) {
  const [settings, saved] = await Promise.all([
    loadSoulmateProfitSettings(db),
    db.from("us_soulmate_profit_sheet").select("date,data,synced_at,config_revision").gte("date", start).lte("date", end).order("date"),
  ]);
  if (saved.error) throw new Error("Unable to read saved Soulmate profit rows.");
  const rows: SoulmateProfitRow[] = (saved.data || []).map((row) => ({ ...row.data, syncedAt: row.synced_at, stale: row.config_revision !== settings.revision }));
  const dates = new Set(rows.map((row) => row.date));
  const missing: string[] = [];
  for (let date = start; date <= end; date = shiftProfitDate(date, 1)) if (!dates.has(date)) missing.push(date);
  return { rows, missing, exchangeRate: settings.exchange_rate, revision: settings.revision, accountCount: settings.accounts.length, source: "us_soulmate_profit_sheet", updatedAt: rows.map((r) => r.syncedAt!).sort().pop() || null };
}
async function readReceipts(db: SupabaseClient, start: string, end: string) {
  const orders: { amount: number; gst_amount: number; paid_at: string }[] = [];
  for (let offset = 0; offset < 100000; offset += 1000) {
    const result = await db.from("us_soulmate_orders").select("amount,gst_amount,paid_at")
      .eq("funnel", "us_soulmate_standalone").eq("payment_mode", "live").eq("payment_status", "paid")
      .eq("attribution->>trackingEnvironment", "production")
      .gte("paid_at", `${start}T06:00:00Z`).lt("paid_at", `${shiftProfitDate(end, 1)}T06:00:00Z`)
      .order("paid_at").order("id").range(offset, offset + 999);
    if (result.error) throw new Error("Unable to load Soulmate sales.");
    orders.push(...result.data);
    if (result.data.length < 1000) return orders;
  }
  throw new Error("Choose a smaller reporting range.");
}
async function readRefunds(db: SupabaseClient, start: string, end: string): Promise<Refund[]> {
  const rows: Refund[] = [];
  let after = "";
  for (let page = 0; page < 100; page++) {
    const params = new URLSearchParams({ limit: "100", "created[gte]": String(Date.parse(`${start}T06:00:00Z`) / 1000), "created[lt]": String(Date.parse(`${shiftProfitDate(end, 1)}T06:00:00Z`) / 1000) });
    if (after) params.set("starting_after", after);
    const result = await stripeRequest(`/refunds?${params}`);
    for (const refund of result.data) {
      if (refund.status !== "succeeded" || refund.currency !== "usd" || typeof refund.payment_intent !== "string") continue;
      const found = await db.from("us_soulmate_orders").select("id,amount,gst_amount").eq("stripe_payment_id", refund.payment_intent).eq("payment_mode", "live").eq("payment_status", "paid").eq("attribution->>trackingEnvironment", "production").maybeSingle();
      if (found.error) throw new Error("Unable to reconcile US refunds.");
      if (!found.data) continue;
      if (!Number.isSafeInteger(refund.amount) || refund.amount < 0 || refund.amount > found.data.amount) throw new Error("Invalid Stripe refund amount.");
      const occurred_at = new Date(refund.created * 1000).toISOString();
      rows.push({ event_id: refund.id, order_id: found.data.id, date: profitDay(occurred_at), occurred_at, amount_paise: refund.amount, gst_paise: Math.round(refund.amount * found.data.gst_amount / found.data.amount) });
    }
    if (!result.has_more) return rows;
    after = result.data.at(-1)?.id;
    if (!after) throw new Error("Incomplete Stripe refund pagination.");
  }
  throw new Error("Choose a smaller refund range.");
}
export async function syncSoulmateProfitLedger(db: SupabaseClient, start: string, end: string, now = Date.now()) {
  if (start < US_SOULMATE_PROFIT_START || end > profitDay(now) || start > end || Date.parse(end) - Date.parse(start) >= 7 * DAY_MS) throw new Error("Sync up to seven days, starting on 15 October 2026 or later.");
  const owner = randomUUID();
  const claim = await db.rpc("claim_us_soulmate_profit_sync", { p_owner: owner });
  if (claim.error || !claim.data) throw new Error("A Soulmate refresh is already running. Try again shortly.");
  try {
    const settings = await loadSoulmateProfitSettings(db);
    await assertUSAdAccountIsolation(db, settings.accounts);
    const rate = 1;
    const [receipts, refunds, spend, previous, savedRefunds] = await Promise.all([
      readReceipts(db, start, end), readRefunds(db, start, end),
      settings.accounts.length ? fetchSoulmateMetaSpend(settings.accounts, start, end, rate!, now) : Promise.resolve([]),
      db.from("us_soulmate_profit_sheet").select("date,data").gte("date", start).lte("date", end),
      db.from("us_soulmate_refund_events").select("*").gte("date", start).lte("date", end),
    ]);
    if (previous.error || savedRefunds.error) throw new Error("Unable to read saved Soulmate figures.");
    const allRefunds = new Map<string, Refund>((savedRefunds.data || []).map((r) => [r.event_id, r]));
    refunds.forEach((r) => allRefunds.set(r.event_id, r));
    const rows = soulmateProfitRows(start, end, receipts).map((row) => {
      const accounts = spend.filter((a) => a.date === row.date);
      const dayRefunds = [...allRefunds.values()].filter((r) => r.date === row.date);
      const refund = dayRefunds.reduce((total, r) => total + r.amount_paise, 0);
      const salesGst = row.salesGst - dayRefunds.reduce((total, r) => total + r.gst_paise, 0);
      const revenue = row.received - refund;
      const adsUsd = settings.accounts.length ? accounts.reduce((sum, a) => sum + a.adsUsd, 0) : null;
      const adsInr = settings.accounts.length ? accounts.reduce((sum, a) => sum + a.adsInr, 0) : null;
      const adGst = settings.accounts.length ? accounts.reduce((sum, a) => sum + a.adGst, 0) : null;
      const old = previous.data.find((r) => r.date === row.date)?.data;
      // Never backdate today's balance; preserve the day's earlier genuine snapshot.
      const balances = accounts.filter((a) => a.balanceCapturedAt);
      const balance = balances.length === accounts.length && balances.length ? balances.reduce((sum, a) => sum + a.balance!, 0) : old?.balance ?? null;
      return { ...row, refund, salesGst, revenue, adsUsd, adsInr, adGst, balance, accounts, exchangeRate: rate,
        balanceCapturedAt: balances.length ? balances[0].balanceCapturedAt : old?.balanceCapturedAt ?? null,
        profit: adsInr === null || adGst === null ? null : revenue - salesGst - adsInr - adGst,
        roas: adsInr !== null && adsInr > 0 ? revenue / adsInr : null };
    });
    const saved = await db.rpc("finish_us_soulmate_profit_sync", { p_owner: owner, p_revision: settings.revision, p_rows: rows, p_spend: spend, p_refunds: refunds });
    if (saved.error) throw new Error("Unable to save refreshed figures. Reporting settings may have changed; try again.");
    return { start, end };
  } finally {
    await db.from("us_soulmate_admin_settings").update({ sync_owner: null, sync_until: null }).eq("id", true).eq("sync_owner", owner);
  }
}
