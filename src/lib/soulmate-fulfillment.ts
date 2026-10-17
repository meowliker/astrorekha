import type { SoulmateEntitlements } from "./soulmate-cart";
import { soulmateDeliveryTemplate } from "./soulmate-delivery-template";
import crypto from "crypto";
import dns from "node:dns/promises";
import { isIP } from "node:net";
import { getSupabaseAdmin } from "./supabase-admin";
import { choices, getZodiac, sanitizeAnswers, steps, type Answers } from "@/app/soulmate/chat-data";

export const SKETCH_BUCKET = "soulmate-sketches-private";
type DB = ReturnType<typeof getSupabaseAdmin>;
export type GenerationJob = { order_id: string; answer_revision: number; status: string; lease_id: string; provider_job_id: string | null; prompt: string | null; generation_attempts: number; failures: number; storage_path: string | null; image_sha256: string | null; created_at: string };
type Order = { answer_revision: number; catalog_version?: number; review_status?: string; entitlements?: SoulmateEntitlements; id: string; answers: Answers; customer_email: string; customer_name: string; paid_at: string; payment_status: string; scheduled_send_at: string };
type Email = { id: string; order_id: string; status: string; scheduled_at: string; provider_message_id: string | null; submitted_at: string | null };
const later = (minutes: number) => new Date(Date.now() + minutes * 60000).toISOString();

/** Use confirmed preference, never the earlier unconfirmed selection. No contact details sent to Kie. */
export function buildStandalonePrompt(orderId: string, value: Answers, paidAt: string) {
  const a = sanitizeAnswers(value);
  if (steps.some((s) => !a[s])) throw new Error("Incomplete order answers");
  const either = parseInt(crypto.createHash("sha256").update(orderId).digest("hex").slice(0, 2), 16) % 2 === 0 ? "man" : "woman";
  const subject = a.preference === "I like men" ? "man" : a.preference === "I like women" ? "woman" : either;
  const date = new Date(paidAt);
  const birth = new Date(`${a.birthDate}T00:00:00Z`);
  let age = date.getUTCFullYear() - birth.getUTCFullYear();
  if (date.getUTCMonth() < birth.getUTCMonth() || (date.getUTCMonth() === birth.getUTCMonth() && date.getUTCDate() < birth.getUTCDate())) age--;
  if (!Number.isFinite(age) || age < 18) throw new Error("Invalid adult birth date");
  const feeling = a.feeling === choices.feeling[1] ? "an expressive, confident gaze and warm romantic presence" : a.feeling === choices.feeling[2] ? "a peaceful, relaxed expression and gentle presence" : "a kind, steady gaze and reassuring warmth";
  const heart = choices.heart.includes(a.heart!) ? "Convey emotional warmth and hope through the expression." : "";
  const background = a.ethnicity === "Any Indian background" ? "Indian background" : `${a.ethnicity} background`;
  return `Create one realistic graphite pencil portrait of an adult ${subject}, approximately ${Math.max(18, age - 3)}–${age + 3} years old, with ${background}. ${feeling}. ${heart} Gentle ${getZodiac(a.birthDate!).element.toLowerCase()} zodiac-inspired mood, without symbols. Head and shoulders, one person only, detailed natural facial features and hair, hand-drawn pencil texture on cream paper. Black and white, square composition, whole head visible. No text, watermark, signature, frame, astrology symbols, extra faces or photographs. This is an imaginative artistic portrait, not a prediction or identification of a real person.`;
}

