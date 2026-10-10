import type { PayUTransaction } from "@/lib/payu-api";

export type SavedPurchaseMetadata = {
  id: string;
  type: string;
  bundle_id: string | null;
  feature: string | null;
  coins: number | null;
  customer_email: string | null;
};

export function parentPaymentId(txn: Pick<PayUTransaction, "txnid">): string | null {
  const txnid = String(txn.txnid || "").trim();
  return txnid ? (txnid.startsWith("pay_") ? txnid : `pay_${txnid}`) : null;
}

export function purchaseMetadata(txn: PayUTransaction, saved?: SavedPurchaseMetadata) {
  // Current PayU UDFs contain campaign, ad set, ad, and order ID, not product details.
  if (String(txn.udf4 || "").trim() === String(txn.txnid || "").trim()) {
    return {
      type: String(saved?.type || "unknown").trim().toLowerCase(),
      bundle_id: saved?.bundle_id ?? null,
      feature: saved?.feature ?? null,
      coins: saved?.coins ?? null,
    };
  }

  // Older PayU requests put the product type, bundle, and feature in udf2-4.
  const parsedCoins = Number.parseInt(String(txn.udf5 || ""), 10);
  return {
    type: String(saved?.type || txn.udf2 || "bundle").trim().toLowerCase(),
    bundle_id: saved?.bundle_id ?? (String(txn.udf3 || "").trim() || null),
    feature: saved?.feature ?? (String(txn.udf4 || "").trim() || null),
    coins: saved?.coins ?? (Number.isFinite(parsedCoins) ? parsedCoins : null),
  };
}
