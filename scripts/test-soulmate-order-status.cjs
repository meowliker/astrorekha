const assert = require("node:assert/strict");
const { test } = require("node:test");

require("ts-node").register({ transpileOnly: true, compilerOptions: { module: "CommonJS", moduleResolution: "node" } });
const { soulmateOrderStage } = require("../src/lib/soulmate-order-status");

function order(overrides = {}) {
  return {
    payment_status: "paid",
    fulfillment_status: "queued",
    review_status: "pending",
    reviewed_at: null,
    paid_at: "2026-10-16T01:00:00.000Z",
    created_at: "2026-10-16T00:59:00.000Z",
    delivered_at: null,
    scheduled_send_at: "2026-10-16T13:00:00.000Z",
    generation: { status: "queued", last_error: null },
    email: { status: "pending", scheduled_at: "2026-10-16T13:00:00.000Z", delivered_at: null, last_error: null },
    entitlements: { required_assets: ["sketch", "description"] },
    assets: [],
    ...overrides,
  };
}

test("new paid orders are shown as ordered", () => {
  assert.deepEqual(soulmateOrderStage(order()), {
    id: "ordered", label: "Ordered", detail: "Payment confirmed", timestamp: "2026-10-16T01:00:00.000Z",
  });
});

test("complete uploads awaiting approval are shown as generated", () => {
  const generated = soulmateOrderStage(order({
    assets: [
      { kind: "sketch", uploaded_at: "2026-10-16T02:00:00.000Z" },
      { kind: "description", uploaded_at: "2026-10-16T02:02:00.000Z" },
    ],
  }));
  assert.equal(generated.id, "generated");
  assert.equal(generated.timestamp, "2026-10-16T02:02:00.000Z");
});

test("approved complete orders show the backend schedule before Brevo submission", () => {
  const assets = [{kind:"sketch",uploaded_at:"2026-10-17T10:00:00Z"},{kind:"description",uploaded_at:"2026-10-17T10:01:00Z"}];
  const scheduled = order({review_status:"approved",assets,scheduled_send_at:"2026-10-17T12:00:00Z",email:{status:"pending",scheduled_at:"2026-10-17T12:00:00Z"}});
  assert.deepEqual(soulmateOrderStage(scheduled), {id:"scheduled",label:"Scheduled",detail:"Scheduled for automatic delivery",timestamp:"2026-10-17T12:00:00Z"});
  assert.equal(soulmateOrderStage({...scheduled,assets:[]}).id,"generated");
  assert.equal(soulmateOrderStage({...scheduled,review_status:"pending"}).id,"generated");
  assert.equal(soulmateOrderStage({...scheduled,scheduled_send_at:null,email:{status:"pending",scheduled_at:"invalid"}}).id,"generated");
  assert.equal(soulmateOrderStage({...scheduled,generation:{status:"needs_review",last_error:"Check files"}}).id,"failed");
  assert.equal(soulmateOrderStage({...scheduled,email:{status:"delivered"}}).id,"delivered");
});

test("scheduled and delivered email states take precedence over generated", () => {
  assert.equal(soulmateOrderStage(order({ email: { status: "scheduled", scheduled_at: "2026-10-16T13:00:00.000Z" } })).id, "scheduled");
  assert.equal(soulmateOrderStage(order({ fulfillment_status: "delivered", delivered_at: "2026-10-16T13:05:00.000Z" })).id, "delivered");
});

test("payment and fulfilment failures are visible immediately", () => {
  assert.equal(soulmateOrderStage(order({ payment_status: "failed" })).id, "failed");
  const failed = soulmateOrderStage(order({ generation: { status: "needs_review", last_error: "Generation failed" } }));
  assert.equal(failed.id, "failed");
  assert.equal(failed.detail, "Generation failed");
});
