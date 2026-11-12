import { db, checked } from "./auth";
import { FEATURES, SupportError } from "./policy";
import { verifyPayUTransaction } from "@/lib/payu-api";
import { fetchPaytmStatus, validatePaytmStatus } from "@/lib/paytm-api";
import { fetchPineLabsOrder, validatePineLabsOrder } from "@/lib/pinelabs-api";
const bundles: Record<string, { features: string[]; coins: number }> = {
  "palm-reading": { features: ["palmReading"], coins: 15 },
  "palm-birth": { features: ["palmReading", "birthChart"], coins: 15 },
  "palm-birth-compat": {
    features: [
      "palmReading",
      "birthChart",
      "compatibilityTest",
      "futurePartnerReport",
    ],
    coins: 30,
  },
  "palm-birth-sketch": {
    features: [
      "palmReading",
      "birthChart",
      "soulmateSketch",
      "futurePartnerReport",
    ],
    coins: 30,
  },
  "palm-birth-sketch-aura-astro": {
    features: [
      "palmReading",
      "birthChart",
      "soulmateSketch",
      "futurePartnerReport",
      "auraColorReport",
      "astrocartographyReport",
      "pastLifeReport",
    ],
    coins: 60,
  },
};
export async function paymentFor(
  id: string,
  userId: string,
  allowUnmapped = false,
) {
  const row = checked(
    await db().from("payments").select("*").eq("id", id).maybeSingle(),
  );
  if (
    !row ||
    row.id.startsWith("pay_refund_") ||
    (!allowUnmapped && row.user_id !== userId) ||
    (allowUnmapped && row.user_id && row.user_id !== userId)
  )
    throw new SupportError(
      "Payment is not assigned to this customer. Investigate its ownership first.",
    );
  if (
    allowUnmapped &&
    !row.user_id &&
    ["paytm", "pinelabs"].includes(row.gateway)
  )
    throw new SupportError(
      "This gateway locks the original order identity. Developer-assisted mapping is required.",
    );
  if (
    ["refunded", "chargeback", "partially_refunded"].includes(
      row.payment_status,
    )
  )
    throw new SupportError("Payment needs owner investigation.");
  return row;
}
export function purchaseBenefits(row: Record<string, unknown>) {
  let features: string[] = [],
    coins = 0;
  if (Array.isArray(row.fulfillment_features)) {
    features = row.fulfillment_features;
    coins = Number(row.fulfillment_coins);
  } else if (["bundle", "bundle_payment"].includes(String(row.type))) {
    const bundle = bundles[String(row.bundle_id)];
    if (!bundle)
      throw new SupportError("Unknown bundle. Developer review required.");
    ({ features, coins } = bundle);
  } else if (row.type === "coins") coins = Number(row.coins);
  else if (typeof row.feature === "string" && row.feature)
    features = row.feature.split(",").map((x) => x.trim());
  else
    throw new SupportError(
      "This purchase type needs a dedicated recovery workflow.",
    );
  if (
    !features.every((x) => (FEATURES as readonly string[]).includes(x)) ||
    !Number.isSafeInteger(coins) ||
    coins < 0 ||
    coins > 100000
  )
    throw new SupportError(
      "Purchase benefits are ambiguous. Owner investigation required.",
    );
  return { features, coins };
}
export async function verifyPurchase(
  row: Awaited<ReturnType<typeof paymentFor>>,
) {
  let transactionId: string | undefined;
  if (row.gateway === "pinelabs") {
    const remote = await fetchPineLabsOrder(row.id, row.payment_mode);
    const verified = validatePineLabsOrder(row, remote);
    if (verified.status !== "paid")
      throw new SupportError(
        "The gateway has not confirmed a settled payment. Keep this case open.",
      );
    transactionId = verified.transactionId;
  } else if (row.gateway === "paytm") {
    const remote = await fetchPaytmStatus(row.id, row.payment_mode);
    const verified = validatePaytmStatus(row, remote);
    if (verified !== "paid")
      throw new SupportError(
        "The gateway has not confirmed a settled payment. Keep this case open.",
      );
    transactionId = remote.txnId;
  } else if ((!row.gateway || row.gateway === "payu") && row.payu_txn_id) {
    const remote = await verifyPayUTransaction(row.payu_txn_id);
    if (
      !remote ||
      remote.txnid !== row.payu_txn_id ||
      !["success", "captured", "paid"].includes(
        String(remote.status).toLowerCase(),
      ) ||
      Math.round(Number(remote.amt ?? remote.transaction_amount) * 100) !==
        row.amount ||
      (row.payu_payment_id && remote.mihpayid !== row.payu_payment_id)
    )
      throw new SupportError(
        "Gateway payment verification did not match this order. Keep this case open.",
      );
    transactionId = remote.mihpayid;
  } else
    throw new SupportError(
      "This gateway needs manual verification. Access has not been changed.",
    );
  if (!transactionId)
    throw new SupportError("Gateway transaction reference missing");
  return { transactionId, ...purchaseBenefits(row) };
}