async function patchJob(db: DB, job: GenerationJob, patch: Record<string, unknown>) {
  const { data, error } = await db.from("soulmate_generation_jobs").update({ ...patch, updated_at: new Date().toISOString() })
    .eq("order_id", job.order_id).eq("lease_id", job.lease_id).select("order_id").single();
  if (error || !data) throw new Error("Unable to checkpoint generation job");
}
async function patchEmail(db: DB, email: Email, patch: Record<string, unknown>) {
  const { error } = await db.from("soulmate_email_deliveries").update({ ...patch, updated_at: new Date().toISOString() }).eq("order_id", email.order_id);
  if (error) throw new Error("Unable to checkpoint email");
}
class StaleGenerationJob extends Error {}
async function assertCurrentGeneration(db: DB, job: GenerationJob, order: Order) {
  const current = await db.rpc("begin_soulmate_delivery", { p_order: job.order_id, p_revision: job.answer_revision, p_lease: job.lease_id });
  if (current.error) throw new Error("Unable to claim delivery submission");
  if (!current.data || job.answer_revision !== order.answer_revision) {
    throw new StaleGenerationJob("Order answers changed during generation");
  }
}
function kieHeaders() {
  if (!process.env.KIE_API_KEY) throw new Error("Missing KIE_API_KEY");
  return { "Content-Type": "application/json", Authorization: `Bearer ${process.env.KIE_API_KEY}` };
}
function brevoHeaders() {
  if (!process.env.BREVO_API_KEY) throw new Error("Missing BREVO_API_KEY");
  return { "Content-Type": "application/json", "api-key": process.env.BREVO_API_KEY };
}
const kieBase = () => (process.env.KIE_API_BASE_URL || "https://api.kie.ai").replace(/\/$/, "");

export function privateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  // Only globally routable IPv6 unicast; reject mapped IPv4, loopback and link-local.
  return !/^[23][0-9a-f]{3}:/i.test(ip);
}
async function downloadImage(source: string): Promise<{ buffer: Buffer; contentType: string; extension: string }> {
  const url = new URL(source);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) throw new Error("Invalid image URL");
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => privateAddress(address))) throw new Error("Invalid image host");
  const response = await fetch(url, { signal: AbortSignal.timeout(20000), redirect: "error" });
  if (!response.ok || !response.body || Number(response.headers.get("content-length")) > 7 * 1024 * 1024) throw new Error("Image download failed or image too large");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.length;
    if (length > 7 * 1024 * 1024) { await reader.cancel(); throw new Error("Image exceeds email attachment limit"); }
    chunks.push(part.value);
  }
  const buffer = Buffer.concat(chunks);
  const png = buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpg = buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  const webp = buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  if (!png && !jpg && !webp) throw new Error("Provider did not return an image");
  return { buffer, contentType: png ? "image/png" : jpg ? "image/jpeg" : "image/webp", extension: png ? "png" : jpg ? "jpg" : "webp" };
}
export function emailBody(order: Order, email: Email, attachment: Buffer, filename: string, now = Date.now()) {
  // Plain greeting avoids interpolating user-controlled HTML into the email.
  return {
    sender: { email: process.env.BREVO_SENDER_EMAIL || "team@astrorekha.com", name: "Astro Rekha" },
    to: [{ email: order.customer_email, name: order.customer_name }],
    subject: "Your personalized soulmate sketch is here",
    htmlContent: `<p>Hello,</p><p>Your personalized soulmate sketch is attached. It was created using the preferences you confirmed when ordering.</p><p>You can download and keep the attached image.</p><p>Order reference: ${order.id}</p><p>With warmth,<br>Astro Rekha</p><p><small>An artistic interpretation for entertainment and self-reflection.</small></p>`,
    attachment: [{ name: filename, content: attachment.toString("base64") }],
    batchId: email.id, headers: { idempotencyKey: email.id }, tags: ["soulmate_standalone", order.id],
    ...(new Date(email.scheduled_at).getTime() > now + 60000 ? { scheduledAt: email.scheduled_at } : {}),
  };
}

