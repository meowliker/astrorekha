// Restore checkout product metadata overwritten by the profit-sheet PayU sync.
// Run without --apply to review counts; --apply updates only matching payment IDs.
require("dotenv").config({ path: process.env.ENV_FILE || ".env.local" });
const { createClient } = require("@supabase/supabase-js");

const since = process.argv.find((arg) => /^\d{4}-\d{2}-\d{2}$/.test(arg)) || "2026-10-10";
const apply = process.argv.includes("--apply");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function readAll(table, columns, configure) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await configure(supabase.from(table).select(columns))
      .order("created_at", { ascending: true }).range(offset, offset + 499);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 500) return rows;
  }
}

async function main() {
  const start = `${since}T00:00:00Z`;
  const [events, payments] = await Promise.all([
    readAll("marketing_events", "payment_id,product_type,product_id,metadata,created_at", (q) =>
      q.eq("event_name", "checkout_started").gte("created_at", start)),
    readAll("payments", "id,payu_txn_id,type,bundle_id,feature,coins,created_at", (q) =>
      q.gte("created_at", start)),
  ]);
  const eventByPayment = new Map();
  for (const event of events) {
    if (event.payment_id && !eventByPayment.has(event.payment_id)) eventByPayment.set(event.payment_id, event);
  }

  const changes = [];
  let missingEvents = 0;
  let matchedPayments = 0;
  const paymentById = new Map(payments.map((payment) => [payment.id, payment]));
  for (const payment of payments) {
    const isRefund = payment.id.startsWith("pay_refund_");
    if (!isRefund && payment.id !== payment.payu_txn_id) continue;
    const parent = isRefund ? paymentById.get(payment.payu_txn_id) : null;
    const event = eventByPayment.get(isRefund ? parent?.id : payment.id);
    if (!event) { missingEvents++; continue; }
    matchedPayments++;
    const rawCoins = event.metadata?.coins;
    const parsedCoins = rawCoins == null ? null : Number.parseInt(String(rawCoins), 10);
    const expected = {
      type: event.product_type || "unknown",
      bundle_id: event.product_id || null,
      feature: event.metadata?.feature || null,
      coins: Number.isFinite(parsedCoins) ? parsedCoins : null,
    };
    if (Object.entries(expected).some(([key, value]) => payment[key] !== value)) {
      changes.push({ id: payment.id, payuTxnId: payment.payu_txn_id, currentType: payment.type, expected });
    }
  }

  const summary = {
    since, checkoutEvents: events.length, payments: payments.length,
    matchedPayments,
    missingEvents, changes: changes.length,
    byExpectedType: changes.reduce((counts, row) => {
      counts[row.expected.type] = (counts[row.expected.type] || 0) + 1;
      return counts;
    }, {}),
  };
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", ...summary }, null, 2));
  if (!apply) return;

  for (const row of changes) {
    const { data, error } = await supabase.from("payments").update(row.expected)
      .eq("id", row.id).eq("payu_txn_id", row.payuTxnId).select("id");
    if (error || data?.length !== 1) throw new Error(`Unable to repair ${row.id}: ${error?.message || "row mismatch"}`);
  }
  console.log(`Verified ${changes.length} payment rows restored from checkout events.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
