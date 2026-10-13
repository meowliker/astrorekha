import type { UsageSource, UsageUser, UsageChat } from "@/lib/revenue-usage";
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
const VERSION = 2;
const MANIFEST_PATH = `latest-v${VERSION}.json.gz`;
// Recalculate reports after formula changes without rereading source payment history.
const REPORT_VERSION = 4;
type Manifest = { version: number; id: string; generatedAt: string };
type Source = Manifest & {
  payments: PaymentRow[];
  events: OfferEvent[];
  pricing: PricingConfig;
  usage: UsageSource | null;
  warnings: string[];
};
const PAYMENT_FIELDS =
  "id,payu_txn_id,razorpay_order_id,user_id,customer_email,type,bundle_id,feature,amount,currency,payment_status,coins,created_at,fulfilled_at,utm_source,utm_medium,utm_campaign,utm_content,utm_term,first_touch,last_touch";
const EVENT_FIELDS =
  "id,event_name,product_type,product_id,user_id,email,visitor_id,created_at";

/** Keyset pagination avoids PostgREST's default 1,000-row cap. Never return a partial sum. */
async function readPages<T extends { id: string }>(
  page: (
    after: T | null,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  ceiling: number,
): Promise<T[]> {
  const rows: T[] = [];
  let after: T | null = null;
  for (;;) {
    let result = await page(after);
    // Retry a transient database timeout at the same cursor; never append a partial page.
    for (
      let retry = 0;
      result.error &&
      /statement timeout/i.test(result.error.message) &&
      retry < 2;
      retry++
    ) {
      result = await page(after);
    }
    const { data, error } = result;
    if (error) throw new Error(error.message);
    if (!data?.length) return rows;
    rows.push(...data);
    if (rows.length > ceiling)
      throw new Error(
        "Range exceeds the safe read limit. No partial totals returned.",
      );
    const next = data[data.length - 1];
    if (next.id === after?.id)
      throw new Error(
        "Pagination did not advance. No partial totals returned.",
      );
    after = next;
    // Read until an empty page; deployed row caps may be lower than our requested page size.
  }
}

async function read<T>(db: SupabaseClient, path: string): Promise<T | null> {
  const { data, error } = await db.storage
    .from(REVENUE_BUCKET)
    .download(path, {}, { cache: "no-store" });
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
async function readUsage(
  db: SupabaseClient,
  capturedAt: string,
): Promise<UsageSource> {
  const [users, chats] = await Promise.allSettled([
    readPages<UsageUser>((after) => {
      let q = db
        .from("users")
        .select("id,email,coins,unlocked_features,updated_at")
        .order("id")
        .limit(1000);
      if (after) q = q.gt("id", after.id);
      return q;
    }, 250000),
    readPages<UsageChat>(async (after) => {
      let q = db
        .from("chat_messages")
        .select("id,messages")
        .order("id")
        .limit(25);
      if (after) q = q.gt("id", after.id);
      const response = await q;
      return {
        error: response.error,
        data:
          response.data?.map((row) => {
            const occurrences = new Map<string, number>();
            return {
              id: String(row.id),
              questions: (Array.isArray(row.messages) ? row.messages : [])
                .filter((m: { role?: string }) => m?.role === "user")
                .map((m: { timestamp?: unknown; content?: unknown }) => {
                  const at =
                    typeof m.timestamp === "string" &&
                    Number.isFinite(Date.parse(m.timestamp))
                      ? new Date(m.timestamp).toISOString()
                      : null;
                  const fingerprint = createHash("sha256")
                    .update(JSON.stringify([m.timestamp, m.content]))
                    .digest("hex");
                  const occurrence = occurrences.get(fingerprint) || 0;
                  occurrences.set(fingerprint, occurrence + 1);
                  return { at, key: `${fingerprint}:${occurrence}` };
                }),
            };
          }) || null,
      };
    }, 250000),
  ]);
  if (users.status === "rejected") throw users.reason;
  if (chats.status === "rejected") throw chats.reason;
  return { users: users.value, chats: chats.value, capturedAt };
}
async function syncSource(db: SupabaseClient): Promise<Source> {
  await ensurePrivateBucket(db);
  const generatedAt = new Date().toISOString();
  const [payments, events, catalog, usageResult] = await Promise.all([
    readPages<PaymentRow>((after) => {
      let q = db
        .from("payments")
        .select(PAYMENT_FIELDS)
        .lt("created_at", generatedAt)
        .order("id")
        .limit(1000);
      if (after) q = q.gt("id", after.id);
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
        .order("created_at")
        .order("id")
        .limit(1000);
      if (after) {
        // Use the date index, with ID as a tie-breaker so equal timestamps are never skipped.
        const at = JSON.stringify(after.created_at);
        const id = JSON.stringify(after.id);
        q = q
          .gte("created_at", after.created_at)
          .or(`created_at.gt.${at},and(created_at.eq.${at},id.gt.${id})`);
      }
      return q;
    }, 500000),
    db.from("settings").select("value").eq("key", "pricing").maybeSingle(),
    readUsage(db, generatedAt)
      .then((value) => ({ value, error: false }))
      .catch(() => ({ value: null, error: true })),
  ]);
  if (catalog.error)
    throw new Error("Product catalog could not be synchronized.");
  const source: Source = {
    version: VERSION,
    id: randomUUID(),
    generatedAt,
    payments,
    events,
    usage: usageResult.value,
    warnings: usageResult.error
      ? [
          "Wallet or chat usage could not be fully loaded. Usage and access metrics are unavailable; payment totals remain complete.",
        ]
      : [],
    pricing: catalog.data?.value
      ? normalizePricing(catalog.data.value)
      : DEFAULT_PRICING,
  };
  // Publish only after the complete source has been durably written.
  await write(db, `sources/${source.id}.json.gz`, source);
  await write(db, MANIFEST_PATH, {
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
  let manifest = await read<Manifest>(db, MANIFEST_PATH);
  if (!manifest && !refresh) {
    // Reuse an already initialized snapshot while isolating older deployed readers.
    const legacy = await read<Manifest>(db, "latest.json.gz");
    if (legacy?.version === VERSION) {
      manifest = legacy;
      await write(db, MANIFEST_PATH, manifest);
    }
  }
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
    usage: source.usage,
    warnings: source.warnings,
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
