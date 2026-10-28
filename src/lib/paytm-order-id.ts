import { randomBytes } from "node:crypto";

// Paytm accepts up to 50 characters, but forwards orderId as the UPI QR's
// `tr` reference, which must fit in 35. Keep new report orders alphanumeric.
export function createPaytmOrderId(): string {
  return `ptm${randomBytes(12).toString("hex")}`;
}

export function isPaytmReportOrderId(id: string): boolean {
  // Keep old references readable for callbacks, reconciliation and refunds.
  return /^ptm[a-f0-9]{24}$/.test(id) || /^ptm_[a-zA-Z0-9]{1,46}$/.test(id);
}

export function isPaytmOrderId(id: string): boolean {
  return isPaytmReportOrderId(id) || /^sm_[a-f0-9]{20}$/.test(id);
}
