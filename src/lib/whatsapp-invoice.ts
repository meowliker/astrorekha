import type { OrderInvoice } from "@/lib/order-invoice";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { sendAiSensyCampaign } from "@/lib/aisensy";
import { createInvoiceAccessToken } from "@/lib/invoice-access-token";
import { normalizeIndianWhatsappNumber } from "@/lib/whatsapp";

type WhatsappSubscriberRow = {
  id: string;
  user_id: string | null;
  email: string | null;
  whatsapp_e164: string | null;
  whatsapp_number: string | null;
};

type WhatsappInvoiceResult = {
  success: boolean;
  status: "queued" | "sent" | "skipped" | "failed";
  reason?: string;
};

type WhatsappMessageRow = {
  id: string;
  status: string | null;
  payload: Record<string, unknown> | null;
};

function cleanText(value: unknown): string {
  return String(value || "").trim();
}

function cleanEmail(value: unknown): string {
  return cleanText(value).toLowerCase();
}

function getAppBaseUrl(): string {
  const value =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.APP_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    "https://astrorekha.com";

  const normalized = cleanText(value).replace(/\/$/, "");
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return normalized;
  }
  return `https://${normalized}`;
}

function createInvoiceDocumentUrl(txnIds: string[]): string {
  const token = createInvoiceAccessToken(txnIds);
  return `${getAppBaseUrl()}/api/invoice/document?token=${encodeURIComponent(token)}`;
}

function isPublicDocumentUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      hostname !== "localhost" &&
      hostname !== "127.0.0.1" &&
      hostname !== "0.0.0.0" &&
      !hostname.endsWith(".local")
    );
  } catch {
    return false;
  }
}

function getStableDedupeKey(txnIds: string[]): string {
  return `invoice_delivery:${Array.from(new Set(txnIds.map((txnId) => txnId.trim()).filter(Boolean)))
    .sort()
    .join("|")}`;
}

async function findWhatsappSubscriber(invoice: OrderInvoice): Promise<WhatsappSubscriberRow | null> {
  const supabase = getSupabaseAdmin();
  const userId = cleanText(invoice.customer.userId);
  const email = cleanEmail(invoice.customer.email);

  if (userId && userId !== "-") {
    const { data } = await supabase
      .from("whatsapp_subscribers")
      .select("id,user_id,email,whatsapp_e164,whatsapp_number")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data as WhatsappSubscriberRow;
  }

  if (email && email !== "-") {
    const { data } = await supabase
      .from("whatsapp_subscribers")
      .select("id,user_id,email,whatsapp_e164,whatsapp_number")
      .eq("email", email)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data as WhatsappSubscriberRow;
  }

  if (userId && userId !== "-") {
    const { data } = await supabase
      .from("users")
      .select("id,email,whatsapp_number")
      .eq("id", userId)
      .maybeSingle();
    const whatsappE164 = normalizeIndianWhatsappNumber(data?.whatsapp_number);
    if (data && whatsappE164) {
      return {
        id: "",
        user_id: data.id,
        email: data.email,
        whatsapp_e164: whatsappE164,
        whatsapp_number: whatsappE164,
      };
    }
  }

  return null;
}

