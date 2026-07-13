import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { DEFAULT_PRICING, normalizePricing, type PricingConfig } from "@/lib/pricing";
import { getPayUPaymentId, getPayUTransactions } from "@/lib/payu-api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type UserRow = {
  id: string;
  email: string | null;
  name: string | null;
  bundle_purchased: string | null;
  purchase_type: string | null;
  payment_status: string | null;
  unlocked_features: Record<string, boolean> | string | null;
  coins: number | null;
  payu_payment_id: string | null;
  payu_txn_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type PaymentRow = {
  id: string;
  user_id: string | null;
  type: string | null;
  bundle_id: string | null;
  feature: string | null;
  coins: number | null;
  customer_email: string | null;
  amount: number | null;
  currency: string | null;
    payment_status: string | null;
    payu_txn_id: string | null;
    payu_payment_id: string | null;
    tax_mode: string | null;
    base_amount: number | null;
    gst_rate: number | null;
    gst_amount: number | null;
    total_amount: number | null;
    fulfilled_at: string | null;
    created_at: string | null;
    source?: string;
  };

type InvoiceItem = {
  name: string;
  quantity: number;
  amount: number;
};

type InvoicePayload = {
  invoiceNumber: string;
  invoiceDate: string;
  source: string;
  customer: {
    userId: string;
    name: string;
    email: string;
  };
  payment: {
    status: string;
    type: string;
    gateway: string;
    txnId: string;
    paymentId: string;
    paidAt: string;
  };
    items: InvoiceItem[];
    subtotal: number;
    taxLines: Array<{
      label: string;
      ratePercent: number;
      amount: number;
    }>;
    total: number;
    currency: string;
  unlockedFeatures: string[];
  account: {
    createdAt: string | null;
    updatedAt: string | null;
  };
  orderMetadata: {
    purchaseType: string;
    bundle: string;
    paymentStatus: string;
    primaryTxnId: string;
    primaryPaymentId: string;
    accountCreated: string | null;
    lastUpdated: string | null;
  };
  activity: {
    birthChart: {
      generated: boolean;
      createdAt: string | null;
    };
    palmReading: {
      generated: boolean;
      createdAt: string | null;
    };
    soulmateSketch: {
      generated: boolean;
      createdAt: string | null;
    };
    futurePartnerReport: {
      generated: boolean;
      createdAt: string | null;
    };
  };
};

const PAID_STATUSES = ["paid", "success", "captured"];

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Failed to generate invoice";
}

async function verifyAdminSession(token: string) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("admin_sessions")
    .select("id, expires_at")
    .eq("id", token)
    .maybeSingle();

  if (!data || new Date(data.expires_at) < new Date()) {
    return false;
  }

  return true;
}

async function getPricingConfig(): Promise<PricingConfig> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("settings").select("value").eq("key", "pricing").maybeSingle();
  return normalizePricing(data?.value || DEFAULT_PRICING);
}

function normalizeType(value: unknown): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "bundle") return "bundle_payment";
  return normalized || "unknown";
}

