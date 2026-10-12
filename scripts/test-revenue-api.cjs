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
const rows = Array.from({ length: 1601 }, (_, i) => ({
  id: `order-${String(i).padStart(5, "0")}`,
  payu_txn_id: `order-${i}`,
  user_id: `customer-${i}`,
  type: "report",
  bundle_id: "report-past-life",
  amount: 49900,
  currency: "INR",
  payment_status: i % 2 ? "bounced" : "paid",
  created_at: "2026-10-10T08:00:00Z",
}));
const fakeDb = {
  from(table) {
    const filters = [];
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
            data: [],
            error:
              mode === "event-error"
                ? { message: "Simulated event outage" }
                : null,
          };
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
const { GET } = require("../src/app/api/admin/revenue-dashboard/route");
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
  pageParams.set('orderState','all'); pageParams.set('orderLimit','250');
  while (exported.length < report.orderPage.total) {
    pageParams.set('orderOffset', String(exported.length));
    const batch = await (await GET(request(pageParams.toString()))).json();
    exported.push(...batch.orders);
  }
  assert.equal(new Set(exported.map(row => row.id)).size, report.orderPage.total);
  assert.equal(exported.reduce((sum,row) => sum + row.netPaise,0),report.totals.netPaise,'complete export reconciles across pages');
  pageParams.set("snapshot", "outdated");
  assert.equal(
    (await GET(request(pageParams.toString()))).status,
    409,
    "never mix records from different snapshots in an export",
  );

  mode = "event-error";
  const eventFailure = await (await GET(request())).json();
  assert.equal(eventFailure.quality.eventsAvailable, false);
  assert.equal(eventFailure.products[0].offerCvr, null);
  assert.equal(eventFailure.totals.attempts, 1601);
  mode = "payment-error";
  paymentReads = 0;
  const failure = await GET(request());
  assert.equal(failure.status, 503, "never serves truncated financial totals");
  assert.equal((await failure.json()).totals, undefined);
  console.log(
    "Revenue API: auth, expiry, invalid dates, full pagination, event degradation, financial failure and cache policy passed.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
