import { createHash, randomUUID } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_PRICING,
  normalizePricing,
  type PricingConfig,
} from "@/lib/pricing";
import {
  buildRevenueDashboard,
  type PaymentRow,
  type OfferEvent,
  type RevenueDashboard,
} from "@/lib/revenue-dashboard";

// Private Storage persists across deployments. No public URLs or browser credentials.
export const REVENUE_BUCKET = "admin-revenue-cache";
const VERSION = 1;
// Recalculate reports after formula changes without rereading source payment history.
const REPORT_VERSION = 3;
type Manifest = { version: number; id: string; generatedAt: string };
type Source = Manifest & {
  payments: PaymentRow[];
  events: OfferEvent[];
  pricing: PricingConfig;
};
const PAYMENT_FIELDS =
  "id,payu_txn_id,razorpay_order_id,user_id,customer_email,type,bundle_id,feature,amount,currency,payment_status,coins,created_at,fulfilled_at,utm_source,utm_medium,utm_campaign,utm_content,utm_term,first_touch,last_touch";
const EVENT_FIELDS =
  "id,event_name,product_type,product_id,user_id,email,visitor_id,created_at";

/** Keyset pagination avoids PostgREST's default 1,000-row cap. Never return a partial sum. */
async function readPages<T extends { id: string }>(
  page: (
    after: string | null,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  ceiling: number,
): Promise<T[]> {
  const rows: T[] = [];
  let after: string | null = null;
  for (;;) {
    const { data, error } = await page(after);
    if (error) throw new Error(error.message);
    if (!data?.length) return rows;
    rows.push(...data);
    if (rows.length > ceiling)
      throw new Error(
        "Range exceeds the safe read limit. No partial totals returned.",
      );
    const next = data[data.length - 1].id;
    if (next === after)
      throw new Error(
        "Pagination did not advance. No partial totals returned.",
      );
    after = next;
    // Read until an empty page; deployed row caps may be lower than our requested page size.
  }
}

async function read<T>(db: SupabaseClient, path: string): Promise<T | null> {
  const { data, error } = await db.storage.from(REVENUE_BUCKET).download(path);
  if (error) {
    // Blob downloads wrap non-2xx Responses in StorageUnknownError.
    // Inspect the response body so a missing object is not confused with an outage.
    const original = (error as { originalError?: Response }).originalError;
    const detail =
      original && typeof original.json === "function"
        ? ((await original.json().catch(() => null)) as {
            statusCode?: string;
            message?: string;
          } | null)
        : null;
    const code = String(
      (error as { statusCode?: string }).statusCode ||
        detail?.statusCode ||
        original?.status ||
        "",
    );
    if (
      code === "404" ||
      /not found|does not exist/i.test(detail?.message || error.message)
    )
      return null;
    throw new Error("Unable to read saved revenue data.");
  }
  return JSON.parse(
    gunzipSync(Buffer.from(await data.arrayBuffer())).toString("utf8"),
  ) as T;
}
async function write(db: SupabaseClient, path: string, value: unknown) {
  const { error } = await db.storage
    .from(REVENUE_BUCKET)
    .upload(path, gzipSync(Buffer.from(JSON.stringify(value))), {
      contentType: "application/gzip",
      cacheControl: "0",
      upsert: true,
    });
  if (error)
    throw new Error(
      "Unable to save revenue data in Supabase. Previous data has been retained.",
    );
}
async function ensurePrivateBucket(db: SupabaseClient) {
  const { data, error } = await db.storage.getBucket(REVENUE_BUCKET);
  if (data?.public) throw new Error("Revenue cache must be private.");
  if (!error && data) return;
  const created = await db.storage.createBucket(REVENUE_BUCKET, {
    public: false,
    fileSizeLimit: 50 * 1024 * 1024,
  });
  if (created.error) {
    const check = await db.storage.getBucket(REVENUE_BUCKET);
    if (!check.data || check.data.public)
      throw new Error("Private revenue storage is unavailable.");
  }
}
async function syncSource(db: SupabaseClient): Promise<Source> {
  await ensurePrivateBucket(db);
  const generatedAt = new Date().toISOString();
  const [payments, events, catalog] = await Promise.all([
    readPages<PaymentRow>((after) => {
      let q = db
        .from("payments")
        .select(PAYMENT_FIELDS)
        .lt("created_at", generatedAt)
        .order("id")
        .limit(1000);
      if (after) q = q.gt("id", after);
      return q;
    }, 150000),
    readPages<OfferEvent>((after) => {
      let q = db
        .from("marketing_events")
        .select(EVENT_FIELDS)
        .in("event_name", [
          "product_offer_view",
          "upsell_view",
          "chat_unlimited_offer_shown",
        ])
        .gte("created_at", "2026-03-12T18:30:00Z")
        .lt("created_at", generatedAt)
        .order("id")
        .limit(1000);
      if (after) q = q.gt("id", after);
      return q;
    }, 500000),
    db.from("settings").select("value").eq("key", "pricing").maybeSingle(),
  ]);
  if (catalog.error)
    throw new Error("Product catalog could not be synchronized.");
  const source: Source = {
    version: VERSION,
    id: randomUUID(),
    generatedAt,
    payments,
    events,
    pricing: catalog.data?.value
      ? normalizePricing(catalog.data.value)
      : DEFAULT_PRICING,
  };
  // Publish only after the complete source has been durably written.
  await write(db, `sources/${source.id}.json.gz`, source);
  await write(db, "latest.json.gz", {
    version: VERSION,
    id: source.id,
    generatedAt,
  });
  return source;
}

export async function savedRevenueReport(
  db: SupabaseClient,
  range: RevenueDashboard["range"],
  attribution: "first" | "last",
  refresh: boolean,
) {
  let source: Source | null = null;
  let manifest = await read<Manifest>(db, "latest.json.gz");
  if (refresh || !manifest || manifest.version !== VERSION) {
    source = await syncSource(db);
    manifest = source;
  }
  const path = `reports/v${REPORT_VERSION}/${range.start}_${range.end}_${attribution}.json.gz`;
  const saved = await read<RevenueDashboard & { sourceId: string }>(db, path);
  if (saved?.sourceId === manifest.id) return saved;
  source ||= await read<Source>(db, `sources/${manifest.id}.json.gz`);
  if (!source || source.id !== manifest.id)
    throw new Error("Saved revenue source is incomplete. Refresh to retry.");
  const storedRange = {
    ...range,
    to: new Date(
      Math.max(
        Date.parse(range.from),
        Math.min(Date.parse(range.to), Date.parse(source.generatedAt)),
      ),
    ).toISOString(),
  };
  const result = buildRevenueDashboard({
    payments: source.payments,
    events: source.events,
    pricing: source.pricing,
    range: storedRange,
    attribution,
  });
  const report = {
    ...result,
    generatedAt: source.generatedAt,
    sourceId: source.id,
    snapshot: createHash("sha256")
      .update(
        `${REPORT_VERSION}:${source.id}:${range.start}:${range.end}:${attribution}`,
      )
      .digest("hex"),
    orderPage: {
      total: result.orders.length,
      offset: 0,
      limit: result.orders.length,
    },
    filters: {
      sources: [...new Set(result.orders.map((o) => o.source))].sort(),
      campaigns: [
        ...new Set(result.orders.map((o) => o.campaign).filter(Boolean)),
      ].sort(),
    },
  };
  await write(db, path, report);
  return report;
}
