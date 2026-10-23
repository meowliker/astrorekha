import crypto from "crypto";
import { getSupabaseAdmin } from "./supabase-admin";
import type { SoulmateEntitlements } from "./soulmate-cart";

type DB = ReturnType<typeof getSupabaseAdmin>;
export type WhatsAppKind = "invoice" | "sketch" | "description" | "timeline";
export type WhatsAppDocument = { kind: WhatsAppKind; filename: string; url: string; campaignName: string; params: string[] };
export type WhatsAppOrder = { id: string; customer_name: string; customer_phone: string; answer_revision: number; entitlements: SoulmateEntitlements };
export type WhatsAppLedger = {
  claim(kind: WhatsAppKind): Promise<"claimed" | "accepted" | "blocked">;
  accepted(kind: WhatsAppKind, providerId: string | null): Promise<void>;
  uncertain(kind: WhatsAppKind): Promise<void>;
};
const BUCKET = "soulmate-sketches-private";
const TABLE = "soulmate_whatsapp_deliveries";
const API = "https://backend.aisensy.com/campaign/t1/api/v2";
const titles = { sketch: "Soulmate Sketch", description: "Soulmate Description", timeline: "Soulmate Connection Timeline" };
const descriptions = {
  sketch: "A personalised sketch offering a glimpse of your soulmate.",
  description: "A detailed reading of your soulmate’s personality, qualities and the connection you may share.",
  timeline: "Your reading exploring how your connection could unfold over time.",
};

export function soulmateWhatsAppPhone(value: string) {
  const digits = value.replace(/[\s()+-]/g, "");
  const national = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  if (!/^[6-9]\d{9}$/.test(national)) throw new Error("Invalid Indian WhatsApp number");
  return `91${national}`;
}

export function soulmateWhatsAppKinds(entitlements: SoulmateEntitlements): WhatsAppKind[] {
  const expected = ["sketch", ...(entitlements.description ? ["description"] : []), ...(entitlements.timeline ? ["timeline"] : [])];
  if (!Array.isArray(entitlements.required_assets) || entitlements.required_assets.length !== expected.length ||
      expected.some(kind => !entitlements.required_assets.includes(kind as "sketch" | "description" | "timeline"))) {
    throw new Error("Inconsistent purchased report snapshot");
  }
  return ["invoice", ...expected] as WhatsAppKind[];
}

/** Preflight ALL purchased PDFs before submitting any WhatsApp message. URLs expire in 24 hours. */
export async function prepareSoulmateWhatsApp(db: DB, orderId: string) {
  const result = await db.from("soulmate_orders").select("*").eq("id", orderId).single();
  const order = result.data;
  if (result.error || !order || order.funnel !== "soulmate_standalone" || order.catalog_version !== 2 ||
      order.payment_status !== "paid" || order.review_status !== "approved") throw new Error("Paid, approved Soulmate order required");
  if (!Number.isFinite(Date.parse(order.scheduled_send_at)) || Date.parse(order.scheduled_send_at) > Date.now()) throw new Error("Order is not due for delivery");
  soulmateWhatsAppPhone(order.customer_phone);
  const kinds = soulmateWhatsAppKinds(order.entitlements);
  const [invoices, assets] = await Promise.all([
    db.from("soulmate_order_invoices").select("*").eq("order_id", orderId).eq("source", "purchase").single(),
    db.from("soulmate_order_assets").select("*").eq("order_id", orderId),
  ]);
  const invoice = invoices.data;
  if (invoices.error || assets.error || !invoice || invoice.snapshot?.orderId !== orderId ||
      !Number.isSafeInteger(invoice.snapshot.total) || invoice.snapshot.total !== order.amount) throw new Error("Order invoice unavailable or mismatched");
  const name = String(order.customer_name || "there").trim().split(/\s+/)[0];
  const documents: WhatsAppDocument[] = [];
  for (const kind of kinds) {
    const asset = kind === "invoice" ? {
      storage_path: invoice.storage_path, sha256: invoice.pdf_sha256, filename: `${invoice.invoice_number}.pdf`, size_bytes: null,
    } : assets.data?.find(row => row.kind === kind);
    if (!asset?.storage_path?.startsWith(`${orderId}/`) || !asset.sha256 || !asset.filename?.endsWith(".pdf")) throw new Error(`Missing ${kind} PDF`);
    const stored = await db.storage.from(BUCKET).download(asset.storage_path);
    if (stored.error || !stored.data) throw new Error(`Unable to read ${kind} PDF`);
    const bytes = Buffer.from(await stored.data.arrayBuffer());
    if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-")) || bytes.length > 7 * 1024 * 1024 ||
        (asset.size_bytes != null && bytes.length !== asset.size_bytes) ||
        crypto.createHash("sha256").update(bytes).digest("hex") !== asset.sha256) throw new Error(`${kind} PDF integrity check failed`);
    const signed = await db.storage.from(BUCKET).createSignedUrl(asset.storage_path, 86400);
    if (signed.error || !signed.data?.signedUrl) throw new Error("Unable to create private PDF access link");
    documents.push({ kind, filename: asset.filename, url: signed.data.signedUrl,
      campaignName: kind === "invoice"
        ? process.env.SOULMATE_AISENSY_INVOICE_CAMPAIGN || "soulmate_invoice_delivery_api"
        : process.env.SOULMATE_AISENSY_REPORT_CAMPAIGN || "soulmate_report_delivery_api",
      params: kind === "invoice"
        ? [name, orderId, invoice.invoice_number, (invoice.snapshot.total / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })]
        : [name, titles[kind], descriptions[kind], orderId],
    });
  }
  return { order: order as WhatsAppOrder, documents };
}