function humanizeFeature(value: string): string {
  const labels: Record<string, string> = {
    palmReading: "Palm Reading Report",
    birthChart: "Birth Chart Report",
    prediction2026: "2026 Future Predictions Report",
    compatibilityTest: "Compatibility Report",
    soulmateSketch: "Soulmate Sketch",
    futurePartnerReport: "Future Partner Report",
    vastuShastraGuide: "Complete Vastu Shastra Guide Ebook",
  };
  return labels[value] || value.replace(/[-_]/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
}

function splitTokens(value: string | null | undefined): string[] {
  return String(value || "")
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
}

function moneyFromPaise(value: unknown): number {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount / 100 : 0;
}

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

function isExclusiveGstPayment(payment: PaymentRow): boolean {
  return String(payment.tax_mode || "").trim().toLowerCase() === "exclusive_gst";
}

function getPaymentTotalInr(payment: PaymentRow): number {
  return moneyFromPaise(payment.total_amount || payment.amount);
}

function getPaymentInvoiceLineInr(payment: PaymentRow): number {
  if (isExclusiveGstPayment(payment)) return getPaymentTotalInr(payment);
  return moneyFromPaise(payment.amount);
}

function firstDefined(...values: Array<string | null | undefined>): string {
  return values.find((value) => String(value || "").trim()) || "";
}

function getIstDateCompact(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const getPart = (type: "year" | "month" | "day") =>
    parts.find((part) => part.type === type)?.value || "";
  return `${getPart("year")}${getPart("month")}${getPart("day")}`;
}

function sanitizeInvoiceSuffixSource(value: string): string {
  return String(value || "").replace(/[^a-zA-Z0-9]/g, "");
}

function buildInvoiceNumber({
  now,
  txnId,
  paymentId,
}: {
  now: Date;
  txnId: string;
  paymentId: string;
}): string {
  const datePart = getIstDateCompact(now);
  const source = sanitizeInvoiceSuffixSource(txnId) || sanitizeInvoiceSuffixSource(paymentId);
  const fallback = Math.random().toString(36).slice(2);
  const suffix = (source || fallback).slice(-6).padStart(6, "0").toLowerCase();
  return `AR-INV-${datePart}-${suffix}`;
}

function isGenericCustomerName(value: string | null | undefined): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  return !normalized || normalized === "customer" || normalized === "astrorekha customer";
}

function parseUnlockedFeatures(value: UserRow["unlocked_features"]): string[] {
  if (!value) return [];
  const parsed = typeof value === "string" ? safeJsonParse(value) : value;
  if (!parsed || typeof parsed !== "object") return [];

  return Object.entries(parsed)
    .filter(([, enabled]) => Boolean(enabled))
    .map(([key]) => humanizeFeature(key));
}

