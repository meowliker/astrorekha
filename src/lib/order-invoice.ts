import { jsPDF } from "jspdf";
import { getSupabaseAdmin } from "./supabase-admin";
import { DEFAULT_PRICING, normalizePricing, type PricingConfig } from "./pricing";
import { sendEmailWithAttachments } from "./brevo";

const PAID_STATUSES = new Set(["paid", "success", "captured"]);

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
  };

type UserRow = {
  id: string;
  email: string | null;
  name: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type OrderInvoice = {
  invoiceNumber: string;
  invoiceDate: string;
  customer: {
    userId: string;
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
  items: Array<{
    name: string;
    quantity: number;
    amount: number;
    txnId?: string;
    paymentId?: string;
  }>;
    subtotal: number;
    taxLines: Array<{
      label: string;
      ratePercent: number;
      amount: number;
    }>;
    total: number;
    currency: string;
    deliveryStatus: string;
  };

function firstDefined(...values: Array<string | null | undefined>): string {
  return values.find((value) => String(value || "").trim()) || "";
}

function normalizeComparable(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

function normalizeType(value: unknown): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "bundle") return "bundle_payment";
  return normalized || "unknown";
}

function splitTokens(value: string | null | undefined): string[] {
  return String(value || "")
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
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

function sanitizeInvoiceSuffixSource(value: string): string {
  return String(value || "").replace(/[^a-zA-Z0-9]/g, "");
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

function buildInvoiceNumber(now: Date, txnId: string, paymentId: string): string {
  const source = sanitizeInvoiceSuffixSource(txnId) || sanitizeInvoiceSuffixSource(paymentId);
  const fallback = Math.random().toString(36).slice(2);
  const suffix = (source || fallback).slice(-6).padStart(6, "0").toLowerCase();
  return `AR-INV-${getIstDateCompact(now)}-${suffix}`;
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

async function getPricingConfig(): Promise<PricingConfig> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("settings").select("value").eq("key", "pricing").maybeSingle();
  return normalizePricing(data?.value || DEFAULT_PRICING);
}

function findById<T extends { id: string; name: string }>(rows: T[], id: string): string | null {
  return rows.find((row) => row.id === id)?.name || null;
}

function resolvePaymentItemNames(payment: PaymentRow, pricing: PricingConfig): string[] {
  const type = normalizeType(payment.type);
  const bundleTokens = splitTokens(payment.bundle_id);
  const featureTokens = splitTokens(payment.feature);

  if (type === "bundle_payment") {
    const bundleId = bundleTokens[0] || "";
    return [findById(pricing.bundles, bundleId) || humanizeFeature(bundleId) || "Bundle Purchase"];
  }

  if (type === "coins") {
    return [`${payment.coins || "Coin"} Coins`];
  }

  if (type === "upsell") {
    const names = bundleTokens.map(
      (id) => findById(pricing.upsells, id) || findById(pricing.reports, id) || humanizeFeature(id)
    );
    return [...names, ...featureTokens.map(humanizeFeature)].filter(Boolean);
  }

  if (type === "report") {
    const names = bundleTokens.map((id) => findById(pricing.reports, id) || humanizeFeature(id));
    return [...names, ...featureTokens.map(humanizeFeature)].filter(Boolean);
  }

  const fallback = [...bundleTokens, ...featureTokens].map(humanizeFeature).filter(Boolean);
  return fallback.length ? fallback : ["AstroRekha Digital Service"];
}

function buildPaymentItems(payment: PaymentRow, pricing: PricingConfig): OrderInvoice["items"] {
  const itemNames = resolvePaymentItemNames(payment, pricing);
  const total = getPaymentInvoiceLineInr(payment);
  const lineAmount = itemNames.length ? total / itemNames.length : total;
  const txnId = firstDefined(payment.payu_txn_id, payment.id);
  const paymentId = firstDefined(payment.payu_payment_id);

  return itemNames.length
    ? itemNames.map((name) => ({
        name,
        quantity: 1,
          amount: roundMoney(lineAmount),
        txnId,
        paymentId,
      }))
    : [{ name: "AstroRekha Digital Service", quantity: 1, amount: total, txnId, paymentId }];
}

function belongsToSameCustomer(payment: PaymentRow, primaryPayment: PaymentRow): boolean {
  if (payment.id === primaryPayment.id) return true;
  const paymentUserId = normalizeComparable(payment.user_id);
  const primaryUserId = normalizeComparable(primaryPayment.user_id);
  if (paymentUserId && primaryUserId && paymentUserId === primaryUserId) return true;

  const paymentEmail = normalizeComparable(payment.customer_email);
  const primaryEmail = normalizeComparable(primaryPayment.customer_email);
  return Boolean(paymentEmail && primaryEmail && paymentEmail === primaryEmail);
}

async function findPaidPayment(txnId: string): Promise<PaymentRow | null> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("payments")
    .select("*")
    .or(`payu_txn_id.eq.${txnId},payu_payment_id.eq.${txnId},id.eq.${txnId}`)
    .order("created_at", { ascending: false })
    .limit(10);

  return ((data || []) as PaymentRow[]).find((row) =>
    PAID_STATUSES.has(String(row.payment_status || "").toLowerCase())
  ) || null;
}

async function findUser(payment: PaymentRow): Promise<UserRow | null> {
  const supabase = getSupabaseAdmin();
  if (payment.user_id) {
    const { data } = await supabase.from("users").select("id,email,name,created_at,updated_at").eq("id", payment.user_id).maybeSingle();
    if (data) return data as UserRow;
  }

  if (payment.customer_email) {
    const { data } = await supabase
      .from("users")
      .select("id,email,name,created_at,updated_at")
      .eq("email", payment.customer_email)
      .maybeSingle();
    if (data) return data as UserRow;
  }

  return null;
}

export async function buildCombinedOrderInvoice(txnIds: string[]): Promise<OrderInvoice> {
  const uniqueTxnIds = Array.from(new Set(txnIds.map((txnId) => txnId.trim()).filter(Boolean)));
  const foundPayments = await Promise.all(uniqueTxnIds.map((txnId) => findPaidPayment(txnId)));
  const payments = foundPayments.filter((payment): payment is PaymentRow => Boolean(payment));
  const uniquePayments = Array.from(new Map(payments.map((payment) => [payment.id, payment])).values());
  const payment = uniquePayments[0];

  if (!payment) {
    throw new Error("No paid payment found for invoice.");
  }

  if (!uniquePayments.every((paidPayment) => belongsToSameCustomer(paidPayment, payment))) {
    throw new Error("Invoice transactions do not belong to the same customer.");
  }

  const [pricing, user] = await Promise.all([getPricingConfig(), findUser(payment)]);
  const invoiceNow = new Date();
  const paidAt = firstDefined(payment.fulfilled_at, payment.created_at, invoiceNow.toISOString());
  const paymentTxnId = firstDefined(payment.payu_txn_id, payment.id);
  const paymentId = firstDefined(payment.payu_payment_id);
    const items = uniquePayments.flatMap((paidPayment) => buildPaymentItems(paidPayment, pricing));
    const subtotal = roundMoney(items.reduce((sum, item) => sum + item.amount, 0));
    const total = roundMoney(uniquePayments.reduce((sum, paidPayment) => sum + getPaymentTotalInr(paidPayment), 0));
    const taxLines: OrderInvoice["taxLines"] = [];

  return {
    invoiceNumber: buildInvoiceNumber(invoiceNow, paymentTxnId, paymentId),
    invoiceDate: invoiceNow.toISOString(),
    customer: {
      userId: user?.id || payment.user_id || "-",
      email: user?.email || payment.customer_email || "-",
    },
    payment: {
      status: payment.payment_status || "paid",
      type: normalizeType(payment.type),
      gateway: "PayU",
      txnId: paymentTxnId,
      paymentId,
      paidAt,
      },
      items,
      subtotal,
      taxLines,
      total,
    currency: payment.currency || "INR",
    deliveryStatus: "Completed digitally in-app",
  };
}

export async function buildOrderInvoice(txnId: string): Promise<OrderInvoice> {
  return buildCombinedOrderInvoice([txnId]);
}

export function generateOrderInvoicePdf(invoice: OrderInvoice): Buffer {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const rightX = pageWidth - margin;
  const contentWidth = pageWidth - margin * 2;
  let y = 18;

  const line = (lineY: number) => {
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.2);
    doc.line(margin, lineY, rightX, lineY);
  };

  const text = (value: string, x: number, lineY: number, options?: { maxWidth?: number; align?: "left" | "right" }) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 20);
    if (options?.maxWidth) {
      const lines = doc.splitTextToSize(value, options.maxWidth);
      doc.text(lines, x, lineY, { align: options.align || "left" });
      return lines.length * 5;
    }
    doc.text(value, x, lineY, { align: options?.align || "left" });
    return 5;
  };

    const paidAt = formatDate(invoice.payment.paidAt || invoice.invoiceDate);
    const invoiceDate = formatDate(invoice.invoiceDate);
    const totalLabel = `INR ${invoice.total.toFixed(2)}`;
    const hasTaxLines = invoice.taxLines.length > 0;

  doc.setFillColor(26, 32, 50);
  doc.rect(0, 0, pageWidth, 34, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.text("AstroRekha Invoice", margin, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Invoice No: ${invoice.invoiceNumber}`, rightX - 62, 14);
  doc.text(`Invoice Date: ${invoiceDate}`, rightX - 62, 24);

  y = 54;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(20, 20, 20);
  doc.text("Billed To", margin, y);
  y += 8;
  y += text(`Email: ${invoice.customer.email}`, margin, y, { maxWidth: contentWidth }) + 1;
  y += text(`User ID: ${invoice.customer.userId}`, margin, y, { maxWidth: contentWidth }) + 5;

  line(y);
  y += 10;
  y += text(`Payment Gateway: ${invoice.payment.gateway}`, margin, y) + 1;
  y += text(`Payment Status: ${invoice.payment.status}`, margin, y) + 1;
  y += text(`Paid At: ${paidAt}`, margin, y) + 5;

  line(y);
  y += 9;
  doc.setFillColor(242, 245, 248);
  doc.rect(margin, y - 5, contentWidth, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text("#", margin + 2, y);
  doc.text("Item", margin + 9, y);
  doc.text("Txn ID", margin + 66, y);
  doc.text("Payment ID", margin + 109, y);
  doc.text("Qty", rightX - 40, y);
  doc.text(`Amount (${invoice.currency})`, rightX - 4, y, { align: "right" });
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  invoice.items.forEach((item, index) => {
    const itemLines = doc.splitTextToSize(item.name, 52);
    const txnLines = doc.splitTextToSize(item.txnId || "-", 40);
    const paymentLines = doc.splitTextToSize(item.paymentId || "-", 37);
    const rowHeight = Math.max(itemLines.length, txnLines.length, paymentLines.length, 1) * 4 + 4;

    doc.text(String(index + 1), margin + 2, y);
    doc.text(itemLines, margin + 9, y);
    doc.text(txnLines, margin + 66, y);
    doc.text(paymentLines, margin + 109, y);
    doc.text(String(item.quantity), rightX - 39, y);
    doc.text(`INR ${item.amount.toFixed(2)}`, rightX - 4, y, { align: "right" });
    y += rowHeight;
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
    doc.setFontSize(12);
    doc.text(`Total: ${totalLabel}`, rightX, y, { align: "right" });
    y += 14;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  y += text(
    "Your purchase has been delivered digitally to your AstroRekha account ",
    margin,
    y,
    { maxWidth: contentWidth }
  );

  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text("AstroRekha digital order invoice", margin, 286);

  return Buffer.from(doc.output("arraybuffer"));
}

export async function sendOrderInvoiceEmail(txnId: string): Promise<OrderInvoice> {
  return sendCombinedOrderInvoiceEmail([txnId]);
}

export async function sendCombinedOrderInvoiceEmail(txnIds: string[]): Promise<OrderInvoice> {
  const invoice = await buildCombinedOrderInvoice(txnIds);
  const recipientEmail = invoice.customer.email;
  if (!recipientEmail || recipientEmail === "-") {
    throw new Error("Cannot send invoice email without customer email.");
  }

  const pdf = generateOrderInvoicePdf(invoice);
  const subject = `Order Confirmation`;
  const itemList = invoice.items
    .map((item, index) => {
      const label = index === 0 ? "Bundle" : "Upsell";
      return `<li><strong>${label}:</strong> ${item.name} - INR ${item.amount.toFixed(2)}</li>`;
    })
    .join("");
  const taxSummary = invoice.taxLines.length
    ? `
<p><strong>Tax Summary:</strong><br/>
Bundle Price: INR ${invoice.subtotal.toFixed(2)}<br/>
${invoice.taxLines
  .map((taxLine) => `${taxLine.label} (${taxLine.ratePercent}%): INR ${taxLine.amount.toFixed(2)}`)
  .join("<br/>")}<br/>
Total Paid: INR ${invoice.total.toFixed(2)}</p>`
    : `<p><strong>Total Paid:</strong> INR ${invoice.total.toFixed(2)}</p>`;
  const html = `
    <p>Namaste 🙏🏻</p>

<p>Thank you for your purchase! Your AstroRekha bundle has been confirmed and is now available in the app.</p>

  <p><strong>Order Summary:</strong></p>
  <ul>${itemList}</ul>
  ${taxSummary}

<p>
  Log in to AstroRekha to access your reports and begin your journey:<br/>
  <a href="https://astrorekha.com/login">astrorekha.com/login</a>
</p>

<p>
  For any questions, reach us at <a href="mailto:team.astrorekha@gmail.com">team.astrorekha@gmail.com</a>.<br/><br/>
</p>

<p>
  With gratitude,<br/>
  <strong>Team AstroRekha</strong>
</p>
  `;

  await sendEmailWithAttachments(
    { email: recipientEmail },
    subject,
    html,
    [
      {
        name: `${invoice.invoiceNumber}.pdf`,
        content: pdf.toString("base64"),
      },
    ]
  );

  return invoice;
}
