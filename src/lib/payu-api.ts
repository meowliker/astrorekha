import crypto from "crypto";

const PAYU_BASE_URL = process.env.PAYU_MODE === "live"
  ? "https://info.payu.in/merchant/postservice.php?form=2"
  : "https://test.payu.in/merchant/postservice.php?form=2";

export interface PayUTransaction {
  mihpayid: string;
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
  bank_ref_num: string;
  bankcode: string;
  error_code: string;
  error_Message: string;
  net_amount_debit: string;
  discount: string;
  offer_key: string;
  offer_type: string;
  offer_availed: string;
  field9: string; // Transaction message
}

interface PayUTransactionResponse {
  status: number;
  msg: string;
  Transaction_details: PayUTransaction[];
}

const PAYU_MAX_DAYS_PER_CHUNK = 7;
const PAYU_MAX_RETRIES = 4;
const PAYU_RETRY_BASE_DELAY_MS = 1200;
const PAYU_MIN_REQUEST_INTERVAL_MS = 900;
const PAYU_CHUNK_CACHE_TTL_MS = 5 * 60 * 1000;
const PAYU_RANGE_CACHE_TTL_MS = 90 * 1000;

type CacheEntry<T> = { ts: number; data: T };
const payuChunkCache = new Map<string, CacheEntry<PayUTransaction[]>>();
const payuRangeCache = new Map<string, CacheEntry<PayUTransaction[]>>();
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
    payuRangeCache.set(rangeCacheKey, { ts: Date.now(), data: single });
    return single;
  }

  // PayU postservice is most reliable when queried in <= 7-day chunks.
  const startDate = new Date(`${fromDate}T00:00:00Z`);
  const endDate = new Date(`${toDate}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error("Invalid date range for PayU fetch");
  }

  const allTransactions: PayUTransaction[] = [];
  const seenTxnIds = new Set<string>();
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
      if (!txn?.txnid) continue;
      if (seenTxnIds.has(txn.txnid)) continue;
      seenTxnIds.add(txn.txnid);
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

  payuRangeCache.set(rangeCacheKey, { ts: Date.now(), data: allTransactions });
  return allTransactions;
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
    id: txn.mihpayid,
    payuId: txn.mihpayid,
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
    bankRef: txn.bank_ref_num,
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