export async function sendInvoiceDeliveryWhatsapp(
  invoice: OrderInvoice,
  txnIds: string[]
): Promise<WhatsappInvoiceResult> {
  const supabase = getSupabaseAdmin();
  const campaignName = cleanText(process.env.AISENSY_INVOICE_CAMPAIGN) || "invoice_delivery_1";
  const dedupeKey = getStableDedupeKey(txnIds);
  const { data: existing } = await supabase
    .from("whatsapp_messages")
    .select("id,status,payload")
    .eq("dedupe_key", dedupeKey)
    .maybeSingle();

  if (existing && ["pending", "sent", "queued", "delivered"].includes(String(existing.status || ""))) {
    return { success: true, status: "skipped", reason: "already_sent_or_pending" };
  }

  const subscriber = await findWhatsappSubscriber(invoice);
  const whatsappE164 = normalizeIndianWhatsappNumber(subscriber?.whatsapp_e164 || subscriber?.whatsapp_number);
  if (!subscriber || !whatsappE164) {
    return { success: false, status: "skipped", reason: "missing_whatsapp_number" };
  }

  const destination = whatsappE164.replace(/\D/g, "");
  const customerEmail = cleanEmail(invoice.customer.email);
  const contactName = "AstroRekha Customer";
  const documentUrl = createInvoiceDocumentUrl(txnIds);
  const amount = invoice.total.toFixed(2);
  const messagePayload = {
    dedupeKey,
    invoiceNumber: invoice.invoiceNumber,
    txnIds,
    amount,
    documentUrl,
    templateParams: [invoice.invoiceNumber, amount],
  };

  let messageRow = existing as WhatsappMessageRow | null;
  if (messageRow) {
    await supabase
      .from("whatsapp_messages")
      .update({
        user_id: subscriber.user_id || invoice.customer.userId,
        whatsapp_e164: whatsappE164,
        email: subscriber.email || customerEmail,
        aisensy_campaign_name: campaignName,
        template_name: campaignName,
        status: "pending",
        payload: messagePayload,
        updated_at: new Date().toISOString(),
      })
      .eq("id", messageRow.id);
  } else {
    const { data: insertedMessageRow, error: insertError } = await supabase
      .from("whatsapp_messages")
      .insert({
        user_id: subscriber.user_id || invoice.customer.userId,
        whatsapp_e164: whatsappE164,
        email: subscriber.email || customerEmail,
        message_type: "invoice_delivery",
        aisensy_campaign_name: campaignName,
        template_name: campaignName,
        status: "pending",
        dedupe_key: dedupeKey,
        payload: messagePayload,
      })
      .select("id,status,payload")
      .maybeSingle();

    if (insertError) {
      if (insertError.code === "23505") {
        return { success: true, status: "skipped", reason: "already_sent_or_pending" };
      }
      console.error("[whatsapp-invoice] message log insert failed", insertError);
      return { success: false, status: "failed", reason: "failed_to_log_message" };
    }
    messageRow = insertedMessageRow as WhatsappMessageRow | null;
  }

  if (!isPublicDocumentUrl(documentUrl)) {
    const reason = "invoice_document_url_must_be_public_https";
    await supabase
      .from("whatsapp_messages")
      .update({
        status: "failed",
        response: { reason, documentUrl },
        sent_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", messageRow?.id);
    return { success: false, status: "failed", reason };
  }

  const result = await sendAiSensyCampaign({
    campaignName,
    destination,
    userName: contactName,
    source: "astrorekha_invoice",
    media: {
      url: documentUrl,
      filename: `${invoice.invoiceNumber}.pdf`,
    },
    templateParams: [invoice.invoiceNumber, amount],
    tags: ["customer", "invoice"],
    attributes: {
      email: customerEmail,
      invoice_number: invoice.invoiceNumber,
      total_paid: amount,
    },
  });

  const nextStatus = result.success ? "sent" : result.skipped ? "skipped" : "failed";
  const nowIso = new Date().toISOString();
  await supabase
    .from("whatsapp_messages")
    .update({
      status: nextStatus,
      response: result.response || { reason: result.reason },
      sent_at: result.success ? nowIso : null,
      updated_at: nowIso,
    })
    .eq("id", messageRow?.id);

  if (result.success) {
    await supabase
      .from("whatsapp_subscribers")
      .update({ last_invoice_sent_at: nowIso, updated_at: nowIso })
      .eq("whatsapp_e164", whatsappE164);
  }

  return {
    success: result.success,
    status: result.success ? "sent" : result.skipped ? "skipped" : "failed",
    reason: result.reason,
  };
}

export async function resendInvoiceDeliveryWhatsappMessage(messageId: string): Promise<WhatsappInvoiceResult> {
  const supabase = getSupabaseAdmin();
  const { data: message, error } = await supabase
    .from("whatsapp_messages")
    .select("id,message_type,payload,status")
    .eq("id", messageId)
    .maybeSingle();

  if (error || !message) {
    return { success: false, status: "failed", reason: "message_not_found" };
  }

  if (message.message_type !== "invoice_delivery") {
    return { success: false, status: "failed", reason: "unsupported_message_type" };
  }

  const payload = (message.payload || {}) as Record<string, unknown>;
  const txnIds = Array.isArray(payload.txnIds)
    ? payload.txnIds.map((txnId) => cleanText(txnId)).filter(Boolean)
    : [];
  if (!txnIds.length) {
    return { success: false, status: "failed", reason: "missing_transaction_ids" };
  }

  const { buildCombinedOrderInvoice } = await import("@/lib/order-invoice");
  const invoice = await buildCombinedOrderInvoice(txnIds);
  return sendInvoiceDeliveryWhatsapp(invoice, txnIds);
}