/** Acceptance is not handset delivery. Never retry an ambiguous POST without provider review. */
export async function dispatchSoulmateWhatsApp(order: WhatsAppOrder, documents: WhatsAppDocument[], ledger: WhatsAppLedger) {
  const key = process.env.AISENSY_API_KEY?.trim();
  if (!key) throw new Error("AiSensy API key is missing");
  const expected = soulmateWhatsAppKinds(order.entitlements);
  if (documents.length !== expected.length || documents.some((doc, i) => doc.kind !== expected[i])) throw new Error("Invoice-first document sequence required");
  const destination = soulmateWhatsAppPhone(order.customer_phone);
  const results: { kind: WhatsAppKind; status: "accepted" | "already_accepted"; providerId?: string | null }[] = [];
  for (const doc of documents) {
    const claim = await ledger.claim(doc.kind);
    if (claim === "accepted") { results.push({ kind: doc.kind, status: "already_accepted" }); continue; }
    if (claim !== "claimed") throw new Error(`${doc.kind} delivery requires review or is already in progress`);
    try {
      const response = await fetch(API, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ apiKey: key, campaignName: doc.campaignName, destination,
          userName: order.customer_name, source: "soulmate_report_delivery", templateParams: doc.params,
          media: { url: doc.url, filename: doc.filename } }),
      });
      const body = await response.json();
      if (!response.ok || !body || typeof body !== "object" ||
          String(body.success).toLowerCase() === "false" || body.status === false ||
          ["failed", "error", "failure"].includes(String(body.status).toLowerCase()) || body.error) {
        throw new Error("AiSensy did not accept the message");
      }
      const providerId = typeof body.messageId === "string" ? body.messageId : typeof body.id === "string" ? body.id : null;
      await ledger.accepted(doc.kind, providerId);
      results.push({ kind: doc.kind, status: "accepted", providerId });
    } catch {
      await ledger.uncertain(doc.kind);
      throw new Error(`${doc.kind} submission needs review in AiSensy before retrying`);
    }
  }
  return results;
}

function databaseLedger(db: DB, order: WhatsAppOrder): WhatsAppLedger {
  const token = crypto.randomUUID();
  return {
    async claim(kind) {
      const result = await db.rpc("claim_soulmate_whatsapp_message", {
        p_order: order.id, p_kind: kind, p_revision: order.answer_revision, p_token: token,
      });
      if (result.error) throw new Error("WhatsApp delivery log unavailable");
      return result.data;
    },
    async accepted(kind, providerId) {
      const saved = await db.from(TABLE).update({ status: "accepted", accepted_at: new Date().toISOString(), provider_message_id: providerId, last_error: null })
        .eq("order_id", order.id).eq("kind", kind).eq("attempt_token", token).eq("status", "submitting").select("order_id").single();
      if (saved.error || !saved.data) throw new Error("WhatsApp acknowledgement could not be saved");
    },
    async uncertain(kind) {
      const saved = await db.from(TABLE).update({ status: "needs_review", last_error: "Check AiSensy before retrying; submission may have succeeded." })
        .eq("order_id", order.id).eq("kind", kind).eq("attempt_token", token).eq("status", "submitting");
      if (saved.error) throw new Error("WhatsApp submission requires provider review");
    },
  };
}

/** Explicit operator send for one approved order, using the same durable duplicate protection. */
export async function sendSoulmateWhatsAppOrder(db: DB, orderId: string) {
  const { order, documents } = await prepareSoulmateWhatsApp(db, orderId);
  return dispatchSoulmateWhatsApp(order, documents, databaseLedger(db, order));
}

/** Separate opt-in and launch cutoff: enabling must never message historical buyers. */
export async function runSoulmateWhatsApp() {
  if (process.env.SOULMATE_WHATSAPP_ENABLED !== "true") return { processed: 0, failures: 0, disabled: true };
  const cutoff = process.env.SOULMATE_WHATSAPP_START_AT || "";
  if (!Number.isFinite(Date.parse(cutoff))) throw new Error("Soulmate WhatsApp launch date is required");
  if (!process.env.AISENSY_API_KEY) throw new Error("AiSensy API key is missing");
  const db = getSupabaseAdmin({ fresh: true });
  const due = await db.rpc("due_soulmate_whatsapp_orders", { p_start: new Date(cutoff).toISOString() });
  if (due.error) throw new Error("Soulmate WhatsApp queue unavailable; apply migration first");
  let failures = 0;
  // One order per cron keeps the four bounded provider calls within the request budget.
  for (const row of due.data || []) {
    try {
      await sendSoulmateWhatsAppOrder(db, row.id);
    } catch {
      failures++;
      // Prevent a corrupt/missing PDF from starving all subsequent orders.
      const existing = await db.from(TABLE).select("kind").eq("order_id", row.id);
      const missing = (["invoice", "sketch", "description", "timeline"] as const)
        .find(kind => !existing.data?.some(item => item.kind === kind));
      if (!existing.error && missing) await db.from(TABLE).upsert({ order_id: row.id, kind: missing, status: "needs_review",
        answer_revision: row.answer_revision, last_error: "WhatsApp preparation failed; check saved PDFs and delivery log." },
      { onConflict: "order_id,kind", ignoreDuplicates: true });
      console.warn("[soulmate-whatsapp] Delivery requires review", { orderId: row.id });
    }
  }
  return { processed: due.data?.length || 0, failures };
}