function featuresForPayment(payment: PaymentRow, pricing: PricingConfig): string[] {
  const type = normalizeType(payment.type);
  const bundleId = splitTokens(payment.bundle_id)[0] || "";
  const featureTokens = splitTokens(payment.feature);

  if (type === "bundle_payment") {
    const bundle = pricing.bundles.find((plan) => plan.id === bundleId);
    return (bundle?.features || []).map(humanizeFeature);
  }

  const directFeatures = featureTokens.map(humanizeFeature);
  if (directFeatures.length) return directFeatures;

  const ids = splitTokens(payment.bundle_id);
  const mapped = ids.flatMap((id) => {
    const upsell = pricing.upsells.find((plan) => plan.id === id);
    if (upsell?.feature) return [humanizeFeature(upsell.feature)];
    const report = pricing.reports.find((plan) => plan.id === id);
    if (report?.feature) return [humanizeFeature(report.feature)];
    return [];
  });

  return mapped;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function findById<T extends { id: string; name: string }>(rows: T[], id: string): string | null {
  return rows.find((row) => row.id === id)?.name || null;
}

function resolvePaymentItems(payment: PaymentRow, pricing: PricingConfig): string[] {
  const type = normalizeType(payment.type);
  const bundleTokens = splitTokens(payment.bundle_id);
  const featureTokens = splitTokens(payment.feature);

  if (type === "bundle_payment") {
    const bundleId = bundleTokens[0] || "";
    return [findById(pricing.bundles, bundleId) || humanizeFeature(bundleId) || "Bundle Purchase"];
  }

  if (type === "coins") {
    const coins = Number(payment.coins || 0);
    return [`${coins || "Coin"} Coins`];
  }

  if (type === "upsell") {
    const upsellItems = bundleTokens.map(
      (id) => findById(pricing.upsells, id) || findById(pricing.reports, id) || humanizeFeature(id)
    );
    return [...upsellItems, ...featureTokens.map(humanizeFeature)].filter(Boolean);
  }

  if (type === "report") {
    const reportItems = bundleTokens.map((id) => findById(pricing.reports, id) || humanizeFeature(id));
    return [...reportItems, ...featureTokens.map(humanizeFeature)].filter(Boolean);
  }

  const fallback = [...bundleTokens, ...featureTokens].map(humanizeFeature).filter(Boolean);
  return fallback.length ? fallback : ["AstroRekha Digital Service"];
}

function titleFromId(value: string | null | undefined): string {
  return String(value || "")
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function createSyntheticPayment(user: UserRow): PaymentRow {
  return {
    id: `synthetic_${user.payu_txn_id || user.payu_payment_id || user.id}`,
    user_id: user.id,
    type: user.purchase_type || "bundle_payment",
    bundle_id: user.bundle_purchased || "palm-reading",
    feature: null,
    coins: user.coins,
      customer_email: user.email,
      amount: null,
      tax_mode: null,
      base_amount: null,
      gst_rate: null,
      gst_amount: null,
      total_amount: null,
      currency: "INR",
    payment_status: user.payment_status || "paid",
    payu_txn_id: user.payu_txn_id,
    payu_payment_id: user.payu_payment_id,
    fulfilled_at: user.updated_at,
    created_at: user.updated_at || user.created_at,
    source: "user_paid_fallback",
  };
}

async function findUser(userId: string, txnId: string, payment: PaymentRow | null): Promise<UserRow | null> {
  const supabase = getSupabaseAdmin();
  if (userId) {
    const { data } = await supabase.from("users").select("*").eq("id", userId).maybeSingle();
    if (data) return data as UserRow;
  }

  if (payment?.user_id) {
    const { data } = await supabase.from("users").select("*").eq("id", payment.user_id).maybeSingle();
    if (data) return data as UserRow;
  }

  if (payment?.customer_email) {
    const { data } = await supabase.from("users").select("*").eq("email", payment.customer_email).maybeSingle();
    if (data) return data as UserRow;
  }

  if (txnId) {
    const { data } = await supabase
      .from("users")
      .select("*")
      .or(`payu_txn_id.eq.${txnId},payu_payment_id.eq.${txnId}`)
      .maybeSingle();
    if (data) return data as UserRow;
  }

  return null;
}

async function findPayments(userId: string, txnId: string, email: string): Promise<PaymentRow[]> {
  const supabase = getSupabaseAdmin();
  const results: PaymentRow[] = [];

  function addRows(data: unknown) {
    for (const row of ((data || []) as PaymentRow[])) {
      if (!results.some((existing) => existing.id === row.id)) {
        results.push(row);
      }
    }
  }

  if (txnId) {
    const { data } = await supabase
      .from("payments")
      .select("*")
      .or(`payu_txn_id.eq.${txnId},payu_payment_id.eq.${txnId},id.eq.${txnId}`)
      .order("created_at", { ascending: false })
      .limit(20);
    addRows(data);
  }

  if (userId) {
    const { data } = await supabase
      .from("payments")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    addRows(data);
  }

  if (email) {
    const { data } = await supabase
      .from("payments")
      .select("*")
      .eq("customer_email", email)
      .order("created_at", { ascending: false })
      .limit(20);
    addRows(data);
  }

  return results.filter((payment) => PAID_STATUSES.includes(String(payment.payment_status || "").toLowerCase()));
}

function includesFeature(
  features: string[],
  expected: "birthChart" | "palmReading" | "soulmateSketch" | "futurePartnerReport"
): boolean {
  const labels = {
    birthChart: "Birth Chart Report",
    palmReading: "Palm Reading Report",
    soulmateSketch: "Soulmate Sketch",
    futurePartnerReport: "Future Partner Report",
  };
  const expectedLabel = labels[expected];
  return features.some((feature) => feature.toLowerCase() === expectedLabel.toLowerCase());
}

function selectInvoicePayments(payments: PaymentRow[], requestedTxnId: string): PaymentRow[] {
  if (payments.length <= 1) return payments;

  if (requestedTxnId) {
    const exactMatches = payments.filter((payment) => {
      return [payment.payu_txn_id, payment.payu_payment_id, payment.id]
        .filter(Boolean)
        .some((value) => String(value).trim() === requestedTxnId);
    });

    if (exactMatches.length > 0) return exactMatches;
  }

  const completeBundle = payments
    .filter((payment) => {
      const bundleId = String(payment.bundle_id || "");
      const amount = Number(payment.amount || 0);
      return bundleId === "palm-birth-sketch" || amount >= 159900;
    })
    .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))[0];

  if (completeBundle) return [completeBundle];
  return payments;
}

