// Recalculate a saved 11:30 IST profit-sheet row from the payments it already includes.
// The gross sale and refund totals must match before this script can update bundle fields.
require("dotenv").config({ path: process.env.ENV_FILE || ".env.local" });
const { createClient } = require("@supabase/supabase-js");

const date = process.argv.find((arg) => /^\d{4}-\d{2}-\d{2}$/.test(arg));
if (!date) throw new Error("Provide a YYYY-MM-DD profit-sheet date.");
const apply = process.argv.includes("--apply");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data: sheet, error: sheetError } = await supabase.from("profit_sheet")
    .select("date,synced_at,gross_revenue,refund_amount,ads_cost_inr,bundle_purchases,bundle_revenue,roas")
    .eq("date", date).single();
  if (sheetError) throw sheetError;

  const start = `${date}T06:00:00Z`; // Profit Sheet business day begins at 11:30 IST.
  const next = new Date(`${date}T06:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const end = sheet.synced_at < next.toISOString() ? sheet.synced_at : next.toISOString();
  const payments = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from("payments")
      .select("id,type,amount,payment_status,created_at")
      .gte("created_at", start).lte("created_at", end)
      .order("created_at", { ascending: true }).range(offset, offset + 499);
    if (error) throw error;
    payments.push(...(data || []));
    if (!data || data.length < 500) break;
  }
  const sales = payments.filter((p) => p.payment_status === "paid" && !p.id.startsWith("pay_refund_"));
  const refunds = payments.filter((p) => p.id.startsWith("pay_refund_") && p.payment_status.includes("refund"));
  const sumPaise = (rows) => rows.reduce((sum, row) => sum + row.amount, 0);
  const gross = sumPaise(sales) / 100;
  const refund = sumPaise(refunds) / 100;
  if (Math.abs(gross - Number(sheet.gross_revenue)) > 0.01 ||
      Math.abs(refund - Number(sheet.refund_amount)) > 0.01) {
    throw new Error(`Saved row has different sale/refund totals (payments ${gross}/${refund}; sheet ${sheet.gross_revenue}/${sheet.refund_amount}). Refresh from PayU first.`);
  }
  const isBundle = (p) => p.type === "bundle" || p.type === "bundle_payment";
  const bundlePurchases = sales.filter(isBundle).length;
  const bundleRevenue = (sumPaise(sales.filter(isBundle)) - sumPaise(refunds.filter(isBundle))) / 100;
  const roas = Number(sheet.ads_cost_inr) > 0 ? bundleRevenue / Number(sheet.ads_cost_inr) : 0;
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", date, sales: sales.length,
    grossRevenue: gross, refunds: refunds.length, refundAmount: refund,
    before: { bundlePurchases: sheet.bundle_purchases, bundleRevenue: sheet.bundle_revenue, roas: sheet.roas },
    after: { bundlePurchases, bundleRevenue, roas } }, null, 2));
  if (!apply) return;

  const { data, error } = await supabase.from("profit_sheet")
    .update({ bundle_purchases: bundlePurchases, bundle_revenue: bundleRevenue, roas, updated_at: new Date().toISOString() })
    .eq("date", date).eq("synced_at", sheet.synced_at).select("date,bundle_purchases,bundle_revenue,roas");
  if (error || data?.length !== 1) throw new Error(`Sheet changed during recalculation: ${error?.message || "row mismatch"}`);
  console.log("Verified saved profit-sheet row:", JSON.stringify(data[0]));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
