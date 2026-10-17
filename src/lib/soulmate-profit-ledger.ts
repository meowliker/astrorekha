import { createHash, randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPayUTransactions, getPayUEventFingerprint } from "./payu-api";
import { classifyPayUEvent } from "./finance-events";
import { loadSoulmateProfitSettings } from "./soulmate-profit-settings";
import { fetchSoulmateMetaSpend } from "./soulmate-meta-spend";
import { DAY_MS, SOULMATE_PROFIT_START, profitDay, shiftProfitDate, soulmateProfitRows, type SoulmateProfitRow } from "./soulmate-profit";

type Refund = { event_id: string; order_id: string; date: string; amount_paise: number; gst_paise: number; occurred_at?: string };
export async function readSoulmateProfitLedger(db: SupabaseClient, start: string, end: string) {
  const [settings, saved] = await Promise.all([
    loadSoulmateProfitSettings(db),
    db.from("soulmate_profit_sheet").select("date,data,synced_at,config_revision").gte("date", start).lte("date", end).order("date"),
  ]);
  if (saved.error) throw new Error("Unable to read saved Soulmate profit rows.");
  const rows: SoulmateProfitRow[] = (saved.data || []).map((row) => ({ ...row.data, syncedAt: row.synced_at, stale: row.config_revision !== settings.revision }));
  const dates = new Set(rows.map((row) => row.date));
  const missing: string[] = [];
  for (let date = start; date <= end; date = shiftProfitDate(date, 1)) if (!dates.has(date)) missing.push(date);
  return { rows, missing, exchangeRate: settings.exchange_rate, revision: settings.revision, accountCount: settings.accounts.length, source: "soulmate_profit_sheet", updatedAt: rows.map((r) => r.syncedAt!).sort().pop() || null };
}
async function readReceipts(db: SupabaseClient, start: string, end: string) {
  const orders: { amount: number; gst_amount: number; paid_at: string }[] = [];
  for (let offset = 0; offset < 100000; offset += 1000) {
    const result = await db.from("soulmate_orders").select("amount,gst_amount,paid_at")
      .eq("funnel", "soulmate_standalone").eq("payment_mode", "live").eq("payment_status", "paid")
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
  if (process.env.PAYU_MODE !== "live") throw new Error("Live PayU reporting is required to reconcile production refunds.");
  // Shared read-only gateway source; only verified Soulmate order IDs enter this ledger.
  const transactions = await getPayUTransactions(start, shiftProfitDate(end, 1), "11:30:00", "11:29:59");
  const candidates = transactions.filter((txn) => /^sm_[a-f0-9]{20}$/.test(txn.txnid) &&
    classifyPayUEvent(txn as unknown as Record<string, unknown>).kind === "refund" &&
    !/pending|request|initiat|fail|cancel|process/i.test(`${txn.status} ${txn.unmappedstatus || ""}`));
  const ids = [...new Set(candidates.map((txn) => txn.txnid))];
  const orders = new Map<string, { amount: number; gst_amount: number }>();
  for (let offset = 0; offset < ids.length; offset += 100) {
    const result = await db.from("soulmate_orders").select("id,amount,gst_amount")
      .in("id", ids.slice(offset, offset + 100)).eq("funnel", "soulmate_standalone").eq("payment_mode", "live")
      .eq("attribution->>trackingEnvironment", "production").not("paid_at", "is", null);
    if (result.error) throw new Error("Unable to reconcile Soulmate refunds.");
    result.data.forEach((order) => orders.set(order.id, order));
  }
  const refunds = new Map<string, Refund>();
  for (const txn of candidates) {
    const order = orders.get(txn.txnid);
    if (!order) continue;
    const at = Date.parse(txn.addedon.replace(" ", "T") + "+05:30");
    if (!Number.isFinite(at)) throw new Error("PayU returned a refund with an invalid date.");
    const date = profitDay(at);
    if (date < start || date > end) continue;
    const amount = Math.round(classifyPayUEvent(txn as unknown as Record<string, unknown>).amount * 100);
    if (amount > order.amount) throw new Error("A Soulmate refund exceeds its order amount. Review it before syncing.");
    const event_id = createHash("sha256").update(getPayUEventFingerprint(txn)).digest("hex");
    refunds.set(event_id, { event_id, order_id: txn.txnid, date, occurred_at: new Date(at).toISOString(), amount_paise: amount, gst_paise: Math.round(amount * order.gst_amount / order.amount) });
  }
  return [...refunds.values()];
}
export async function syncSoulmateProfitLedger(db: SupabaseClient, start: string, end: string, now = Date.now()) {
  if (start < SOULMATE_PROFIT_START || end > profitDay(now) || start > end || Date.parse(end) - Date.parse(start) >= 7 * DAY_MS) throw new Error("Sync up to seven days, starting on 15 October 2026 or later.");
  const owner = randomUUID();
  const claim = await db.rpc("claim_soulmate_profit_sync", { p_owner: owner });
  if (claim.error || !claim.data) throw new Error("A Soulmate refresh is already running. Try again shortly.");
  try {
    const settings = await loadSoulmateProfitSettings(db);
    const rate = settings.exchange_rate;
    if (settings.accounts.length && (!rate || rate <= 0)) throw new Error("Set the Soulmate USD to INR rate before refreshing ad spend.");
    const [receipts, refunds, spend, previous, savedRefunds] = await Promise.all([
      readReceipts(db, start, end), readRefunds(db, start, end),
      settings.accounts.length ? fetchSoulmateMetaSpend(settings.accounts, start, end, rate!, now) : Promise.resolve([]),
      db.from("soulmate_profit_sheet").select("date,data").gte("date", start).lte("date", end),
      db.from("soulmate_refund_events").select("*").gte("date", start).lte("date", end),
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
    const saved = await db.rpc("finish_soulmate_profit_sync", { p_owner: owner, p_revision: settings.revision, p_rows: rows, p_spend: spend, p_refunds: refunds });
    if (saved.error) throw new Error("Unable to save refreshed figures. Reporting settings may have changed; try again.");
    return { start, end };
  } finally {
    await db.from("soulmate_admin_settings").update({ sync_owner: null, sync_until: null }).eq("id", true).eq("sync_owner", owner);
  }
}
