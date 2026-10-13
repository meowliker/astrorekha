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
let writes = 0;
const fakeDb = {
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
          return { error: null };
        },
      };
    },
  },
  from(table) {
    const filters = [];
    let cursor = null;
    const query = {
      select() {
        return query;
      },
      order() {
        return query;
      },
      limit() {
        return query;
      },
      in() {
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
        assert.ok(parts, "offer pagination uses a stable date/ID cursor");
        cursor = { at: JSON.parse(parts[1]), id: JSON.parse(parts[3]) };
        return query;
      },
      maybeSingle() {
        return query;
      },
      then(fulfilled, rejected) {
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
        if (table === "settings")
          result = {
            data: { value: require("../src/lib/pricing").DEFAULT_PRICING },
            error: null,
          };
        if (table === "marketing_events")
          result = {
            data: eventRows
              .filter(
                (row) =>
                  !cursor ||
                  row.created_at > cursor.at ||
                  (row.created_at === cursor.at && row.id > cursor.id),
              )
              .slice(0, 333),
            error:
              mode === "event-error"
                ? { message: "Simulated event outage" }
                : mode === "transient-timeout" && transientTimeouts++ < 1
                  ? { message: "canceling statement due to statement timeout" }
                  : null,
          };
        if (table === "users" || table === "chat_messages") {
          usageReads++;
          const usageRows =
            table === "users"
              ? [
                  {
                    id: "customer-0",
                    coins: 2,
                    unlocked_features: { pastLifeReport: true },
                  },
                ]
              : [
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
          result =
            mode === "usage-error"
              ? { data: null, error: { message: "Simulated usage outage" } }
              : {
                  data: usageRows.filter((row) =>
                    filters.every(([field, op, value]) =>
                      op === "gt" ? row[field] > value : true,
                    ),
                  ),
                  error: null,
                };
        }
        if (table === "payments") {
          paymentReads++;
          result =
            mode === "payment-error" && paymentReads > 1
              ? {
                  data: null,
                  error: { message: "Simulated partial read failure" },
                }
              : {
                  data: rows
                    .filter((row) =>
                      filters.every(([field, op, value]) =>
                        op === "gt"
                          ? row[field] > value
                          : op === "gte"
                            ? row[field] >= value
                            : op === "lt"
                              ? row[field] < value
                              : row[field] === value,
                      ),
                    )
                    .slice(0, 333),
                  error: null,
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
  const stale = await (await GET(request())).json();
  assert.equal(
    stale.totals.collectedPaise,
    report.totals.collectedPaise,
    "snapshot remains stable until refresh",
  );
  const updated = await (await POST(request())).json();
  assert.equal(
    updated.totals.collectedPaise,
    report.totals.collectedPaise + 50000,
  );
  assert.notEqual(updated.snapshot, report.snapshot);
  assert.ok(
    paymentReads > beforeReads,
    "refresh rereads complete payment history",
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
  for (mode of ["event-error", "payment-error", "save-error"]) {
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
  mode = "usage-error";
  const missingUsage = await (await POST(request())).json();
  assert.equal(missingUsage.usage, null);
  assert.equal(
    missingUsage.totals.collectedPaise,
    updated.totals.collectedPaise,
  );
  assert.ok(
    missingUsage.quality.warnings.some((w) => /usage.*unavailable/i.test(w)),
  );
  assert.ok(writes > 0);
  console.log(
    "Revenue API: auth, expiry, invalid dates, full pagination, saved data reuse, refresh persistence, failure retention, global sorting, filters and snapshot consistency passed.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