async function reconcileEmail(db: DB, order: Order, email: Email) {
  const headers = brevoHeaders();
  if (!email.provider_message_id) {
    // Recover a timed-out submission using the durable batch id. Never blindly POST again.
    const res = await fetch(`https://api.brevo.com/v3/smtp/emailStatus/${encodeURIComponent(email.id)}`, { headers, signal: AbortSignal.timeout(15000) });
    if (res.status !== 404 && !res.ok) throw new Error("Email schedule lookup unavailable");
    const payload = res.ok ? await res.json() : {};
    const batches = payload.batches || [];
    // Batch status confirms acceptance, but does not include message IDs.
    // Recover that ID from events tagged with this unique order when sending begins.
    const eventsUrl = new URL("https://api.brevo.com/v3/smtp/statistics/events");
    eventsUrl.search = new URLSearchParams({ tags: JSON.stringify([order.id]), email: order.customer_email, limit: "100", days: "30" }).toString();
    const eventsRes = await fetch(eventsUrl, { headers, signal: AbortSignal.timeout(15000) });
    if (!eventsRes.ok) throw new Error("Email recovery lookup unavailable");
    const activity = await eventsRes.json();
    const event = (activity.events || []).find((e: { email: string; tag?: string; tags?: string[]; messageId?: string }) =>
      e.email?.toLowerCase() === order.customer_email.toLowerCase() && (e.tag?.split(",").includes(order.id) || e.tags?.includes(order.id)) && e.messageId);
    if (event?.messageId) {
      await patchEmail(db, email, { provider_message_id: event.messageId, status: "sent", last_error: null });
    } else if (batches.length && Date.now() < new Date(email.scheduled_at).getTime() + 24 * 3600000) {
      await patchEmail(db, email, { status: "scheduled", last_error: null });
    } else if (!email.submitted_at || Date.now() > new Date(email.submitted_at).getTime() + 10 * 60000) {
      await patchEmail(db, email, { status: "needs_review", last_error: "Email request outcome unknown; check Brevo batch before retrying" });
    }
    return;
  }
  const url = new URL("https://api.brevo.com/v3/smtp/statistics/events");
  url.search = new URLSearchParams({ messageId: email.provider_message_id, limit: "100", days: "30" }).toString();
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error("Email delivery lookup unavailable");
  const payload = await res.json();
  const events = (payload.events || []).filter((e: { messageId: string; email: string }) => e.messageId === email.provider_message_id && e.email.toLowerCase() === order.customer_email.toLowerCase());
  const sentEvent = events.find((e: { event: string }) => e.event === "requests" || e.event === "request");
  if (sentEvent?.date && Number.isFinite(Date.parse(sentEvent.date))) await patchEmail(db, email, { sent_at: new Date(sentEvent.date).toISOString() });
  const delivered = events.find((e: { event: string }) => e.event === "delivered");
  if (delivered) {
    const deliveredAt = new Date(delivered.date).toISOString();
    // If the second write fails, the next worker run retries it before ending the job.
    const { error } = await db.from("soulmate_orders").update({ fulfillment_status: "delivered", delivered_at: deliveredAt }).eq("id", order.id).eq("payment_status", "paid");
    if (error) throw new Error("Unable to save delivery confirmation");
    await patchEmail(db, email, { status: "delivered", delivered_at: deliveredAt, last_error: null });
  } else if (events.some((e: { event: string }) => ["hard_bounce", "soft_bounce", "blocked", "invalid", "error"].includes(e.event))) {
    await patchEmail(db, email, { status: "needs_review", last_error: "Brevo reported a delivery failure; check recipient and provider log" });
  } else if (Date.now() > new Date(email.scheduled_at).getTime() + 24 * 3600000) {
    await patchEmail(db, email, { status: "needs_review", last_error: "No delivery confirmation within 24 hours; check Brevo" });
  } else if (events.some((e: { event: string }) => e.event === "requests" || e.event === "request")) {
    await patchEmail(db, email, { status: "sent" });
  }
}

export async function reviewedAttachments(db: DB, order: Pick<Order, "id" | "entitlements">) {
  const required = order.entitlements?.required_assets;
  if (!required?.includes("sketch")) throw new Error("Missing purchased deliverable snapshot");
  const result = await db.from("soulmate_order_assets").select("kind,storage_path,filename,sha256,size_bytes").eq("order_id", order.id);
  if (result.error || !result.data || required.some((kind) => !result.data.some((asset) => asset.kind === kind))) throw new Error("A purchased deliverable is missing");
  const assets = required.map((kind) => result.data.find((asset) => asset.kind === kind)!);
  if (assets.reduce((sum, asset) => sum + asset.size_bytes, 0) > 7 * 1024 * 1024) throw new Error("Combined attachments exceed email limit");
  return Promise.all(assets.map(async (asset) => {
    if (!asset.storage_path.startsWith(`${order.id}/`)) throw new Error("Wrong order attachment");
    const stored = await db.storage.from(SKETCH_BUCKET).download(asset.storage_path);
    if (stored.error || !stored.data) throw new Error("Saved deliverable unavailable");
    const buffer = Buffer.from(await stored.data.arrayBuffer());
    if (buffer.length !== asset.size_bytes || crypto.createHash("sha256").update(buffer).digest("hex") !== asset.sha256) throw new Error("Deliverable integrity check failed");
    return { name: asset.filename, content: buffer.toString("base64") };
  }));
}

