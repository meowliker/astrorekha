import { isStandaloneSoulmatePayment } from "./admin-order-funnel";
import type { SupabaseClient } from "@supabase/supabase-js";
import { matchesAdSource, type AdSource, type AcquisitionFunnel, type Attribution } from "./admin-acquisition";

type GatewayTotals = { received: number; refunds: number; salesCount: number; refundCount: number };
export type SourceFinanceDay = { date: string; received: number; refund: number; orders: number; refunds: number; bundleReceived: number; bundleRefund: number; bundleOrders: number; salesTax: number; gateways: Record<string, GatewayTotals> };
const shift = (date: string, days: number) => new Date(Date.parse(date) + days * 86400000).toISOString().slice(0, 10);
const fields = "id,payu_txn_id,landing_url,landing_path,amount,currency,payment_status,type,created_at,fulfilled_at,utm_source,utm_medium,utm_campaign,meta_campaign_id,meta_adset_id,meta_ad_id,last_touch,gateway,payment_mode";
/** Rebuild a read-only source view. Never write filtered values into the shared profit ledger. Amounts are minor units. */
export async function readAdSourceFinance(db: SupabaseClient, funnel: AcquisitionFunnel, source: AdSource, start: string, end: string, mode = "business_1130_ist") {
  if (![start, end].every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d) || end < start || Date.parse(end) - Date.parse(start) >= 366 * 86400000) throw new Error("Choose a valid date range of up to 366 days.");
  const offset = mode === "calendar_ist" ? 330 : -360;
  const from = new Date(Date.parse(start) - offset * 60000).toISOString(), to = new Date(Date.parse(shift(end, 1)) - offset * 60000).toISOString();
  const days = new Map<string, SourceFinanceDay>();
  for (let d = start; d <= end; d = shift(d, 1)) days.set(d, { date: d, received: 0, refund: 0, orders: 0, refunds: 0, bundleReceived: 0, bundleRefund: 0, bundleOrders: 0, salesTax: 0, gateways: {} });
  const day = (at: string) => days.get(new Date(Date.parse(at) + offset * 60000).toISOString().slice(0, 10));
  const main = funnel === "astrorekha", us = funnel === "us-soulmate", usMain = funnel === "us-main";
  const table = main ? "payments" : usMain ? "us_main_orders" : us ? "us_soulmate_orders" : "soulmate_orders";
  const select = main ? fields : usMain ? "id,amount_cents,paid_amount_cents,type,paid_at,attribution" : "id,amount,gst_amount,paid_at,attribution,plan";
  const all = new Map<string, Attribution>();
  const seen = new Set<string>();
  for (const fallback of main ? [false, true] : [false]) {
    const timestamp = main ? fallback ? "created_at" : "fulfilled_at" : "paid_at";
    for (let page = 0; ; page += 1000) {
      if (page >= 100000) throw new Error("Choose fewer days; the financial report is too large.");
      let query = db.from(table).select(select).gte(timestamp, from).lt(timestamp, to);
      if (main) {
        query = query.in("payment_status", ["paid", "success", "captured"]);
        if (fallback) query = query.is("fulfilled_at", null);
      } else {
        query = query.eq("payment_status", "paid").eq("payment_mode", "live").eq("attribution->>trackingEnvironment", "production");
        if (!usMain) query = query.eq("funnel", us ? "us_soulmate_standalone" : "soulmate_standalone");
      }
      const result = await query.order(timestamp).order("id").range(page, page + 999);
      if (result.error) throw new Error("Unable to read complete source sales.");
      for (const row of result.data as unknown as Attribution[]) {
        if (String(row.id).startsWith("pay_refund_") || main && isStandaloneSoulmatePayment(row)) continue;
        all.set(String(row.id), row); if (row.payu_txn_id) all.set(String(row.payu_txn_id), row);
        if (row.payment_mode === "test" || !matchesAdSource(row, source)) continue;
        const id = String(row.payu_txn_id || row.id); if (seen.has(id)) continue; seen.add(id);
        if (main && row.currency && row.currency !== "INR") throw new Error("Source profit requires INR payments; another currency was found.");
        const amount = Number(usMain ? row.paid_amount_cents ?? row.amount_cents : row.amount); if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("Invalid payment amount.");
        const target = day(String(row[timestamp])); if (!target) continue;
        target.received += amount; target.orders++;
        if (main) {
          const key = String(row.gateway || "payu");
          const total = target.gateways[key] ||= { received: 0, refunds: 0, salesCount: 0, refundCount: 0 };
          total.received += amount; total.salesCount++;
        }
        if (["bundle", "bundle_payment"].includes(String(row.type))) { target.bundleReceived += amount; target.bundleOrders++; }
        if (!main) target.salesTax += Number(row.gst_amount || 0);
      }
      if (result.data.length < 1000) break;
    }
  }
  const refundTable = main ? "payments" : usMain ? "us_main_refund_events" : us ? "us_soulmate_refund_events" : "soulmate_refund_events";
  for (let page = 0; ; page += 1000) {
    if (page >= 100000) throw new Error("Choose fewer days; the refund report is too large.");
    let query = db.from(refundTable).select(main ? fields : "event_id,order_id,date,amount_paise,gst_paise");
    query = main ? query.like("id", "pay_refund_%").gte("created_at", from).lt("created_at", to).order("created_at").order("id") : query.gte("date", start).lte("date", end).order("date").order("event_id");
    const result = await query.range(page, page + 999);
    if (result.error) throw new Error("Unable to read complete source refunds.");
    const rows = result.data as unknown as Attribution[];
    const ids = [...new Set(rows.map((r) => String(main ? r.payu_txn_id || "" : r.order_id)).filter(Boolean))];
    for (let i = 0; i < ids.length; i += 200) {
      const group = ids.slice(i, i + 200); const variants = [...new Set(group.flatMap((id) => [id, `pay_${id}`]))];
      for (const key of main ? ["id", "payu_txn_id"] : ["id"]) {
        const parents = await db.from(table).select(select).in(key, variants);
        if (parents.error) throw new Error("Unable to attribute refunded orders.");
        for (const row of parents.data as unknown as Attribution[]) { if (String(row.id).startsWith("pay_refund_") || Number(row.amount) < 0) continue; all.set(String(row.id), row); if (row.payu_txn_id) all.set(String(row.payu_txn_id), row); }
      }
    }
    for (const row of rows) {
      if (main && !/refund|chargeback|reversal/i.test(String(row.payment_status))) continue;
      const id = String(main ? row.payu_txn_id || "" : row.order_id);
      const parent = all.get(id) || all.get(`pay_${id}`);
      if (!parent || parent.payment_mode === "test" || (main && isStandaloneSoulmatePayment(parent)) || !matchesAdSource(parent, source)) continue;
      const target = main ? day(String(row.created_at)) : days.get(String(row.date)); if (!target) continue;
      const amount = Math.abs(Number(main ? row.amount : row.amount_paise));
      if (!Number.isSafeInteger(amount)) throw new Error("Invalid refund amount.");
      target.refund += amount; target.refunds++;
      if (main) {
        const key = String(parent.gateway || "payu");
        const total = target.gateways[key] ||= { received: 0, refunds: 0, salesCount: 0, refundCount: 0 };
        total.refunds += amount; total.refundCount++;
      }
      if (["bundle", "bundle_payment"].includes(String(parent.type))) target.bundleRefund += amount;
      if (!main) target.salesTax -= Number(row.gst_paise || 0);
    }
    if (rows.length < 1000) break;
  }
  return [...days.values()];
}
