/* Isolated API contract tests. Fake data/session only; no environment or database access. */
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
const root = path.resolve(__dirname, "..");
require("ts-node").register({
  transpileOnly: true,
  compilerOptions: { module: "CommonJS", moduleResolution: "node" },
});
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, parent, ...rest) {
  return resolve.call(
    this,
    name.startsWith("@/") ? path.join(root, "src", name.slice(2)) : name,
    parent,
    ...rest,
  );
};
let mode = "ok",
  paymentReads = 0;
let usageReads = 0;
let transientTimeouts = 0;
const rows = Array.from({ length: 1601 }, (_, i) => ({
  id: `order-${String(i).padStart(5, "0")}`,
  payu_txn_id: `order-${i}`,
  user_id: `customer-${i}`,
  type: "report",
  bundle_id: "report-past-life",
  amount: 49900,
  currency: "INR",
  utm_source: i % 3 ? "google" : "facebook",
  utm_campaign: i % 5 ? "alpha" : "beta",
  payment_status: i % 2 ? "bounced" : "paid",
  created_at: "2026-10-10T08:00:00Z",
}));
const eventRows = Array.from({ length: 701 }, (_, i) => ({
  id: `event-${String(701 - i).padStart(4, "0")}`,
  event_name: "product_offer_view",
  product_type: "report",
  product_id: "report-past-life",
  user_id: `customer-${i}`,
  created_at: i < 450 ? "2026-10-10T06:00:00Z" : "2026-10-10T07:00:00Z",
})).sort(
  (a, b) =>
    a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
);
const objects = new Map();
const changes = new Map();
let serial = 0;
const markChanged = (table, id) => {
  const key = `${table}:${id}`,
    old = changes.get(key);
  changes.set(key, {
    id: old?.id || String(++serial).padStart(8, "0"),
    table_name: table,
    record_id: id,
    version: String(++serial),
  });
};
const users = [
  { id: "customer-0", coins: 2, unlocked_features: { pastLifeReport: true } },
];
const chats = [
  {
    id: "customer-0",
    messages: [
      {
        role: "user",
        content: "PRIVATE QUESTION NEVER CACHE",
        timestamp: "2026-10-10T09:00:00Z",
      },
      {
        role: "assistant",
        content: "PRIVATE REPLY NEVER CACHE",
        timestamp: "2026-10-10T09:00:01Z",
      },
    ],
  },
];
let syncState = {
  snapshot_id: null,
  generated_at: null,
  source_version: null,
  lease_token: null,
};
const queries = [];
let writes = 0;
const fakeDb = {
  async rpc(name, args = {}) {
    if (name === "admin_revenue_begin_sync") {
      if (syncState.lease_token || mode === "busy")
        return { error: { message: "Refresh in progress" }, data: null };
      syncState.lease_token = `lease-${++serial}`;
      return {
        data: { ...syncState, sync_at: new Date().toISOString() },
        error: null,
      };
    }
    if (name === "admin_revenue_commit_sync") {
      if (mode === "commit-error")
        return { error: { message: "Commit unavailable" } };
      assert.equal(args.p_token, syncState.lease_token);
      syncState = {
        snapshot_id: args.p_snapshot_id,
        generated_at: args.p_generated_at,
        source_version: args.p_source_version,
        lease_token: null,
      };
      for (const ack of args.p_ack) {
        for (const [key, change] of changes)
          if (change.id === ack.id && change.version === ack.version)
            changes.delete(key);
      }
      return { error: null };
    }
    if (name === "admin_revenue_release_sync") {
      if (syncState.lease_token === args.p_token) syncState.lease_token = null;
      return { error: null };
    }
    throw new Error(`Unexpected RPC ${name}`);
  },
  storage: {
    async getBucket() {
      return { data: { public: false }, error: null };
    },
    async createBucket() {
      return { data: {}, error: null };
    },
    from() {
      return {
        async download(path) {
          return objects.has(path)
            ? { data: new Blob([objects.get(path)]), error: null }
            : {
                data: null,
                error: {
                  message: "{}",
                  originalError: new Response(
                    JSON.stringify({
                      message: "Object not found",
                      statusCode: "404",
                    }),
                    { status: 400 },
                  ),
                },
              };
        },
        async upload(path, data) {
          writes++;
          if (mode === "save-error")
            return { error: { message: "Storage unavailable" } };
          objects.set(path, data);
          if (mode === "concurrent-change" && path.startsWith("sources/")) {
            rows[0].amount += 10000;
            markChanged("payments", rows[0].id);
          }
          return { error: null };
        },
      };
    },
  },
  from(table) {
    const filters = [],
      ordering = [];
    let cursor = null,
      limit = 333;
    const query = {
      select() {
        return query;
      },
      order(field) {
        ordering.push(field);
        return query;
      },
      limit(n) {
        limit = Math.min(333, n);
        return query;
      },
      in(field, value) {
        filters.push([field, "in", value]);
        return query;
      },
      eq(field, value) {
        filters.push([field, "eq", value]);
        return query;
      },
      gt(field, value) {
        filters.push([field, "gt", value]);
        return query;
      },
      gte(field, value) {
        filters.push([field, "gte", value]);
        return query;
      },
      lt(field, value) {
        filters.push([field, "lt", value]);
        return query;
      },
      or(expression) {
        const parts = expression.match(
          /created_at\.gt\.("[^"]+"),and\(created_at\.eq\.("[^"]+"),id\.gt\.("[^"]+")\)/,
        );
        assert.ok(parts, "dated pagination uses a stable date/ID cursor");
        cursor = { at: JSON.parse(parts[1]), id: JSON.parse(parts[3]) };
        return query;
      },
      maybeSingle() {
        return query;
      },
      then(fulfilled, rejected) {
        queries.push({ table, filters: [...filters] });
        let result;
        if (table === "admin_sessions")
          result = {
            data:
              mode === "invalid"
                ? null
                : {
                    id: "fake",
                    expires_at:
                      mode === "expired"
                        ? "2020-01-01"
                        : mode === "bad-expiry"
                          ? "invalid"
                          : "2100-01-01",
                  },
            error: null,
          };
        else if (table === "settings")
          result = {
            data: { value: require("../src/lib/pricing").DEFAULT_PRICING },
            error: null,
          };
        else if (table === "admin_revenue_sync_state")
          result = { data: syncState, error: null };
        else {
          const tables = {
            payments: rows,
            marketing_events: eventRows,
            users,
            chat_messages: chats,
            admin_revenue_changes: [...changes.values()],
          };
          assert.ok(tables[table], `Unexpected table ${table}`);
          if (table === "payments") paymentReads++;
          if (table === "users" || table === "chat_messages") usageReads++;
          const data = tables[table]
            .filter((row) =>
              filters.every(([field, op, value]) =>
                op === "in"
                  ? value.includes(row[field])
                  : op === "gt"
                    ? row[field] > value
                    : op === "gte"
                      ? row[field] >= value
                      : op === "lt"
                        ? row[field] < value
                        : row[field] === value,
              ),
            )
            .filter(
              (row) =>
                !cursor ||
                row.created_at > cursor.at ||
                (row.created_at === cursor.at && row.id > cursor.id),
            )
            .sort((a, b) => {
              for (const field of ordering) {
                const n = String(a[field]).localeCompare(String(b[field]));
                if (n) return n;
              }
              return 0;
            })
            .slice(0, limit);
          const error =
            mode === "event-error" && table === "marketing_events"
              ? "Simulated event outage"
              : mode === "payment-error" && table === "payments"
                ? "Simulated payment outage"
                : mode === "usage-error" &&
                    ["users", "chat_messages"].includes(table)
                  ? "Simulated usage outage"
                  : mode === "change-error" && table === "admin_revenue_changes"
                    ? "Change queue unavailable"
                    : mode === "transient-timeout" &&
                        table === "marketing_events" &&
                        transientTimeouts++ < 1
                      ? "canceling statement due to statement timeout"
                      : null;
          result = {
            data: error ? null : JSON.parse(JSON.stringify(data)),
            error: error ? { message: error } : null,
          };
        }
        return Promise.resolve(result).then(fulfilled, rejected);
      },
    };
    return query;
  },
};
const adminModule = require.resolve("../src/lib/supabase-admin");
require.cache[adminModule] = {
  id: adminModule,
  filename: adminModule,
  loaded: true,
  exports: { getSupabaseAdmin: () => fakeDb },
};
const { NextRequest } = require("next/server");
const { GET, POST } = require("../src/app/api/admin/revenue-dashboard/route");
const request = (
  query = "startDate=2026-10-10&endDate=2026-10-11",
  auth = true,
) =>
  new NextRequest(`http://localhost/api/admin/revenue-dashboard?${query}`, {
    headers: auth ? { Authorization: "Bearer fake-test-only" } : {},
  });
