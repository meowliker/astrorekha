import crypto from "crypto";
import { classifyPayUEvent } from "@/lib/finance-events";

const PAYU_BASE_URL = process.env.PAYU_MODE === "live"
  ? "https://info.payu.in/merchant/postservice.php?form=2"
  : "https://test.payu.in/merchant/postservice.php?form=2";

export interface PayUTransaction {
  mihpayid?: string;
  id?: string;
  txnid: string;
  amount: string;
  status: string;
  mode: string;
  email: string;
  phone: string;
  firstname: string;
  productinfo: string;
  addedon: string;
  udf1: string; // userId
  udf2: string; // type (bundle, upsell, coins)
  udf3: string; // bundleId
  udf4: string; // feature
  udf5: string; // coins
  bank_ref_num?: string;
  bank_ref_no?: string;
  bankcode: string;
  error_code: string;
  error_Message: string;
  net_amount_debit?: string;
  transaction_fee?: string;
  discount: string;
  offer_key: string;
  offer_type: string;
  offer_availed: string;
  field9: string; // Transaction message
  unmappedstatus?: string;
}

interface PayUTransactionResponse {
  status: number;
  msg: string;
  Transaction_details: PayUTransaction[];
}

interface PayURefundRecord {
  PayuID?: string;
  RequestID?: string;
  RefundToken?: string;
  Amount?: string;
  Status?: string;
  RefundCreationDate?: string;
  success_at?: string;
  bank_ref_no?: string;
  bank_arn?: string;
}

interface PayURefundResponse {
  status: number;
  msg: string;
  "Refund Details"?: Record<string, PayURefundRecord[] | PayURefundRecord>;
}

const PAYU_MAX_DAYS_PER_CHUNK = 7;
const PAYU_MAX_RETRIES = 4;
const PAYU_RETRY_BASE_DELAY_MS = 1200;
const PAYU_MIN_REQUEST_INTERVAL_MS = 900;
const PAYU_CHUNK_CACHE_TTL_MS = 5 * 60 * 1000;
const PAYU_RANGE_CACHE_TTL_MS = 90 * 1000;
const PAYU_REFUND_CACHE_TTL_MS = 5 * 60 * 1000;
const PAYU_REFUND_BATCH_SIZE = 25;

type CacheEntry<T> = { ts: number; data: T };
const payuChunkCache = new Map<string, CacheEntry<PayUTransaction[]>>();
const payuRangeCache = new Map<string, CacheEntry<PayUTransaction[]>>();
const payuRefundBatchCache = new Map<string, CacheEntry<PayURefundRecord[]>>();
let payuRateLimitedUntil = 0;
let lastPayURequestAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitMessage(msg: unknown): boolean {
  const text = String(msg || "").toLowerCase();
  return text.includes("request") && text.includes("limit");
}

function getFreshCache<T>(entry: CacheEntry<T> | undefined, ttlMs: number): T | null {
  if (!entry) return null;
  if (Date.now() - entry.ts > ttlMs) return null;
  return entry.data;
}

function generateHash(params: string): string {
  return crypto.createHash("sha512").update(params).digest("hex");
}

function normalizeToken(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeAmountToken(value: unknown): string {
  const amount = Number(value ?? NaN);
  return Number.isFinite(amount) ? amount.toFixed(2) : "";
}

function toNumber(value: unknown): number {
  const amount = Number(value ?? NaN);
  return Number.isFinite(amount) ? amount : 0;
}

function toIsoAmountToken(value: unknown): string {
  return toNumber(value).toFixed(2);
}

function normalizePayUDateTime(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const parsed = new Date(text.replace(" ", "T") + "+05:30");
  return Number.isNaN(parsed.getTime()) ? "" : text;
}

function getRefundDuplicateKey(txnid: string, payuId: string, amount: number): string {
  return `${normalizeToken(txnid)}|${normalizeToken(payuId)}|${amount.toFixed(2)}`;
}

function parseRefundDetails(data: PayURefundResponse): PayURefundRecord[] {
  const container = data?.["Refund Details"];
  if (!container || typeof container !== "object") return [];

  const rows: PayURefundRecord[] = [];
  for (const value of Object.values(container)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === "object") rows.push(item);
      }
      continue;
    }
    if (value && typeof value === "object") {
      rows.push(value);
    }
  }
  return rows;
}

