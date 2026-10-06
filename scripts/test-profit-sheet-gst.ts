import assert from "node:assert/strict";
import { calculateProfitSheetGst, indianAdGstApplies } from "../src/lib/profit-sheet-gst";

const octoberExample = calculateProfitSheetGst(148559.28, 0.18, 51119.63 + 29261.27);
assert.deepEqual(octoberExample, {
  revenueGst: 26740.67,
  adGstCredit: 14468.56,
  gst: 12272.11,
});
assert.deepEqual(calculateProfitSheetGst(1000, 0.05, 0), {
  revenueGst: 50,
  adGstCredit: 0,
  gst: 50,
});
assert.deepEqual(calculateProfitSheetGst(0, 0.18, 100), {
  revenueGst: 0,
  adGstCredit: 18,
  gst: -18,
});
assert.equal(indianAdGstApplies("2026-09-30"), false);
assert.equal(indianAdGstApplies("2026-10-01"), true);

console.log("Profit Sheet GST calculations passed.");
