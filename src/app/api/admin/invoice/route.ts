import { getReportEvidence, type ReportEvidence } from "@/lib/invoice-report-evidence";
import { getCreditEvidence, type CreditEvidence } from "@/lib/invoice-credit-evidence";
import {withAdminAccess} from "@/lib/admin-access";
import { NextRequest, NextResponse } from "next/server";
import { jsPDF } from "jspdf";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { DEFAULT_PRICING, normalizePricing, type PricingConfig } from "@/lib/pricing";
import { CHAT_UNLIMITED_PASS_NAME, CHAT_UNLIMITED_PASS_TYPE } from "@/lib/chat-unlimited-pass";

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
  paid_at?: string | null; gateway?: string | null; gateway_transaction_id?: string | null; customer_name?: string | null;
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
  creditEvidence: CreditEvidence | null;
  reportEvidence: ReportEvidence[];
  fulfillmentRecordedAt: string | null;
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
    auraColorReport: "Aura Color Quiz",
    astrocartographyReport: "Astrocartography",
    pastLifeReport: "Past Life Report",
    numerologyReport: "Numerology Report",
    spiritAnimalReport: "Spirit Animal Report",
    witchArchetypeReport: "Witch Archetype Report",
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
  const source = sanitizeInvoiceSuffixSource(paymentId) || sanitizeInvoiceSuffixSource(txnId);
  const fallback = Math.random().toString(36).slice(2);
  const suffix = (source || fallback).slice(-16).padStart(6, "0").toLowerCase();
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

  if (type === CHAT_UNLIMITED_PASS_TYPE) {
    return [CHAT_UNLIMITED_PASS_NAME];
  }

  if (type === "upsell") {
    const upsellItems = bundleTokens.map(
      (id) => findById(pricing.upsells, id) || findById(pricing.reports, id) || humanizeFeature(id)
    );
    return uniqueStrings(featureTokens.length ? featureTokens.map(humanizeFeature) : upsellItems);
  }

  if (type === "report") {
    const reportItems = bundleTokens.map((id) => findById(pricing.reports, id) || humanizeFeature(id));
    return uniqueStrings(featureTokens.length ? featureTokens.map(humanizeFeature) : reportItems);
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
    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .or(`payu_txn_id.eq.${txnId},payu_payment_id.eq.${txnId},gateway_transaction_id.eq.${txnId},id.eq.${txnId}`)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    addRows(data);
    const paid = results.filter(payment => PAID_STATUSES.includes(String(payment.payment_status || "").toLowerCase()));
    if (paid.length) return paid;
  }

  if (userId) {
    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    addRows(data);
  }

  if (email) {
    const { data, error } = await supabase
      .from("payments")
      .select("*")
      .eq("customer_email", email)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    addRows(data);
  }

  return results.filter((payment) => PAID_STATUSES.includes(String(payment.payment_status || "").toLowerCase()));
}


function selectInvoicePayments(payments: PaymentRow[], requestedTxnId: string): PaymentRow[] {
  if (payments.length <= 1) return payments;

  if (requestedTxnId) {
    const exactMatches = payments.filter((payment) => {
      return [payment.gateway_transaction_id, payment.payu_txn_id, payment.payu_payment_id, payment.id]
        .filter(Boolean)
        .some((value) => String(value).trim() === requestedTxnId);
    });

    if (exactMatches.length > 0) return exactMatches;
  }

  const completeBundle = payments
    .filter((payment) => {
      const bundleId = String(payment.bundle_id || "");
      const amount = Number(payment.amount || 0);
      return bundleId === "palm-birth-sketch" || bundleId === "palm-birth-sketch-aura-astro" || amount >= 159900;
    })
    .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))[0];

  if (completeBundle) return [completeBundle];
  return payments;
}