export function getPayUPaymentId(txn: Partial<PayUTransaction>): string {
  const value = (txn as any)?.mihpayid ?? (txn as any)?.id ?? "";
  return String(value || "").trim();
}

export function getPayUEventFingerprint(txn: Partial<PayUTransaction>): string {
  return [
    normalizeToken(txn?.txnid),
    normalizeToken(getPayUPaymentId(txn)),
    normalizeToken((txn as any)?.status),
    normalizeToken((txn as any)?.addedon),
    normalizeAmountToken((txn as any)?.amount),
    normalizeAmountToken((txn as any)?.amt),
    normalizeAmountToken((txn as any)?.transaction_fee),
    normalizeToken((txn as any)?.field9),
    normalizeToken((txn as any)?.error_Message),
    normalizeToken((txn as any)?.unmappedstatus),
  ].join("|");
}

export async function getPayUTransactions(
  fromDate: string, // Format: YYYY-MM-DD
  toDate: string,   // Format: YYYY-MM-DD
  fromTime?: string, // Format: HH:MM:SS (optional)
  toTime?: string    // Format: HH:MM:SS (optional)
): Promise<PayUTransaction[]> {
  const rangeCacheKey = `${fromDate}|${toDate}|${fromTime || ""}|${toTime || ""}`;
  const freshRange = getFreshCache(payuRangeCache.get(rangeCacheKey), PAYU_RANGE_CACHE_TTL_MS);
  if (freshRange) {
    return freshRange;
  }

  const merchantKey = process.env.PAYU_MERCHANT_KEY;
  const merchantSalt = process.env.PAYU_MERCHANT_SALT;

  if (!merchantKey || !merchantSalt) {
    throw new Error("PayU credentials not configured");
  }

  // If caller provides specific time boundaries, run a single request.
  if (fromTime || toTime) {
    const fromDateTime = fromTime ? `${fromDate} ${fromTime}` : `${fromDate} 00:00:00`;
    const toDateTime = toTime ? `${toDate} ${toTime}` : `${toDate} 23:59:59`;
    const single = await fetchPayUTransactionsChunk(merchantKey, merchantSalt, fromDateTime, toDateTime);
    const enrichedSingle = await enrichTransactionsWithRefundDetails(merchantKey, merchantSalt, single);
    payuRangeCache.set(rangeCacheKey, { ts: Date.now(), data: enrichedSingle });
    return enrichedSingle;
  }

  // PayU postservice is most reliable when queried in <= 7-day chunks.
  const startDate = new Date(`${fromDate}T00:00:00Z`);
  const endDate = new Date(`${toDate}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error("Invalid date range for PayU fetch");
  }

  const allTransactions: PayUTransaction[] = [];
  const seenEventKeys = new Set<string>();
  let currentStart = new Date(startDate);

  while (currentStart.getTime() <= endDate.getTime()) {
    const currentEnd = new Date(currentStart);
    currentEnd.setUTCDate(currentEnd.getUTCDate() + (PAYU_MAX_DAYS_PER_CHUNK - 1));
    if (currentEnd > endDate) {
      currentEnd.setTime(endDate.getTime());
    }

    const chunkFromDate = toYMD(currentStart);
    const chunkToDate = toYMD(currentEnd);
    const chunkTransactions = await fetchPayUTransactionsChunk(
      merchantKey,
      merchantSalt,
      chunkFromDate,
      chunkToDate
    );

    for (const txn of chunkTransactions) {
      const eventKey = getPayUEventFingerprint(txn);
      if (seenEventKeys.has(eventKey)) continue;
      seenEventKeys.add(eventKey);
      allTransactions.push(txn);
    }

    // Advance from the actual chunk end date to avoid month-boundary regressions
    // (e.g. Mar 30 -> Apr 1 should advance to Apr 2, not Mar 2).
    const nextStart = new Date(currentEnd);
    nextStart.setUTCDate(nextStart.getUTCDate() + 1);

    if (nextStart.getTime() <= currentStart.getTime()) {
      throw new Error(
        `PayU chunk iteration did not advance (current=${toYMD(currentStart)}, next=${toYMD(nextStart)})`
      );
    }

    currentStart = nextStart;
  }

  const enrichedTransactions = await enrichTransactionsWithRefundDetails(
    merchantKey,
    merchantSalt,
    allTransactions
  );
  payuRangeCache.set(rangeCacheKey, { ts: Date.now(), data: enrichedTransactions });
  return enrichedTransactions;
}

async function fetchPayUTransactionsChunk(
  merchantKey: string,
  merchantSalt: string,
  var1: string,
  var2: string
): Promise<PayUTransaction[]> {
  const chunkKey = `${var1}|${var2}`;
  const freshChunk = getFreshCache(payuChunkCache.get(chunkKey), PAYU_CHUNK_CACHE_TTL_MS);
  if (freshChunk) return freshChunk;

  const staleChunk = payuChunkCache.get(chunkKey)?.data || null;

  const command = "get_Transaction_Details";
  const hashString = `${merchantKey}|${command}|${var1}|${merchantSalt}`;
  const hash = generateHash(hashString);

  const formData = new URLSearchParams();
  formData.append("key", merchantKey);
  formData.append("command", command);
  formData.append("var1", var1);
  formData.append("var2", var2);
  formData.append("hash", hash);

  for (let attempt = 1; attempt <= PAYU_MAX_RETRIES; attempt += 1) {
    try {
      const now = Date.now();
      if (payuRateLimitedUntil > now) {
        await sleep(payuRateLimitedUntil - now);
      }
      const sinceLastRequest = now - lastPayURequestAt;
      if (sinceLastRequest < PAYU_MIN_REQUEST_INTERVAL_MS) {
        await sleep(PAYU_MIN_REQUEST_INTERVAL_MS - sinceLastRequest);
      }

      lastPayURequestAt = Date.now();
      const response = await fetch(PAYU_BASE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: formData.toString(),
      });

      const raw = await response.text();
      let data: PayUTransactionResponse;
      try {
        data = JSON.parse(raw) as PayUTransactionResponse;
      } catch {
        throw new Error(`PayU returned non-JSON response: ${raw.slice(0, 200)}`);
      }

      if (data.status === 1 && data.Transaction_details) {
        const details = Array.isArray(data.Transaction_details)
          ? data.Transaction_details
          : Object.values(data.Transaction_details as any);
        const rows = details as PayUTransaction[];
        payuChunkCache.set(chunkKey, { ts: Date.now(), data: rows });
        return rows;
      }

      if (isRateLimitMessage(data.msg)) {
        const delay = PAYU_RETRY_BASE_DELAY_MS * attempt;
        payuRateLimitedUntil = Date.now() + delay;
        if (attempt < PAYU_MAX_RETRIES) {
          await sleep(delay);
          continue;
        }
      }

      const empty: PayUTransaction[] = [];
      payuChunkCache.set(chunkKey, { ts: Date.now(), data: empty });
      return empty;
    } catch (error) {
      const delay = PAYU_RETRY_BASE_DELAY_MS * attempt;
      if (attempt < PAYU_MAX_RETRIES) {
        await sleep(delay);
        continue;
      }
      if (staleChunk) {
        console.warn(`Using stale PayU cache for ${chunkKey} after retries`);
        return staleChunk;
      }
      throw error;
    }
  }

  return staleChunk || [];
}

async function fetchPayURefundDetailsBatch(
  merchantKey: string,
  merchantSalt: string,
  txnIds: string[]
): Promise<PayURefundRecord[]> {
  const cleanTxnIds = txnIds.map((id) => String(id || "").trim()).filter(Boolean);
  if (cleanTxnIds.length === 0) return [];

  const var1 = cleanTxnIds.join("|");
  const cacheKey = `refunds|${var1}`;
  const fresh = getFreshCache(payuRefundBatchCache.get(cacheKey), PAYU_REFUND_CACHE_TTL_MS);
  if (fresh) return fresh;

  const stale = payuRefundBatchCache.get(cacheKey)?.data || null;

  const command = "getAllRefundsFromTxnIds";
  const hashString = `${merchantKey}|${command}|${var1}|${merchantSalt}`;
  const hash = generateHash(hashString);

  const formData = new URLSearchParams();
  formData.append("key", merchantKey);
  formData.append("command", command);
  formData.append("var1", var1);
  formData.append("hash", hash);

  for (let attempt = 1; attempt <= PAYU_MAX_RETRIES; attempt += 1) {
    try {
      const now = Date.now();
      if (payuRateLimitedUntil > now) {
        await sleep(payuRateLimitedUntil - now);
      }
      const sinceLastRequest = now - lastPayURequestAt;
      if (sinceLastRequest < PAYU_MIN_REQUEST_INTERVAL_MS) {
        await sleep(PAYU_MIN_REQUEST_INTERVAL_MS - sinceLastRequest);
      }

      lastPayURequestAt = Date.now();
      const response = await fetch(PAYU_BASE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: formData.toString(),
      });

      const raw = await response.text();
      let data: PayURefundResponse;
      try {
        data = JSON.parse(raw) as PayURefundResponse;
      } catch {
        throw new Error(`PayU refund lookup returned non-JSON response: ${raw.slice(0, 200)}`);
      }

      if (data.status === 1) {
        const rows = parseRefundDetails(data);
        payuRefundBatchCache.set(cacheKey, { ts: Date.now(), data: rows });
        return rows;
      }

      if (isRateLimitMessage(data.msg)) {
        const delay = PAYU_RETRY_BASE_DELAY_MS * attempt;
        payuRateLimitedUntil = Date.now() + delay;
        if (attempt < PAYU_MAX_RETRIES) {
          await sleep(delay);
          continue;
        }
      }

      const empty: PayURefundRecord[] = [];
      payuRefundBatchCache.set(cacheKey, { ts: Date.now(), data: empty });
      return empty;
    } catch (error) {
      const delay = PAYU_RETRY_BASE_DELAY_MS * attempt;
      if (attempt < PAYU_MAX_RETRIES) {
        await sleep(delay);
        continue;
      }
      if (stale) {
        console.warn(`Using stale PayU refund cache for batch (${cleanTxnIds.length} txnIds) after retries`);
        return stale;
      }
      throw error;
    }
  }

  return stale || [];
}

async function enrichTransactionsWithRefundDetails(
  merchantKey: string,
  merchantSalt: string,
  transactions: PayUTransaction[]
): Promise<PayUTransaction[]> {
  if (!transactions.length) return transactions;

  const txnsByPayuId = new Map<string, PayUTransaction>();
  const txnIds: string[] = [];
  for (const txn of transactions) {
    const txnId = String(txn.txnid || "").trim();
    if (txnId) txnIds.push(txnId);
    const payuId = getPayUPaymentId(txn);
    if (payuId && !txnsByPayuId.has(payuId)) {
      txnsByPayuId.set(payuId, txn);
    }
  }

  const uniqueTxnIds = Array.from(new Set(txnIds));
  if (!uniqueTxnIds.length) return transactions;

  const existingRefundBudget = new Map<string, number>();
  for (const txn of transactions) {
    const financial = classifyPayUEvent(txn as unknown as Record<string, unknown>);
    if (financial.kind !== "refund" || financial.amount <= 0) continue;
    const key = getRefundDuplicateKey(txn.txnid, getPayUPaymentId(txn), financial.amount);
    existingRefundBudget.set(key, (existingRefundBudget.get(key) || 0) + 1);
  }

  const syntheticRefundRows: PayUTransaction[] = [];
  const seenSyntheticKeys = new Set<string>();

  for (let i = 0; i < uniqueTxnIds.length; i += PAYU_REFUND_BATCH_SIZE) {
    const batch = uniqueTxnIds.slice(i, i + PAYU_REFUND_BATCH_SIZE);
    const refundRows = await fetchPayURefundDetailsBatch(merchantKey, merchantSalt, batch);

    for (const refund of refundRows) {
      const payuId = String(refund.PayuID || "").trim();
      const amount = Math.abs(toNumber(refund.Amount));
      if (!payuId || amount <= 0) continue;

      const baseTxn = txnsByPayuId.get(payuId);
      const txnid = String(baseTxn?.txnid || "").trim();
      if (!txnid) continue;

      const duplicateKey = getRefundDuplicateKey(txnid, payuId, amount);
      const duplicateBudget = existingRefundBudget.get(duplicateKey) || 0;
      if (duplicateBudget > 0) {
        existingRefundBudget.set(duplicateKey, duplicateBudget - 1);
        continue;
      }

      const refundStatus = normalizeToken(refund.Status) || "success";
      const requestId = String(refund.RequestID || "").trim();
      const addedon = normalizePayUDateTime(refund.success_at || refund.RefundCreationDate || baseTxn?.addedon);
      if (!addedon) continue;

      const syntheticKey = [
        normalizeToken(txnid),
        normalizeToken(payuId),
        toIsoAmountToken(amount),
        normalizeToken(requestId),
        normalizeToken(addedon),
      ].join("|");

      if (seenSyntheticKeys.has(syntheticKey)) continue;
      seenSyntheticKeys.add(syntheticKey);

      syntheticRefundRows.push({
        mihpayid: payuId,
        id: payuId,
        txnid,
        amount: amount.toFixed(2),
        status: `refund_${refundStatus}`,
        mode: String(baseTxn?.mode || ""),
        email: String(baseTxn?.email || ""),
        phone: String(baseTxn?.phone || ""),
        firstname: String(baseTxn?.firstname || ""),
        productinfo: String(baseTxn?.productinfo || ""),
        addedon,
        udf1: String(baseTxn?.udf1 || ""),
        udf2: String(baseTxn?.udf2 || ""),
        udf3: String(baseTxn?.udf3 || ""),
        udf4: String(baseTxn?.udf4 || ""),
        udf5: String(baseTxn?.udf5 || ""),
        bank_ref_num: String(refund.bank_ref_no || refund.bank_arn || baseTxn?.bank_ref_num || baseTxn?.bank_ref_no || ""),
        bank_ref_no: String(refund.bank_ref_no || refund.bank_arn || baseTxn?.bank_ref_no || baseTxn?.bank_ref_num || ""),
        bankcode: String(baseTxn?.bankcode || ""),
        error_code: "",
        error_Message: "",
        net_amount_debit: `-${amount.toFixed(2)}`,
        transaction_fee: amount.toFixed(2),
        discount: "0.00",
        offer_key: "",
        offer_type: "",
        offer_availed: "",
        field9: `refund|${refundStatus}|${requestId}`.replace(/\|+$/, ""),
        unmappedstatus: refundStatus,
      });
    }
  }

  if (syntheticRefundRows.length === 0) return transactions;

  const combined = [...transactions, ...syntheticRefundRows];
  const deduped: PayUTransaction[] = [];
  const seen = new Set<string>();
  for (const txn of combined) {
    const key = getPayUEventFingerprint(txn);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(txn);
  }
  return deduped;
}

function toYMD(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export interface ProcessedTransaction {
  id: string;
  payuId: string;
  txnId: string;
  amount: number;
  status: string;
  email: string;
  phone: string;
  name: string;
  productInfo: string;
  date: string;
  dateIST: Date;
  userId: string;
  type: string;
  bundleId: string;
  feature: string;
  coins: number;
  bankRef: string;
  paymentMode: string;
}

export function processPayUTransactions(transactions: PayUTransaction[]): ProcessedTransaction[] {
  return transactions.map((txn) => ({
    id: getPayUPaymentId(txn) || txn.txnid,
    payuId: getPayUPaymentId(txn),
    txnId: txn.txnid,
    amount: parseFloat(txn.amount) || 0,
    status: txn.status,
    email: txn.email,
    phone: txn.phone,
    name: txn.firstname || "Customer",
    productInfo: txn.productinfo,
    date: txn.addedon,
    dateIST: new Date(txn.addedon),
    userId: txn.udf1 || "",
    type: txn.udf2 || "bundle",
    bundleId: txn.udf3 || "",
    feature: txn.udf4 || "",
    coins: parseInt(txn.udf5) || 0,
    bankRef: txn.bank_ref_num || txn.bank_ref_no || "",
    paymentMode: txn.mode,
  }));
}

// Convert IST time to Costa Rica time (UTC-6)
export function convertISTToCostaRica(istDate: Date): Date {
  // IST is UTC+5:30, Costa Rica is UTC-6
  // Difference is 11.5 hours (IST is ahead)
  const istOffset = 5.5 * 60; // IST offset in minutes
  const crOffset = -6 * 60;   // Costa Rica offset in minutes
  const diffMinutes = istOffset - crOffset; // 690 minutes = 11.5 hours
  
  return new Date(istDate.getTime() - diffMinutes * 60 * 1000);
}

// Convert Costa Rica time to IST
export function convertCostaRicaToIST(crDate: Date): Date {
  const istOffset = 5.5 * 60;
  const crOffset = -6 * 60;
  const diffMinutes = istOffset - crOffset;
  
  return new Date(crDate.getTime() + diffMinutes * 60 * 1000);
}

// Format date for PayU API (YYYY-MM-DD HH:MM:SS in IST)
export function formatDateForPayU(date: Date): { date: string; time: string } {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  
  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}:${seconds}`,
  };
}

// App launch date - March 13, 2026
export const APP_LAUNCH_DATE = new Date("2026-03-13T00:00:00+05:30");