async function getReportActivity(
  userId: string,
  unlockedFeatures: string[]
): Promise<InvoicePayload["activity"]> {
  const supabase = getSupabaseAdmin();
  const activity: InvoicePayload["activity"] = {
    birthChart: { generated: includesFeature(unlockedFeatures, "birthChart"), createdAt: null },
    palmReading: { generated: includesFeature(unlockedFeatures, "palmReading"), createdAt: null },
    soulmateSketch: { generated: includesFeature(unlockedFeatures, "soulmateSketch"), createdAt: null },
    futurePartnerReport: { generated: includesFeature(unlockedFeatures, "futurePartnerReport"), createdAt: null },
  };

  if (!userId || userId === "-") return activity;

  const palmResult = await supabase
    .from("palm_readings")
    .select("created_at, reading, palm_image_url")
    .eq("id", userId)
    .maybeSingle();

  if (palmResult.data) {
    const row = palmResult.data as { created_at?: string | null; reading?: unknown; palm_image_url?: string | null };
    activity.palmReading = {
      generated: Boolean(row.reading || row.palm_image_url || row.created_at),
      createdAt: row.created_at || null,
    };
  }

  const birthChartReport = await supabase
    .from("birth_chart_reports")
    .select("status, generated_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (birthChartReport.data) {
    const row = birthChartReport.data as {
      status?: string | null;
      generated_at?: string | null;
      created_at?: string | null;
    };
    activity.birthChart = {
      generated: row.status === "complete" || Boolean(row.generated_at || row.created_at) || activity.birthChart.generated,
      createdAt: row.generated_at || row.created_at || activity.birthChart.createdAt,
    };
  }

  const linkedBirthChart = await supabase
    .from("birth_chart_user_links")
    .select("birth_chart_id, created_at, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (linkedBirthChart.data?.birth_chart_id) {
    const birthChart = await supabase
      .from("birth_charts")
      .select("cached_at")
      .eq("id", linkedBirthChart.data.birth_chart_id)
      .maybeSingle();
    if (birthChart.data) {
      const row = birthChart.data as { cached_at?: string | null };
      const link = linkedBirthChart.data as {
        created_at?: string | null;
        updated_at?: string | null;
      };
      activity.birthChart = {
        generated: true,
        createdAt: row.cached_at || link.created_at || link.updated_at || activity.birthChart.createdAt,
      };
      return activity;
    }
  }

  const directBirthChart = await supabase
    .from("birth_charts")
    .select("cached_at")
    .eq("id", userId)
    .maybeSingle();

  if (directBirthChart.data) {
    const row = directBirthChart.data as { cached_at?: string | null };
    activity.birthChart = {
      generated: true,
      createdAt: row.cached_at || activity.birthChart.createdAt,
    };
  }

  const natalChart = await supabase
    .from("natal_charts")
    .select("created_at")
    .eq("id", userId)
    .maybeSingle();

  if (natalChart.data) {
    const row = natalChart.data as { created_at?: string | null };
    activity.birthChart = {
      generated: true,
      createdAt: activity.birthChart.createdAt || row.created_at || null,
    };
  }

  const soulmateSketch = await supabase
    .from("soulmate_sketches")
    .select("status, sketch_image_url, generated_at, created_at, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (soulmateSketch.data) {
    const row = soulmateSketch.data as {
      status?: string | null;
      sketch_image_url?: string | null;
      generated_at?: string | null;
      created_at?: string | null;
      updated_at?: string | null;
    };
    activity.soulmateSketch = {
      generated:
        row.status === "complete" ||
        Boolean(row.sketch_image_url || row.generated_at) ||
        activity.soulmateSketch.generated,
      createdAt: row.generated_at || row.created_at || row.updated_at || activity.soulmateSketch.createdAt,
    };
  }

  const futurePartner = await supabase
    .from("future_partner_reports")
    .select("status, generated_at, created_at, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (futurePartner.data) {
    const row = futurePartner.data as {
      status?: string | null;
      generated_at?: string | null;
      created_at?: string | null;
      updated_at?: string | null;
    };
    activity.futurePartnerReport = {
      generated: row.status === "complete" || Boolean(row.generated_at) || activity.futurePartnerReport.generated,
      createdAt: row.generated_at || row.created_at || row.updated_at || activity.futurePartnerReport.createdAt,
    };
  }

  return activity;
}