async function buildInvoice(userId: string, txnId: string): Promise<InvoicePayload> {
  const [pricing, firstPayments] = await Promise.all([getPricingConfig(), findPayments(userId, txnId, "")]);
  const firstPayment = firstPayments[0] || null;
  const user = await findUser(userId, txnId, firstPayment);

  if (!user && !firstPayment) {
    throw new Error("No user or paid transaction found for invoice.");
  }

  const payments = txnId && firstPayments.length ? firstPayments : await findPayments(user?.id || userId, txnId, user?.email || firstPayment?.customer_email || "");
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
  const paidAt = firstDefined(primaryPayment.paid_at, primaryPayment.fulfilled_at, primaryPayment.created_at, user?.updated_at, user?.created_at);
  const txn = firstDefined(txnId, ["paytm", "pinelabs", "airpay"].includes(primaryPayment.gateway || "") ? primaryPayment.id : null, primaryPayment.payu_txn_id, user?.payu_txn_id, primaryPayment.id);
  const paymentId = firstDefined(primaryPayment.gateway_transaction_id, primaryPayment.payu_payment_id, ["paytm", "pinelabs", "airpay"].includes(primaryPayment.gateway || "") ? null : user?.payu_payment_id);
  const invoiceNumber = buildInvoiceNumber({
    now: invoiceNow,
    txnId: txn,
    paymentId,
  });
  const customerName = firstDefined(
    isGenericCustomerName(primaryPayment.customer_name) ? "" : primaryPayment.customer_name,
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
  const isCreditPurchase = invoicePayments.every((payment) => normalizeType(payment.type) === "coins");
  const unlockedFeatures = isCreditPurchase ? [] : paymentFeatures.length
    ? paymentFeatures
    : parseUnlockedFeatures(user?.unlocked_features || null);
  const unlocked = typeof user?.unlocked_features === "string" ? safeJsonParse(user.unlocked_features) : user?.unlocked_features;
  const reportEvidence = isCreditPurchase ? [] : await getReportEvidence(
    getSupabaseAdmin({ fresh: true }), customerUserId, unlockedFeatures, primaryPayment.created_at || "",
    (unlocked && typeof unlocked === "object" ? unlocked : {}) as Record<string, unknown>
  );
  const legacyActivity = (key: string) => {
    const report = reportEvidence.find((item) => item.key === key);
    return { generated: report?.complete || false, createdAt: report?.generatedAt || null };
  };
  const activity = { birthChart: legacyActivity("birthChart"), palmReading: legacyActivity("palmReading"), soulmateSketch: legacyActivity("soulmateSketch"), futurePartnerReport: legacyActivity("futurePartnerReport") };
  const creditEvidence = isCreditPurchase && invoicePayments.length === 1
    ? await getCreditEvidence(getSupabaseAdmin({ fresh: true }), primaryPayment) : null;
  const itemNames = items.map((item) => item.name).filter(Boolean);
  const customerEmail = firstDefined(user?.email, primaryPayment.customer_email);

  return {
    creditEvidence,
    reportEvidence,
    fulfillmentRecordedAt: primaryPayment.fulfilled_at || null,
    invoiceNumber,
    invoiceDate: invoiceDateIso,
    source: primaryPayment.source || "payments",
    customer: {
      userId: customerUserId,
      name: customerName,
      email: !customerEmail || customerEmail.toLowerCase() === "customer@astrorekha.com" ? "Not recorded" : customerEmail,
    },
    payment: {
      status: primaryPayment.payment_status || user?.payment_status || "paid",
      type: normalizeType(primaryPayment.type || user?.purchase_type),
      gateway: primaryPayment.gateway === "airpay" ? "Airpay" : primaryPayment.gateway === "pinelabs" ? "Pine Labs" : ["paytm", "pinelabs", "airpay"].includes(primaryPayment.gateway || "") ? "Paytm" : "PayU",
      txnId: firstDefined(["paytm", "pinelabs", "airpay"].includes(primaryPayment.gateway || "") ? primaryPayment.id : null, primaryPayment.payu_txn_id, user?.payu_txn_id, txnId, primaryPayment.id),
      paymentId: firstDefined(primaryPayment.gateway_transaction_id, primaryPayment.payu_payment_id, ["paytm", "pinelabs", "airpay"].includes(primaryPayment.gateway || "") ? null : user?.payu_payment_id),
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
      purchaseType: normalizeType(primaryPayment.type) || user?.purchase_type || "",
      bundle: itemNames.join(", ") || titleFromId(user?.bundle_purchased || primaryPayment.bundle_id),
      paymentStatus: primaryPayment.payment_status || user?.payment_status || "paid",
      primaryTxnId: firstDefined(["paytm", "pinelabs", "airpay"].includes(primaryPayment.gateway || "") ? primaryPayment.id : null, primaryPayment.payu_txn_id, user?.payu_txn_id, txnId, primaryPayment.id),
      primaryPaymentId: firstDefined(primaryPayment.gateway_transaction_id, primaryPayment.payu_payment_id, ["paytm", "pinelabs", "airpay"].includes(primaryPayment.gateway || "") ? null : user?.payu_payment_id),
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
  doc.text(invoice.creditEvidence ? "Digital service: In-app chat credits" : "Digital service records", margin, y);
  y += 7;
  if (invoice.unlockedFeatures.length) {
    y += text(`Unlocked Features: ${invoice.unlockedFeatures.join(", ")}`, margin, y, { maxWidth: contentWidth }) + 1;
  }
  for (const report of invoice.reportEvidence) {
    const lines = [
      `${report.name}: ${report.state}`,
      `Purchased access: ${report.accessEnabled ? "Enabled" : "Not enabled"}`,
      `Generation time (IST): ${report.generatedAt ? formatDate(report.generatedAt) : "Not recorded"}`,
      `Report record created (IST): ${report.recordCreatedAt ? formatDate(report.recordCreatedAt) : "Not recorded"}`,
      `First report-page visit after purchase (IST): ${report.firstPageVisit ? formatDate(report.firstPageVisit.at) : "Not recorded"}`,
      `Report-page visits after purchase: ${report.pageVisitCount}`,
      `Source: ${report.source}; record: ${report.recordId || "No saved row"}`,
      ...(report.generatedBeforePurchase ? ["This saved report was generated before this purchase."] : []),
    ];
    for (const value of lines) {
      const wrapped = doc.splitTextToSize(value, contentWidth);
      if (y + wrapped.length * 5 > 275) { doc.addPage(); y = 20; }
      doc.text(wrapped, margin, y); y += wrapped.length * 5 + 2;
    }
  }
  if (invoice.creditEvidence) {
    const e = invoice.creditEvidence;
    const lines = [
      `Purchased credits recorded: ${e.coins} coins`,
      `Fulfillment recorded (IST): ${e.fulfillmentRecordedAt ? formatDate(e.fulfillmentRecordedAt) : "Not recorded"}`,
      `First later chat-page visit (IST): ${e.firstChatVisit ? formatDate(e.firstChatVisit.at) : "Not recorded"}`,
      `Chat-page visits after purchase: ${e.chatVisitCount}`,
      `Retained chat snapshot: ${e.retainedChat.userMessages} user messages; ${e.retainedChat.assistantMessages} assistant messages`,
      `Snapshot period (IST): ${e.retainedChat.firstAt ? formatDate(e.retainedChat.firstAt) : "Not recorded"} to ${e.retainedChat.lastAt ? formatDate(e.retainedChat.lastAt) : "Not recorded"}`,
      `Payment record: ${e.paymentRecordId}`,
      `First chat-page event: ${e.firstChatVisit?.id || "Not recorded"}`,
      "Account activity is subsequent to purchase. Individual messages are not allocated to a specific top-up. Page visits record navigation, not message delivery.",
      `Records checked (IST): ${formatDate(e.checkedAt)}`,
    ];
    for (const value of lines) {
      const wrapped = doc.splitTextToSize(value, contentWidth);
      if (y + wrapped.length * 5 > 275) { doc.addPage(); y = 20; }
      doc.text(wrapped, margin, y);
      y += wrapped.length * 5 + 2;
    }
  }
  y += 13;
  if (y > 270) { doc.addPage(); y = 20; }

  doc.setFontSize(9);
  doc.setTextColor(20, 20, 20);
  const note = "Generated from saved payment and account activity records.";
  doc.text(doc.splitTextToSize(note, contentWidth), margin, y);

  if (invoice.source) {
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`Data source: ${invoice.source}`, margin, 286);
  }

  return doc.output("arraybuffer");
}

async function handleGET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = request.headers.get("x-admin-session") || searchParams.get("token") || "";
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

export const GET=withAdminAccess(handleGET);
