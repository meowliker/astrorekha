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
const VERSION = 3;
// Recalculate reports after formula changes without rereading source payment history.
const REPORT_VERSION = 5;
type Manifest = { version: number; id: string; generatedAt: string };
type Source = Manifest & {
  payments: PaymentRow[];
  events: OfferEvent[];
  pricing: PricingConfig;
  usage: UsageSource | null;
  warnings: string[];
  sync: {
    mode: "initial" | "incremental";
    recentFrom: string;
    changedRecords: number;
  };
};
type Change = {
  id: string;
  table_name: string;
  record_id: string;
  version: string;
};
type SyncState = {
  snapshot_id: string | null;
  generated_at: string | null;
  source_version: number | null;
  lease_token: string;
  sync_at: string;
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
const OFFER_NAMES = [
  "product_offer_view",
  "upsell_view",
  "chat_unlimited_offer_shown",
];
const USER_FIELDS = "id,email,coins,unlocked_features,updated_at";

function summarizeChat(row: { id: string; messages: unknown }): UsageChat {
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
}

async function readRows<T extends { id: string }>(
  db: SupabaseClient,
  table: string,
  fields: string,
  ids?: string[],
  transform?: (row: { id: string; messages: unknown }) => T,
): Promise<T[]> {
  const result: T[] = [];
  // Explicit ID batches use the primary key and stay within URL limits.
  const batches = ids
    ? Array.from({ length: Math.ceil(ids.length / 100) }, (_, i) =>
        ids.slice(i * 100, i * 100 + 100),
      )
    : [null];
  for (const batch of batches) {
    const rows = await readPages<T>(async (after) => {
      let q = db
        .from(table)
        .select(fields)
        .order("id")
        .limit(transform ? 25 : 1000);
      if (batch) q = q.in("id", batch);
      if (after) q = q.gt("id", after.id);
      const response = await q;
      return {
        error: response.error,
        data:
          response.data?.map((row) =>
            transform
              ? transform(row as unknown as { id: string; messages: unknown })
              : (row as unknown as T),
          ) || null,
      };
    }, 500000);
    result.push(...rows);
  }
  return result;
}

async function readDated<T extends { id: string; created_at: string }>(
  db: SupabaseClient,
  table: string,
  fields: string,
  from: string,
  to: string,
): Promise<T[]> {
  return readPages<T>((after) => {
    let q = db
      .from(table)
      .select(fields)
      .gte("created_at", from)
      .lt("created_at", to)
      .order("created_at")
      .order("id")
      .limit(1000);
    if (table === "marketing_events") q = q.in("event_name", OFFER_NAMES);
    if (after) {
      const at = JSON.stringify(after.created_at),
        id = JSON.stringify(after.id);
      q = q
        .gte("created_at", after.created_at)
        .or(`created_at.gt.${at},and(created_at.eq.${at},id.gt.${id})`);
    }
    return q as unknown as PromiseLike<{
      data: T[] | null;
      error: { message: string } | null;
    }>;
  }, 500000);
}

function mergeRows<T extends { id: string }>(
  old: T[],
  fresh: T[],
  changed: string[],
  window?: { from: string; to: string },
): T[] {
  const removed = new Set(changed);
  const rows = new Map(
    old
      .filter((row) => {
        if (removed.has(row.id)) return false;
        const at = Date.parse(
          (row as T & { created_at?: string }).created_at || "",
        );
        return (
          !window ||
          at < Date.parse(window.from) ||
          at >= Date.parse(window.to) ||
          !Number.isFinite(at)
        );
      })
      .map((row) => [row.id, row]),
  );
  for (const row of fresh) rows.set(row.id, row);
  return [...rows.values()];
}

async function readManifest(db: SupabaseClient): Promise<Manifest | null> {
  const { data, error } = await db
    .from("admin_revenue_sync_state")
    .select("snapshot_id,generated_at,source_version")
    .eq("id", "dashboard")
    .maybeSingle();
  if (error) throw new Error("Revenue sync migration is unavailable.");
  return data?.snapshot_id
    ? {
        id: data.snapshot_id,
        generatedAt: data.generated_at,
        version: data.source_version,
      }
    : null;
}

async function syncSource(db: SupabaseClient): Promise<Source> {
  const lock = await db.rpc("admin_revenue_begin_sync");
  if (lock.error || !lock.data)
    throw new Error(
      "A revenue refresh is already running or could not start. Please retry shortly.",
    );
  const state = lock.data as SyncState;
  try {
    await ensurePrivateBucket(db);
    const previous =
      state.snapshot_id && state.source_version === VERSION
        ? await read<Source>(db, `sources/${state.snapshot_id}.json.gz`)
        : null;
    if (
      state.snapshot_id &&
      state.source_version === VERSION &&
      (!previous || previous.id !== state.snapshot_id)
    )
      throw new Error(
        "Saved history is unavailable. No partial refresh was published.",
      );
    const generatedAt = state.sync_at;
    const recentFrom = new Date(
      Date.parse(generatedAt) - 48 * 3600000,
    ).toISOString();
    const changes = await readPages<Change>((after) => {
      let q = db
        .from("admin_revenue_changes")
        .select("id,table_name,record_id,version")
        .order("id")
        .limit(1000);
      if (after) q = q.gt("id", after.id);
      return q;
    }, 500000);
    const changedIds = (table: string) =>
      changes.filter((c) => c.table_name === table).map((c) => c.record_id);
    // Wait for every read to settle before releasing the lease, including on failure.
    const reads = await Promise.allSettled([
      previous
        ? readDated<PaymentRow>(
            db,
            "payments",
            PAYMENT_FIELDS,
            recentFrom,
            generatedAt,
          )
        : readRows<PaymentRow>(db, "payments", PAYMENT_FIELDS),
      readDated<OfferEvent>(
        db,
        "marketing_events",
        EVENT_FIELDS,
        previous ? recentFrom : "2026-03-12T18:30:00Z",
        generatedAt,
      ),
      readRows<PaymentRow>(
        db,
        "payments",
        PAYMENT_FIELDS,
        changedIds("payments"),
      ),
      readRows<OfferEvent>(
        db,
        "marketing_events",
        EVENT_FIELDS,
        changedIds("marketing_events"),
      ),
      readRows<UsageUser>(
        db,
        "users",
        USER_FIELDS,
        previous?.usage ? changedIds("users") : undefined,
      ),
      readRows<UsageChat>(
        db,
        "chat_messages",
        "id,messages",
        previous?.usage ? changedIds("chat_messages") : undefined,
        summarizeChat,
      ),
      db.from("settings").select("value").eq("key", "pricing").maybeSingle(),
    ]);
    for (const result of reads)
      if (result.status === "rejected") throw result.reason;
    const value = <T>(result: PromiseSettledResult<T>): T => {
      if (result.status === "rejected") throw result.reason;
      return result.value;
    };
    const [
      recentPayments,
      recentEvents,
      changedPayments,
      changedEvents,
      users,
      chats,
      catalog,
    ] = [
      value(reads[0]),
      value(reads[1]),
      value(reads[2]),
      value(reads[3]),
      value(reads[4]),
      value(reads[5]),
      value(reads[6]),
    ];
    if (catalog.error)
      throw new Error("Product catalog could not be synchronized.");
    const window = previous ? { from: recentFrom, to: generatedAt } : undefined;
    const paymentChanges = new Set(changedIds("payments"));
    const eventChanges = new Set(changedIds("marketing_events"));
    const source: Source = {
      version: VERSION,
      id: randomUUID(),
      generatedAt,
      payments: mergeRows(
        previous?.payments || [],
        [
          ...recentPayments.filter((p) => !paymentChanges.has(p.id)),
          ...changedPayments,
        ],
        changedIds("payments"),
        window,
      ),
      events: mergeRows(
        previous?.events || [],
        [
          ...recentEvents.filter((e) => !eventChanges.has(e.id)),
          ...changedEvents.filter((e) => OFFER_NAMES.includes(e.event_name)),
        ],
        changedIds("marketing_events"),
        window,
      ),
      usage: {
        users: mergeRows(
          previous?.usage?.users || [],
          users,
          changedIds("users"),
        ),
        chats: mergeRows(
          previous?.usage?.chats || [],
          chats,
          changedIds("chat_messages"),
        ),
        capturedAt: generatedAt,
      },
      pricing: catalog.data?.value
        ? normalizePricing(catalog.data.value)
        : DEFAULT_PRICING,
      warnings: [],
      sync: {
        mode: previous ? "incremental" : "initial",
        recentFrom,
        changedRecords: changes.length,
      },
    };
    await write(db, `sources/${source.id}.json.gz`, source);
    const committed = await db.rpc("admin_revenue_commit_sync", {
      p_token: state.lease_token,
      p_snapshot_id: source.id,
      p_generated_at: generatedAt,
      p_source_version: VERSION,
      p_ack: changes.map(({ id, version }) => ({ id, version })),
    });
    if (committed.error)
      throw new Error(
        "Refresh could not be published. Previous saved data is intact.",
      );
    return source;
  } finally {
    await db.rpc("admin_revenue_release_sync", { p_token: state.lease_token });
  }
}

export async function savedRevenueReport(
  db: SupabaseClient,
  range: RevenueDashboard["range"],
  attribution: "first" | "last",
  refresh: boolean,
) {
  let source: Source | null = null;
  let manifest = await readManifest(db);
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
    sync: source.sync,
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