function toYmd(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function getPayUCustomerName(payment: PaymentRow, fallbackDate: string): Promise<string> {
  const txnId = firstDefined(payment.payu_txn_id, payment.id);
  const paymentId = firstDefined(payment.payu_payment_id);
  const anchorDate = new Date(firstDefined(payment.fulfilled_at, payment.created_at, fallbackDate));

  if ((!txnId && !paymentId) || Number.isNaN(anchorDate.getTime())) {
    return "";
  }

  const fromDate = new Date(anchorDate);
  fromDate.setDate(fromDate.getDate() - 2);
  const toDate = new Date(anchorDate);
  toDate.setDate(toDate.getDate() + 2);

  try {
    const transactions = await getPayUTransactions(toYmd(fromDate), toYmd(toDate));
    const match = transactions.find((txn) => {
      const payuId = getPayUPaymentId(txn);
      return (
        (!!txnId && String(txn.txnid || "").trim() === txnId) ||
        (!!paymentId && payuId === paymentId)
      );
    });

    const name = String(match?.firstname || "").trim();
    return isGenericCustomerName(name) ? "" : name;
  } catch (error) {
    console.warn("PayU customer name lookup failed for invoice:", error);
    return "";
  }
}

async function buildInvoice(userId: string, txnId: string): Promise<InvoicePayload> {
  const pricing = await getPricingConfig();
  const firstPayments = await findPayments(userId, txnId, "");
  const firstPayment = firstPayments[0] || null;
  const user = await findUser(userId, txnId, firstPayment);

  if (!user && !firstPayment) {
    throw new Error("No user or paid transaction found for invoice.");
  }

  const payments = await findPayments(user?.id || userId, txnId, user?.email || firstPayment?.customer_email || "");
  let invoicePayments = selectInvoicePayments(payments, txnId);
  if (invoicePayments.length === 0 && user && String(user.payment_status || "").toLowerCase() === "paid") {
    invoicePayments = [createSyntheticPayment(user)];
  }

  if (invoicePayments.length === 0) {
    throw new Error("No paid transactions found for invoice.");
  }

  const primaryPayment = invoicePayments[0];
  const invoiceNow = new Date();
  const invoiceDateIso = invoiceNow.toISOString();
  const paidAt = firstDefined(primaryPayment.fulfilled_at, primaryPayment.created_at, user?.updated_at, user?.created_at);
  const txn = firstDefined(txnId, primaryPayment.payu_txn_id, user?.payu_txn_id, primaryPayment.id);
  const paymentId = firstDefined(primaryPayment.payu_payment_id, user?.payu_payment_id);
  const invoiceNumber = buildInvoiceNumber({
    now: invoiceNow,
    txnId: txn,
    paymentId,
  });
  const payuCustomerName = await getPayUCustomerName(primaryPayment, paidAt || user?.updated_at || user?.created_at || "");
  const customerName = firstDefined(
    payuCustomerName,
    isGenericCustomerName(user?.name) ? "" : user?.name,
    "Customer"
  );

  const items = invoicePayments.flatMap((payment) => {
    const names = resolvePaymentItems(payment, pricing);
    const amount = getPaymentInvoiceLineInr(payment);
    const lineAmount = names.length > 0 ? amount / names.length : amount;
      return names.map((name) => ({
        name,
        quantity: 1,
        amount: roundMoney(lineAmount),
      }));
    });

  const subtotal = roundMoney(items.reduce((sum, item) => sum + item.amount, 0));
  const taxLines: InvoicePayload["taxLines"] = [];
    const fallbackTotal = moneyFromPaise(primaryPayment.amount);
    const calculatedTotal = roundMoney(invoicePayments.reduce((sum, payment) => sum + getPaymentTotalInr(payment), 0));
    const total = calculatedTotal || subtotal || fallbackTotal;
  const customerUserId = user?.id || primaryPayment.user_id || "-";
  const paymentFeatures = uniqueStrings(invoicePayments.flatMap((payment) => featuresForPayment(payment, pricing)));
  const unlockedFeatures = paymentFeatures.length
    ? paymentFeatures
    : parseUnlockedFeatures(user?.unlocked_features || null);
  const activity = await getReportActivity(customerUserId, unlockedFeatures);
  const itemNames = items.map((item) => item.name).filter(Boolean);
  if (activity.birthChart.generated && !activity.birthChart.createdAt && activity.palmReading.createdAt) {
    activity.birthChart.createdAt = activity.palmReading.createdAt;
  }
  if (activity.soulmateSketch.generated && !activity.soulmateSketch.createdAt && activity.palmReading.createdAt) {
    activity.soulmateSketch.createdAt = activity.palmReading.createdAt;
  }
  if (activity.futurePartnerReport.generated && !activity.futurePartnerReport.createdAt && activity.palmReading.createdAt) {
    activity.futurePartnerReport.createdAt = activity.palmReading.createdAt;
  }

  return {
    invoiceNumber,
    invoiceDate: invoiceDateIso,
    source: primaryPayment.source || "payments",
    customer: {
      userId: customerUserId,
      name: customerName,
      email: user?.email || primaryPayment.customer_email || "-",
    },
    payment: {
      status: primaryPayment.payment_status || user?.payment_status || "paid",
      type: normalizeType(primaryPayment.type || user?.purchase_type),
      gateway: "PayU",
      txnId: firstDefined(primaryPayment.payu_txn_id, user?.payu_txn_id, txnId, primaryPayment.id),
      paymentId: firstDefined(primaryPayment.payu_payment_id, user?.payu_payment_id),
      paidAt,
    },
      items: items.length ? items : [{ name: "AstroRekha Digital Service", quantity: 1, amount: total }],
      subtotal,
      taxLines,
      total,
    currency: primaryPayment.currency || "INR",
    unlockedFeatures,
    account: {
      createdAt: user?.created_at || null,
      updatedAt: user?.updated_at || null,
    },
    orderMetadata: {
      purchaseType: user?.purchase_type || normalizeType(primaryPayment.type),
      bundle: itemNames.join(", ") || titleFromId(user?.bundle_purchased || primaryPayment.bundle_id),
      paymentStatus: primaryPayment.payment_status || user?.payment_status || "paid",
      primaryTxnId: firstDefined(primaryPayment.payu_txn_id, user?.payu_txn_id, txnId, primaryPayment.id),
      primaryPaymentId: firstDefined(primaryPayment.payu_payment_id, user?.payu_payment_id),
      accountCreated: user?.created_at || null,
      lastUpdated: user?.updated_at || primaryPayment.fulfilled_at || primaryPayment.created_at || null,
    },
    activity,
  };
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

function generatePdf(invoice: InvoicePayload): ArrayBuffer {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const rightX = pageWidth - margin;
  let y = 18;

  const line = (lineY: number) => {
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.2);
    doc.line(margin, lineY, rightX, lineY);
  };

  const label = (text: string, x: number, lineY: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(20, 20, 20);
    doc.text(text, x, lineY);
  };

  const text = (value: string, x: number, lineY: number, options?: { maxWidth?: number; align?: "left" | "right" }) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 20);
    const maxWidth = options?.maxWidth;
    if (maxWidth) {
      const lines = doc.splitTextToSize(value, maxWidth);
      doc.text(lines, x, lineY, { align: options?.align || "left" });
      return lines.length * 5;
    }
    doc.text(value, x, lineY, { align: options?.align || "left" });
    return 5;
  };

  const paidAt = formatDate(invoice.payment.paidAt || invoice.invoiceDate);
  const invoiceDate = formatDate(invoice.invoiceDate);
    const primaryTxn = invoice.orderMetadata.primaryTxnId || invoice.payment.txnId || invoice.payment.paymentId || "-";
    const primaryPayment = invoice.orderMetadata.primaryPaymentId || invoice.payment.paymentId || "-";
    const totalLabel = `INR ${invoice.total.toFixed(2)}`;
    const hasTaxLines = invoice.taxLines.length > 0;

  doc.setFillColor(26, 32, 50);
  doc.rect(0, 0, pageWidth, 32, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text("AstroRekha", margin, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Digital Services Receipt", margin, 23);

  doc.setFontSize(10);
  doc.text(`Invoice No: ${invoice.invoiceNumber}`, rightX - 58, 14);
  doc.text(`Invoice Date: ${invoiceDate}`, rightX - 58, 23);
  doc.text(`Currency: ${invoice.currency}`, rightX - 58, 30);
  y = 58;

  label("Billed To", margin, y);
  y += 8;
  y += text(`User ID: ${invoice.customer.userId}`, margin, y, { maxWidth: contentWidth }) + 1;
  y += text(`Email: ${invoice.customer.email}`, margin, y, { maxWidth: contentWidth }) + 5;

  line(y);
  y += 10;

  y += text(`Bundle Purchased: ${invoice.orderMetadata.bundle || invoice.items.map((item) => item.name).join(", ")}`, margin, y, {
    maxWidth: contentWidth,
  }) + 1;
  y += text(`Primary Txn: ${primaryTxn}`, margin, y, { maxWidth: contentWidth }) + 1;
  y += text(`Payment ID: ${primaryPayment}`, margin, y, { maxWidth: contentWidth }) + 1;
  y += text(`Account Created: ${formatDate(invoice.orderMetadata.accountCreated || invoice.account.createdAt || invoice.invoiceDate)}`, margin, y, {
    maxWidth: contentWidth,
  }) + 5;

  line(y);
  y += 9;

  doc.setFillColor(242, 245, 248);
  doc.rect(margin, y - 5, contentWidth, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(20, 20, 20);
  doc.text("#", margin + 2, y);
  doc.text("Item", margin + 9, y);
  doc.text("Txn ID", margin + 82, y);
  doc.text("Paid At (IST)", margin + 120, y);
  doc.text(`Amount (${invoice.currency})`, rightX - 40, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  invoice.items.forEach((item, index) => {
    doc.text(String(index + 1), margin + 2, y);
    doc.text(doc.splitTextToSize(item.name, 68), margin + 9, y);
    doc.text(primaryTxn.slice(0, 20), margin + 82, y);
    doc.text(paidAt, margin + 120, y);
    doc.text(`INR ${item.amount.toFixed(2)}`, rightX - 3, y, { align: "right" });
    y += 9;
  });

    line(y);
    y += 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    if (hasTaxLines) {
      doc.text(`Subtotal: INR ${invoice.subtotal.toFixed(2)}`, rightX, y, { align: "right" });
      y += 6;
      invoice.taxLines.forEach((taxLine) => {
        doc.text(
          `${taxLine.label} (${taxLine.ratePercent}%): INR ${taxLine.amount.toFixed(2)}`,
          rightX,
          y,
          { align: "right" }
        );
        y += 6;
      });
    }
    doc.setFontSize(11);
    doc.text(`Total: ${totalLabel}`, rightX, y, { align: "right" });
  y += 12;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Service Delivery: Completed digitally in-app (${invoice.items.length} paid item${invoice.items.length === 1 ? "" : "s"}).`, margin, y);
  y += 7;
  if (invoice.unlockedFeatures.length) {
    y += text(`Unlocked Features: ${invoice.unlockedFeatures.join(", ")}`, margin, y, { maxWidth: contentWidth }) + 1;
  }
  if (invoice.unlockedFeatures.includes("Birth Chart Report")) {
    doc.text(`Birth Chart Report: ${invoice.activity.birthChart.generated ? "Generated" : "Not generated"}`, margin, y);
    y += 7;
    doc.text(`Birth Chart Created: ${invoice.activity.birthChart.createdAt ? formatDate(invoice.activity.birthChart.createdAt) : "-"}`, margin, y);
    y += 7;
  }
  if (invoice.unlockedFeatures.includes("Palm Reading Report")) {
    doc.text(`Palm Reading Report: ${invoice.activity.palmReading.generated ? "Generated" : "Not generated"}`, margin, y);
    y += 7;
    doc.text(`Palm Reading Created: ${invoice.activity.palmReading.createdAt ? formatDate(invoice.activity.palmReading.createdAt) : "-"}`, margin, y);
    y += 7;
  }
  if (invoice.unlockedFeatures.includes("Soulmate Sketch")) {
    doc.text(`Soulmate Sketch: ${invoice.activity.soulmateSketch.generated ? "Generated" : "Not generated"}`, margin, y);
    y += 7;
    doc.text(`Soulmate Sketch Created: ${invoice.activity.soulmateSketch.createdAt ? formatDate(invoice.activity.soulmateSketch.createdAt) : "-"}`, margin, y);
    y += 7;
  }
  if (invoice.unlockedFeatures.includes("Future Partner Report")) {
    doc.text(`Future Partner Report: ${invoice.activity.futurePartnerReport.generated ? "Generated" : "Not generated"}`, margin, y);
    y += 7;
    doc.text(`Future Partner Created: ${invoice.activity.futurePartnerReport.createdAt ? formatDate(invoice.activity.futurePartnerReport.createdAt) : "-"}`, margin, y);
  }
  y += 13;

  doc.setFontSize(9);
  doc.setTextColor(20, 20, 20);
  const note = "This invoice is generated from AstroRekha transaction logs as proof of purchase and digital delivery.";
  doc.text(doc.splitTextToSize(note, contentWidth), margin, y);

  if (invoice.source) {
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`Data source: ${invoice.source}`, margin, 286);
  }

  return doc.output("arraybuffer");
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token") || "";
    const userId = searchParams.get("userId")?.trim() || "";
    const txnId = searchParams.get("txnId")?.trim() || "";
    const format = searchParams.get("format") || "json";

    if (!token || !(await verifyAdminSession(token))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!userId && !txnId) {
      return NextResponse.json({ error: "Enter a user ID or transaction ID." }, { status: 400 });
    }

    const invoice = await buildInvoice(userId, txnId);

    if (format === "pdf") {
      const pdf = generatePdf(invoice);
      return new NextResponse(pdf, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${invoice.invoiceNumber}.pdf"`,
        },
      });
    }

    return NextResponse.json({ invoice });
  } catch (error: unknown) {
    console.error("Admin invoice API error:", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
