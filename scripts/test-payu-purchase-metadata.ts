import assert from "node:assert/strict";
import { parentPaymentId, purchaseMetadata } from "../src/lib/payu-purchase-metadata";
import type { PayUTransaction } from "../src/lib/payu-api";

const saved = {
  id: "pay_test123",
  type: "bundle",
  bundle_id: "palm-birth-sketch",
  feature: null,
  coins: null,
  customer_email: null,
};
const current = {
  txnid: "pay_test123",
  udf1: "CBO Campaign",
  udf2: "Broad Ad Set",
  udf3: "Creative 1",
  udf4: "pay_test123",
} as PayUTransaction;

assert.equal(parentPaymentId(current), saved.id);
assert.deepEqual(purchaseMetadata(current, saved), {
  type: "bundle", bundle_id: "palm-birth-sketch", feature: null, coins: null,
});
assert.equal(purchaseMetadata(current).type, "unknown");
assert.notEqual(purchaseMetadata(current).type, "Broad Ad Set");

const legacy = {
  txnid: "legacy123",
  udf2: "report",
  udf3: "soulmate-sketch",
  udf4: "soulmateSketch",
  udf5: "",
} as PayUTransaction;
assert.equal(parentPaymentId(legacy), "pay_legacy123");
assert.deepEqual(purchaseMetadata(legacy), {
  type: "report", bundle_id: "soulmate-sketch", feature: "soulmateSketch", coins: null,
});

// Refund transactions retain the parent txnid; they must use its saved product type.
assert.equal(purchaseMetadata({ ...current, status: "refund_success" }, saved).type, "bundle");
console.log("PayU purchase metadata regression checks passed.");
