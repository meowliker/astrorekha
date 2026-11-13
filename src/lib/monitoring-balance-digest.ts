import type { SupabaseClient } from "@supabase/supabase-js";
import { collectAdBalanceChecks, buildDailyBalanceAlert, dailyBalanceSlot } from "./monitoring-ad-balances";
import { readMonitoringAlertsPaused } from "./monitoring-delivery";
import { deliverMonitoringMessage } from "./system-monitoring";

export async function runDailyBalanceDigest(db: SupabaseClient, now = new Date()) {
  const slot = dailyBalanceSlot(now);
  if (!slot) return { skipped: true, reason: "Outside the 6 PM IST delivery window" };
  // Fail closed if pause settings cannot be read, just like regular alerts.
  if (await readMonitoringAlertsPaused(db)) return { skipped: true, reason: "All alerts are paused" };
  const date = slot.slice("ad-balances:".length);
  const { error } = await db.from("monitoring_balance_digests").insert({ date });
  if (error?.code === "23505") return { skipped: true, reason: "Today's balance summary was already started" };
  if (error) throw new Error("Unable to reserve the daily balance summary");
  try {
    const checks = await collectAdBalanceChecks(db, now.getTime());
    const delivered = await deliverMonitoringMessage(db, null, [{ key: "meta_balance_daily", event: "summary" }],
      buildDailyBalanceAlert(checks, now), false, true);
    const { error: saveError } = await db.from("monitoring_balance_digests").update({
      status: delivered > 0 ? "sent" : "not_delivered", checks, delivered, finished_at: new Date().toISOString(),
    }).eq("date", date);
    if (saveError) throw new Error("Unable to save daily balance summary result");
    return { date, delivered, accounts: checks.length };
  } catch {
    await db.from("monitoring_balance_digests").update({ status: "failed", finished_at: new Date().toISOString() }).eq("date", date);
    throw new Error("Daily balance summary failed");
  }
}
