/** Kept independent from the main app's products and payments ledger. */
export const SOULMATE_FUNNEL = "soulmate_standalone";
export const SOULMATE_ORDER_PREFIX = "sm_";
export const SOULMATE_ORDERS_TABLE = "soulmate_orders";

export function isSoulmateTransaction(row: { txnid?: unknown; payu_txn_id?: unknown; udf2?: unknown; funnel?: unknown }) {
  return String(row.txnid || row.payu_txn_id || "").startsWith(SOULMATE_ORDER_PREFIX) ||
    row.udf2 === SOULMATE_FUNNEL || row.funnel === SOULMATE_FUNNEL;
}
