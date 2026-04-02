export type FinancialEventKind = "sale" | "refund" | "ignore";

export interface FinancialEvent {
  kind: FinancialEventKind;
  amount: number; // absolute amount in INR
  signedAmount: number; // +amount for sale, -amount for refund, 0 for ignore
  status: string;
}

const SALE_STATUSES = new Set(["paid", "success", "captured", "settled"]);
const REFUND_KEYWORDS = [
  "refund",
  "refunded",
  "refund_success",
  "refundinitiated",
  "chargeback",
  "reversal",
  "reversed",
];

function toNumber(value: unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function hasRefundKeyword(value: unknown): boolean {
  const text = String(value || "").toLowerCase();
  return REFUND_KEYWORDS.some((keyword) => text.includes(keyword));
}

export function normalizeFinanceStatus(status: unknown): string {
  return String(status || "").trim().toLowerCase();
}

export function isRefundLikeStatus(status: unknown): boolean {
  return hasRefundKeyword(status);
}

export function isSaleLikeStatus(status: unknown): boolean {
  return SALE_STATUSES.has(normalizeFinanceStatus(status));
}

export function classifyStoredPaymentEvent(status: unknown, amountInPaise: unknown): FinancialEvent {
  const normalizedStatus = normalizeFinanceStatus(status);
  const rawPaise = toNumber(amountInPaise);
  const amount = Math.abs(rawPaise) / 100;

  // Negative rows are treated as refunds regardless of status label.
  if (rawPaise < 0 || isRefundLikeStatus(normalizedStatus)) {
    return {
      kind: amount > 0 ? "refund" : "ignore",
      amount,
      signedAmount: amount > 0 ? -amount : 0,
      status: normalizedStatus,
    };
  }

  if (isSaleLikeStatus(normalizedStatus)) {
    return {
      kind: amount > 0 ? "sale" : "ignore",
      amount,
      signedAmount: amount > 0 ? amount : 0,
      status: normalizedStatus,
    };
  }

  return {
    kind: "ignore",
    amount: 0,
    signedAmount: 0,
    status: normalizedStatus,
  };
}

export function classifyPayUEvent(txn: Record<string, unknown>): FinancialEvent {
  const status = normalizeFinanceStatus(txn?.status);
  // Some PayU records can report amount=0 but carry the paid value in transaction_fee.
  const grossAmount = Math.abs(toNumber(txn?.amount) || toNumber(txn?.amt) || toNumber(txn?.transaction_fee));
  const netAmount = Math.abs(toNumber(txn?.net_amount_debit));
  const resolvedAmount = grossAmount > 0 ? grossAmount : netAmount;

  const looksRefund =
    isRefundLikeStatus(status) ||
    hasRefundKeyword(txn?.field9) ||
    hasRefundKeyword(txn?.error_Message) ||
    hasRefundKeyword(txn?.unmappedstatus);

  if (looksRefund) {
    return {
      kind: resolvedAmount > 0 ? "refund" : "ignore",
      amount: resolvedAmount,
      signedAmount: resolvedAmount > 0 ? -resolvedAmount : 0,
      status,
    };
  }

  if (isSaleLikeStatus(status)) {
    return {
      kind: resolvedAmount > 0 ? "sale" : "ignore",
      amount: resolvedAmount,
      signedAmount: resolvedAmount > 0 ? resolvedAmount : 0,
      status,
    };
  }

  return {
    kind: "ignore",
    amount: 0,
    signedAmount: 0,
    status,
  };
}
