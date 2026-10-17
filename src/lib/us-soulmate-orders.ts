/** Kept independent from the main app's products and payments ledger. */
export const US_SOULMATE_FUNNEL = "us_soulmate_standalone";
export const US_SOULMATE_ORDER_PREFIX = "us_sm_";
export const US_SOULMATE_ORDERS_TABLE = "us_soulmate_orders";

export function isSoulmateTransaction(row: { txnid?: unknown; payu_txn_id?: unknown; udf2?: unknown; funnel?: unknown }) {
  return String(row.txnid || row.payu_txn_id || "").startsWith(US_SOULMATE_ORDER_PREFIX) ||
    row.udf2 === US_SOULMATE_FUNNEL || row.funnel === US_SOULMATE_FUNNEL;
}