(async () => {
  assert.equal((await GET(request("", false))).status, 401);
  for (mode of ["invalid", "expired", "bad-expiry"])
    assert.equal((await GET(request())).status, 401);
  mode = "ok";
  assert.equal(
    (await GET(request("startDate=2026-02-30&endDate=2026-10-11"))).status,
    400,
  );
  const response = await GET(request());
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  const report = await response.json();
  assert.equal(
    report.totals.attempts,
    1601,
    "reads through a deployed cap lower than requested",
  );
  assert.equal(report.totals.paid, 801);
  assert.equal(report.totals.collectedPaise, 801 * 49900);
  assert.ok(paymentReads > 5, "uses all pages");
  assert.equal(
    report.orders.length,
    50,
    "financial totals cover all rows but ledger payloads are bounded",
  );
  assert.equal(report.orderPage.total, 1601);
  assert.equal(report.usage.paidCustomers, 801);
  assert.equal(report.usage.withQuestions, 1);
  assert.equal(report.usage.remainingCoins, 2);
  assert.equal(
    report.usage.historyQuestions,
    1,
    "only user messages count as questions",
  );
  assert.equal(
    report.products.find((p) => p.key === "report:pastLifeReport").viewers,
    701,
    "all offer events survive equal-timestamp pagination",
  );
  const { gunzipSync } = require("node:zlib");
  for (const bytes of objects.values()) {
    const savedText = gunzipSync(bytes).toString("utf8");
    assert.ok(
      !savedText.includes("PRIVATE QUESTION") &&
        !savedText.includes("PRIVATE REPLY"),
      "cache never stores chat text",
    );
  }
  const pageParams = new URLSearchParams({
    startDate: "2026-10-10",
    endDate: "2026-10-11",
    view: "orders",
    asOf: report.generatedAt,
    snapshot: report.snapshot,
    orderOffset: "50",
    orderLimit: "50",
  });
  const secondPage = await (await GET(request(pageParams.toString()))).json();
  assert.equal(secondPage.orders.length, 50);
  assert.equal(secondPage.orderPage.offset, 50);
  assert.ok(
    secondPage.orders.every(
      (row) => !report.orders.some((first) => first.id === row.id),
    ),
  );
  pageParams.set("orderState", "paid");
  const filteredPage = await (await GET(request(pageParams.toString()))).json();
  assert.equal(filteredPage.orderPage.total, 801);
  assert.ok(filteredPage.orders.every((row) => row.state === "paid"));
  const exported = [];
  pageParams.set("orderState", "all");
  pageParams.set("orderLimit", "250");
  while (exported.length < report.orderPage.total) {
    pageParams.set("orderOffset", String(exported.length));
    const batch = await (await GET(request(pageParams.toString()))).json();
    exported.push(...batch.orders);
  }
  assert.equal(
    new Set(exported.map((row) => row.id)).size,
    report.orderPage.total,
  );
  assert.equal(
    exported.reduce((sum, row) => sum + row.netPaise, 0),
    report.totals.netPaise,
    "complete export reconciles across pages",
  );
  pageParams.set("snapshot", "outdated");
  assert.equal(
    (await GET(request(pageParams.toString()))).status,
    409,
    "never mix records from different snapshots in an export",
  );

  const beforeReads = paymentReads;
  const beforeUsageReads = usageReads;
  await GET(request());
  await GET(request("startDate=2026-10-09&endDate=2026-10-11"));
  assert.equal(
    paymentReads,
    beforeReads,
    "existing and new date ranges read saved data, never payment history",
  );
  assert.equal(
    usageReads,
    beforeUsageReads,
    "range changes use cached wallet and question metadata",
  );
  rows[1600].amount = 99900;
  markChanged("payments", rows[1600].id);
  const stale = await (await GET(request())).json();
  assert.equal(
    stale.totals.collectedPaise,
    report.totals.collectedPaise,
    "snapshot remains stable until refresh",
  );
  const beforeRefreshQueries = queries.length;
  const updated = await (await POST(request())).json();
  assert.equal(updated.sync.mode, "incremental");
  assert.equal(
    usageReads,
    beforeUsageReads,
    "unchanged wallets and chats are not reread on refresh",
  );
  for (const q of queries
    .slice(beforeRefreshQueries)
    .filter((q) => q.table === "payments" || q.table === "marketing_events")) {
    assert.ok(
      q.filters.some(([field, op]) => field === "created_at" && op === "gte") ||
        q.filters.some(([field, op]) => field === "id" && op === "in"),
      "refresh reads only the recent window or explicitly changed IDs",
    );
  }
  assert.equal(
    changes.size,
    0,
    "published snapshot acknowledges consumed changes",
  );
  assert.equal(
    updated.totals.collectedPaise,
    report.totals.collectedPaise + 50000,
  );
  assert.notEqual(updated.snapshot, report.snapshot);
  assert.ok(
    paymentReads > beforeReads,
    "refresh reads recent payments and historical corrections",
  );
  const currentReads = paymentReads;
  const revisited = await (await GET(request())).json();
  assert.equal(revisited.snapshot, updated.snapshot);
  assert.equal(paymentReads, currentReads, "refresh persists the new data");
  pageParams.set("snapshot", report.snapshot);
  assert.equal(
    (await GET(request(pageParams.toString()))).status,
    409,
    "a refresh invalidates pinned exports safely",
  );
  const oldAsOf = await GET(
    request(
      "startDate=2026-10-10&endDate=2026-10-11&asOf=2026-10-09T12:00:00Z",
    ),
  );
  assert.equal(
    oldAsOf.status,
    200,
    "stored snapshots can predate selected dates without breaking pagination",
  );
  const asc = await (
    await GET(
      request(
        "startDate=2026-10-10&endDate=2026-10-11&orderState=paid&orderSort=amountPaise&orderDirection=desc&orderLimit=1",
      ),
    )
  ).json();
  assert.equal(
    asc.orders[0].amountPaise,
    99900,
    "sort applies before pagination",
  );
  const category = await (
    await GET(
      request("startDate=2026-10-10&endDate=2026-10-11&orderCategory=coins"),
    )
  ).json();
  assert.equal(category.orderPage.total, 0);
  assert.equal(
    category.totals.paid,
    801,
    "order-only filters do not mislabel report-wide totals",
  );
  const source = await (
    await GET(
      request("startDate=2026-10-10&endDate=2026-10-11&orderSource=missing"),
    )
  ).json();
  assert.equal(source.orderPage.total, 0);
  const combined = await (
    await GET(
      request(
        "startDate=2026-10-10&endDate=2026-10-11&orderSource=google&orderCampaign=beta&orderState=paid&orderLimit=2000",
      ),
    )
  ).json();
  const expected = rows.filter(
    (r) =>
      r.utm_source === "google" &&
      r.utm_campaign === "beta" &&
      r.payment_status === "paid",
  ).length;
  assert.equal(
    combined.orderPage.total,
    expected,
    "status and UTM filters combine across the complete data set",
  );
  assert.ok(
    combined.orders.every(
      (o) =>
        o.source === "google" && o.campaign === "beta" && o.state === "paid",
    ),
  );
  markChanged("users", "customer-0");
  for (mode of [
    "event-error",
    "payment-error",
    "usage-error",
    "change-error",
    "save-error",
    "commit-error",
    "busy",
  ]) {
    paymentReads = 0;
    const failure = await POST(request());
    assert.equal(
      failure.status,
      503,
      "failed refresh must not replace a complete snapshot",
    );
    assert.equal((await failure.json()).totals, undefined);
    mode = "ok";
    const retained = await (await GET(request())).json();
    assert.equal(
      retained.snapshot,
      updated.snapshot,
      "previous snapshot is retained after failure",
    );
  }
  mode = "transient-timeout";
  const recovered = await (await POST(request())).json();
  assert.equal(recovered.totals.collectedPaise, updated.totals.collectedPaise);
  assert.equal(
    recovered.products.find((p) => p.key === "report:pastLifeReport").viewers,
    701,
    "a timeout retry neither loses nor duplicates events",
  );
  assert.ok(transientTimeouts > 1);
  mode = "ok";
  const baseline = await (await GET(request())).json();
  rows[0].payment_status = "refunded";
  markChanged("payments", rows[0].id);
  const refund = await (await POST(request())).json();
  assert.equal(
    refund.totals.netPaise,
    baseline.totals.netPaise - 49900,
    "refund on a historical order corrects its cached checkout period",
  );
  rows[0].payment_status = "paid";
  markChanged("payments", rows[0].id);
  mode = "concurrent-change";
  const racing = await (await POST(request())).json();
  assert.ok(
    changes.has(`payments:${rows[0].id}`),
    "an edit during publication remains queued",
  );
  mode = "ok";
  const caughtUp = await (await POST(request())).json();
  assert.equal(caughtUp.totals.netPaise, racing.totals.netPaise + 10000);
  assert.equal(changes.size, 0);
  const deleted = rows.splice(0, 1)[0];
  markChanged("payments", deleted.id);
  const deletedEvent = eventRows.splice(0, 1)[0];
  markChanged("marketing_events", deletedEvent.id);
  users.splice(0, users.length);
  chats.splice(0, chats.length);
  markChanged("users", "customer-0");
  markChanged("chat_messages", "customer-0");
  const afterDelete = await (await POST(request())).json();
  assert.equal(
    afterDelete.totals.attempts,
    caughtUp.totals.attempts - 1,
    "historical deletes remove their cached row",
  );
  assert.equal(
    afterDelete.products.find((p) => p.key === "report:pastLifeReport").viewers,
    700,
  );
  assert.equal(afterDelete.usage.balanceKnown, 0);
  assert.equal(
    afterDelete.usage.historyQuestions,
    0,
    "deleted chat history does not survive in the usage cache",
  );
  const beforeBackfill = afterDelete.totals.attempts;
  rows.push({
    ...rows[0],
    id: "backfilled-order",
    payu_txn_id: "backfilled-gateway",
    user_id: "late-customer",
    payment_status: "paid",
    amount: 12500,
  });
  users.push({
    id: "late-customer",
    coins: 7,
    unlocked_features: { pastLifeReport: true },
  });
  chats.push({
    id: "late-customer",
    messages: [
      {
        role: "user",
        content: "PRIVATE QUESTION NEW",
        timestamp: "2026-10-10T09:00:00Z",
      },
    ],
  });
  for (const [table, id] of [
    ["payments", "backfilled-order"],
    ["users", "late-customer"],
    ["chat_messages", "late-customer"],
  ])
    markChanged(table, id);
  const backfilled = await (await POST(request())).json();
  assert.equal(
    backfilled.totals.attempts,
    beforeBackfill + 1,
    "backdated inserts are caught even outside the 48-hour window",
  );
  assert.equal(backfilled.usage.remainingCoins, 7);
  assert.equal(backfilled.usage.historyQuestions, 1);
  const repeated = await (await POST(request())).json();
  assert.equal(
    repeated.totals.attempts,
    backfilled.totals.attempts,
    "repeated refresh is idempotent",
  );
  assert.equal(repeated.usage.historyQuestions, 1);
  const recentAt = new Date(Date.now() - 3600000).toISOString();
  rows.push({
    ...rows[0],
    id: "recent-order",
    payu_txn_id: "recent-gateway",
    payment_status: "paid",
    amount: 15000,
    created_at: recentAt,
  });
  await POST(request());
  const { istDate } = require("../src/lib/revenue-dashboard");
  const recentDate = istDate(recentAt);
  const recent = await (
    await GET(request(`startDate=${recentDate}&endDate=${recentDate}`))
  ).json();
  assert.ok(
    recent.orders.some((o) => o.id === "recent-order"),
    "the 48-hour safety scan also catches new recent rows",
  );
  // A deployment must rebuild old report caches and merge new catalog entries
  // without rereading payment history or changing historical financial totals.
  const { gzipSync } = require("node:zlib");
  const sourcePath = `sources/${syncState.snapshot_id}.json.gz`;
  const oldSource = JSON.parse(gunzipSync(objects.get(sourcePath)).toString("utf8"));
  oldSource.pricing.reports = oldSource.pricing.reports.filter(p => p.feature !== "witchArchetypeReport");
  oldSource.pricing.upsells = oldSource.pricing.upsells.filter(p => p.feature !== "witchArchetypeReport");
  const savedPrice = oldSource.pricing.reports[0].price;
  objects.set(sourcePath, gzipSync(JSON.stringify(oldSource)));
  for (const key of [...objects.keys()]) if (key.startsWith("reports/")) objects.delete(key);
  objects.set("reports/v5/2026-10-10_2026-10-11_last.json.gz", gzipSync(JSON.stringify({ sourceId: syncState.snapshot_id, reportAnalytics: [] })));
  const readsBeforeCatalogUpdate = paymentReads;
  const updatedCatalogResponse = await GET(request());
  assert.equal(updatedCatalogResponse.status, 200);
  const updatedCatalog = await updatedCatalogResponse.json();
  assert(updatedCatalog.reportAnalytics.some(r => r.id === "witchArchetypeReport"));
  assert(updatedCatalog.upsells.cohorts[0].reports.some(r => r.id === "witchArchetypeReport"));
  assert.equal(paymentReads, readsBeforeCatalogUpdate, "new catalog uses saved source data");
  assert.deepEqual(updatedCatalog.totals, repeated.totals, "adding the catalog entry does not change financial totals");
  assert.equal(JSON.parse(gunzipSync(objects.get(sourcePath)).toString("utf8")).pricing.reports[0].price, savedPrice);
  for (const bytes of objects.values())
    assert.ok(!gunzipSync(bytes).toString("utf8").includes("PRIVATE QUESTION"));
  assert.equal(syncState.lease_token, null);
  assert.ok(writes > 0);
  console.log(
    "Revenue API: auth, pagination, cache-only loads, incremental refresh, historical refunds/deletes, usage changes, race-safe acknowledgment, failure retention, sorting, filters and snapshot consistency passed.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
