import crypto from "crypto";

const PAYU_BASE_URL = process.env.PAYU_MODE === "live"
  ? "https://info.payu.in/merchant/postservice.php?form=2"
  : "https://test.payu.in/merchant/postservice.php?form=2";

interface PayUTransaction {
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

function generateHash(params: string): string {
  return crypto.createHash("sha512").update(params).digest("hex");
}

export async function getPayUTransactions(
  fromDate: string, // Format: YYYY-MM-DD
  toDate: string,   // Format: YYYY-MM-DD
  fromTime?: string, // Format: HH:MM:SS (optional)
  toTime?: string    // Format: HH:MM:SS (optional)
): Promise<PayUTransaction[]> {
  const merchantKey = process.env.PAYU_MERCHANT_KEY;
  const merchantSalt = process.env.PAYU_MERCHANT_SALT;

  if (!merchantKey || !merchantSalt) {
    throw new Error("PayU credentials not configured");
  }

  // If caller provides specific time boundaries, run a single request.
  if (fromTime || toTime) {
    const fromDateTime = fromTime ? `${fromDate} ${fromTime}` : `${fromDate} 00:00:00`;
    const toDateTime = toTime ? `${toDate} ${toTime}` : `${toDate} 23:59:59`;
    return fetchPayUTransactionsChunk(merchantKey, merchantSalt, fromDateTime, toDateTime);
  }

  // PayU postservice is most reliable when queried in <= 7-day chunks.
  const startDate = new Date(`${fromDate}T00:00:00Z`);
  const endDate = new Date(`${toDate}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error("Invalid date range for PayU fetch");
  }

  const allTransactions: PayUTransaction[] = [];
  const seenTxnIds = new Set<string>();
  const maxDaysPerChunk = 7;
  let currentStart = new Date(startDate);

  while (currentStart <= endDate) {
    const currentEnd = new Date(currentStart);
    currentEnd.setUTCDate(currentEnd.getUTCDate() + (maxDaysPerChunk - 1));
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

    currentStart.setUTCDate(currentEnd.getUTCDate() + 1);
  }

  return allTransactions;
}

async function fetchPayUTransactionsChunk(
  merchantKey: string,
  merchantSalt: string,
  var1: string,
  var2: string
): Promise<PayUTransaction[]> {
  const command = "get_Transaction_Details";
  const hashString = `${merchantKey}|${command}|${var1}|${merchantSalt}`;
  const hash = generateHash(hashString);

  const formData = new URLSearchParams();
  formData.append("key", merchantKey);
  formData.append("command", command);
  formData.append("var1", var1);
  formData.append("var2", var2);
  formData.append("hash", hash);

  try {
    const response = await fetch(PAYU_BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
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
      return details.filter((txn: any) => {
        const status = String(txn?.status || "").toLowerCase();
        return status === "success" || status === "captured";
      }) as PayUTransaction[];
    }

    // Return empty array if no transactions or error
    console.log("PayU API response:", data);
    return [];
  } catch (error) {
    console.error("PayU API error:", error);
    throw error;
  }
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
