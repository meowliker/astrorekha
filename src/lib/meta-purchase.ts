import crypto from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { normalizeIndianWhatsappNumber } from "@/lib/whatsapp";

const META_EVENTS_URL = "https://graph.facebook.com/v26.0";
const CLAIM_TIMEOUT_MS = 5 * 60 * 1000;
const PAID_STATUSES = ["paid", "success", "captured"];

export type MetaPurchaseOrder = {
  id: string;
  payu_txn_id?: string | null;
  payment_status?: string | null;
  amount: number;
  customer_email?: string | null;
  user_id?: string | null;
  fbc?: string | null;
  fbp?: string | null;
  bundle_id?: string | null;
  feature?: string | null;
  type?: string | null;
  meta_client_user_agent?: string | null;
  fulfilled_at?: string | null;
  meta_purchase_sent_at?: string | null;
};

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function buildMetaPurchaseEvent(
  order: MetaPurchaseOrder,
  options: { email?: string | null; phone?: string | null; productName?: string | null } = {}
) {
  const email = (options.email || order.customer_email || "").trim().toLowerCase();
  const phone = normalizeIndianWhatsappNumber(options.phone).replace(/\D/g, "");
  const userData: Record<string, string | string[]> = {};
  if (email && email !== "customer@astrorekha.com") userData.em = [sha256(email)];
  if (phone) userData.ph = [sha256(phone)];
  if (order.fbc) userData.fbc = order.fbc;
  if (order.fbp) userData.fbp = order.fbp;
  if (order.meta_client_user_agent) userData.client_user_agent = order.meta_client_user_agent;

  const productId = order.bundle_id || order.feature || order.type || "purchase";
  const purchaseTime = order.fulfilled_at ? Date.parse(order.fulfilled_at) : Number.NaN;

  return {
    event_name: "Purchase" as const,
    event_time: Math.floor((Number.isFinite(purchaseTime) ? purchaseTime : Date.now()) / 1000),
    // The browser Pixel uses PayU's txnId as eventID. Match it for Meta deduplication.
    event_id: order.payu_txn_id || order.id,
    action_source: "website" as const,
    event_source_url: "https://astrorekha.com/payment/processing",
    user_data: userData,
    custom_data: {
      currency: "INR" as const,
      value: Number((order.amount / 100).toFixed(2)),
      content_ids: [productId],
      content_name: options.productName || productId,
      content_type: "product" as const,
      order_id: order.payu_txn_id || order.id,
    },
  };
}

/** Send only after PayU has confirmed payment; failed sends remain available for retry. */
export async function sendMetaPurchase(
  order: MetaPurchaseOrder,
  options: { email?: string | null; phone?: string | null; productName?: string | null } = {}
): Promise<"sent" | "skipped"> {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim();
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN?.trim();
  if (!pixelId || !accessToken || order.meta_purchase_sent_at) return "skipped";
  if (!PAID_STATUSES.includes((order.payment_status || "").toLowerCase())) return "skipped";
  if (!Number.isFinite(order.amount) || order.amount <= 0) return "skipped";

  const supabase = getSupabaseAdmin();
  const claimTime = new Date().toISOString();
  const staleBefore = new Date(Date.now() - CLAIM_TIMEOUT_MS).toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from("payments")
    .update({ meta_purchase_claimed_at: claimTime })
    .eq("id", order.id)
    .in("payment_status", PAID_STATUSES)
    .is("meta_purchase_sent_at", null)
    .or(`meta_purchase_claimed_at.is.null,meta_purchase_claimed_at.lt.${staleBefore}`)
    .select("id")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return "skipped";

  try {
    const response = await fetch(`${META_EVENTS_URL}/${encodeURIComponent(pixelId)}/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ data: [buildMetaPurchaseEvent(order, options)] }),
      signal: AbortSignal.timeout(5000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.error || result.events_received !== 1) {
      throw new Error(`Meta Conversions API rejected purchase (HTTP ${response.status}, code ${result.error?.code || "unknown"})`);
    }

    const { error: stampError } = await supabase.from("payments")
      .update({ meta_purchase_sent_at: new Date().toISOString(), meta_purchase_claimed_at: null })
      .eq("id", order.id)
      .eq("meta_purchase_claimed_at", claimTime);
    if (stampError) throw stampError;
    return "sent";
  } finally {
    await supabase.from("payments")
      .update({ meta_purchase_claimed_at: null })
      .eq("id", order.id)
      .eq("meta_purchase_claimed_at", claimTime)
      .is("meta_purchase_sent_at", null);
  }
}