/** One durable stage per claim; no long request waits for an image to finish generating. */
export async function processSoulmateJob(db: DB, job: GenerationJob) {
  let next = later(1);
  try {
    const orderResult = await db.from("soulmate_orders").select("*").eq("id", job.order_id).single();
    const emailResult = await db.from("soulmate_email_deliveries").select("*").eq("order_id", job.order_id).single();
    if (orderResult.error || emailResult.error) throw new Error("Unable to read fulfillment records");
    const order = orderResult.data as Order;
    const email = emailResult.data as Email;
    if (order.payment_status !== "paid") throw new Error("Order is not paid");
    if (order.catalog_version === 2) {
      // Purchased reports stay manual until the merchant has reviewed every deliverable.
      // Recheck here as well as in the DB claim so no stale/direct invocation can send early.
      if (order.review_status !== "approved" || !Number.isFinite(Date.parse(order.scheduled_send_at)) || Date.parse(order.scheduled_send_at) > Date.now()) {
        await patchJob(db, job, { lease_id: null, lease_until: null, next_attempt_at: later(5) });
        return { orderId: job.order_id, ok: true };
      }
      if (["scheduled", "sent", "submitting"].includes(email.status)) {
        await reconcileEmail(db, order, email);
      } else if (email.status === "pending") {
        const headers = brevoHeaders();
        const attachments = await reviewedAttachments(db, order);
        await assertCurrentGeneration(db, job, order);
        const body = { ...emailBody(order, email, Buffer.from(""), "unused"),
          ...soulmateDeliveryTemplate(order),
          attachment: attachments,
        };
        const response = await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
        const payload = await response.json();
        if (!response.ok || !payload.messageId) throw new Error("Brevo submission did not return a message id");
        await patchEmail(db, email, { status: "sent", provider_message_id: payload.messageId, last_error: null });
      }
      await patchJob(db, job, { lease_id: null, lease_until: null, next_attempt_at: later(5) });
      return { orderId: job.order_id, ok: true };
    }
    if (job.status === "submitting") {
      await patchJob(db, job, { status: "needs_review", last_error: "Image request outcome unknown; check Kie before creating another task" });
    } else if (job.status === "queued") {
      const headers = kieHeaders();
      const prompt = job.prompt || buildStandalonePrompt(order.id, order.answers, order.paid_at);
      await patchJob(db, job, { status: "submitting", prompt, generation_attempts: job.generation_attempts + 1 });
      const res = await fetch(`${kieBase()}/api/v1/jobs/createTask`, {
        method: "POST", headers, signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ model: "nano-banana-2", input: { prompt, aspect_ratio: "1:1", resolution: "2K", output_format: "jpg", google_search: false, image_input: [] } }),
      });
      const payload = await res.json();
      if (!res.ok || payload.code !== 200 || !payload.data?.taskId) throw new Error("Kie task submission did not return a task id");
      await patchJob(db, job, { status: "generating", provider_job_id: payload.data.taskId, failures: 0, last_error: null });
    } else if (job.status === "generating") {
      if (!job.provider_job_id) throw new Error("Missing generation task id");
      const res = await fetch(`${kieBase()}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(job.provider_job_id)}`, { headers: kieHeaders(), signal: AbortSignal.timeout(15000), cache: "no-store" });
      if (!res.ok) throw new Error("Kie status unavailable");
      const payload = await res.json();
      if (payload.code !== 200 || !payload.data) throw new Error("Kie task status unavailable");
      const state = payload.data.state;
      if (["fail", "failed"].includes(state)) {
        await patchJob(db, job, { status: job.generation_attempts < 3 ? "queued" : "needs_review", provider_job_id: null, last_error: "Kie generation failed" });
        next = later(5);
      } else if (state === "success") {
        const result = JSON.parse(payload.data.resultJson || "{}");
        const image = await downloadImage(result.resultUrls?.[0]);
        const storagePath = `${order.id}/revision-${job.answer_revision}/sketch.${image.extension}`;
        const upload = await db.storage.from(SKETCH_BUCKET).upload(storagePath, image.buffer, { contentType: image.contentType, upsert: false });
        if (upload.error) {
          // Crash recovery: verify an existing object rather than overwriting an already saved sketch.
          const existing = await db.storage.from(SKETCH_BUCKET).download(storagePath);
          if (existing.error || !existing.data) throw new Error("Unable to save sketch");
          image.buffer = Buffer.from(await existing.data.arrayBuffer());
        }
        await patchJob(db, job, { status: "ready", storage_path: storagePath, image_sha256: crypto.createHash("sha256").update(image.buffer).digest("hex"), failures: 0, last_error: null });
      } else if (Date.now() > new Date(job.created_at).getTime() + 6 * 3600000) {
        await patchJob(db, job, { status: "needs_review", last_error: "Generation has not completed after six hours" });
      }
    } else if (job.status === "ready") {
      if (["scheduled", "sent", "submitting"].includes(email.status)) {
        await reconcileEmail(db, order, email);
        next = new Date(Math.max(Date.now() + 5 * 60000, new Date(email.scheduled_at).getTime() + 5 * 60000)).toISOString();
      } else if (email.status === "pending") {
        const headers = brevoHeaders();
        if (!job.storage_path?.startsWith(`${order.id}/`) || !job.image_sha256) throw new Error("Missing order sketch");
        const stored = await db.storage.from(SKETCH_BUCKET).download(job.storage_path);
        if (stored.error || !stored.data) throw new Error("Saved sketch unavailable");
        const buffer = Buffer.from(await stored.data.arrayBuffer());
        if (crypto.createHash("sha256").update(buffer).digest("hex") !== job.image_sha256) throw new Error("Sketch integrity check failed");
        await assertCurrentGeneration(db, job, order);
        const body = emailBody(order, email, buffer, `AstroRekha-${order.id}.${job.storage_path.split(".").pop()}`);
        const res = await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
        const payload = await res.json();
        if (!res.ok || !payload.messageId) throw new Error("Brevo submission did not return a message id");
        await patchEmail(db, email, { status: body.scheduledAt ? "scheduled" : "sent", provider_message_id: payload.messageId, last_error: null });
        next = new Date(Math.max(Date.now() + 5 * 60000, new Date(email.scheduled_at).getTime() + 5 * 60000)).toISOString();
      }
    }
    await patchJob(db, job, { lease_id: null, lease_until: null, next_attempt_at: next });
    return { orderId: job.order_id, ok: true };
  } catch (cause) {
    if (cause instanceof StaleGenerationJob) return { orderId: job.order_id, ok: true };
    const current = await db.from("soulmate_generation_jobs").select("lease_id,answer_revision").eq("order_id", job.order_id).maybeSingle();
    if (!current.error && current.data && (current.data.lease_id !== job.lease_id || current.data.answer_revision !== job.answer_revision)) return { orderId: job.order_id, ok: true };
    // Never log provider payloads, personal answers, email addresses, or credentials.
    const message = cause instanceof Error ? cause.message.slice(0, 180) : "Fulfillment failed";
    await patchJob(db, job, { failures: job.failures + 1, ...(job.failures >= 11 ? { status: "needs_review" } : {}), last_error: message, lease_id: null, lease_until: null, next_attempt_at: later(Math.min(15, 2 ** Math.min(job.failures, 4))) });
    return { orderId: job.order_id, ok: false };
  }
}

export async function runSoulmateFulfillment() {
  const mode = process.env.PAYU_MODE;
  if (mode !== "live" && mode !== "test") throw new Error("Missing payment mode");
  const db = getSupabaseAdmin();
  const { data, error } = await db.rpc("claim_soulmate_deliveries", { p_mode: mode, p_limit: 3, p_catalog_version: 2 });
  if (error) throw new Error("Unable to claim fulfillment jobs");
  const results = await Promise.allSettled((data as GenerationJob[] || []).map((job) => processSoulmateJob(db, job)));
  const failures = results.filter((r) => r.status === "rejected" || !r.value.ok).length;
  const review = await db.from("soulmate_generation_jobs").select("order_id", { count: "exact", head: true }).eq("status", "needs_review");
  const emailReview = await db.from("soulmate_email_deliveries").select("order_id", { count: "exact", head: true }).eq("status", "needs_review");
  if (review.error || emailReview.error) throw new Error("Unable to check fulfillment alerts");
  return { processed: results.length, failures, needsReview: (review.count || 0) + (emailReview.count || 0) };
}
