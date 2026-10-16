const assert = require("node:assert/strict");
process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: "CommonJS", moduleResolution: "node" });
require("ts-node/register");
require("tsconfig-paths").register({ baseUrl: process.cwd(), paths: { "@/*": ["src/*"] } });

const { readMetaBid, changeMetaBid, MetaBidError } = require("../src/lib/tracking-meta-bid.ts");
const { fetchMetaTrackingActivities } = require("../src/lib/tracking-meta-detail.ts");
const { hourlyBudgetMarkers } = require("../src/lib/tracking-budget-markers.ts");

async function main() {
  const originalFetch = global.fetch;
  const credential = { accountId: "123456789", accessToken: "test-token", label: "Test account" };
  let bidAmount = 98000;
  let objectAccount = "123456789";
  let writes = 0;
  const campaignId = "987654321";
  const adsetId = "111112222";
  const activities = [
    { event_time: "2026-10-16T11:47:59+0000", event_type: "update_campaign_budget", translated_event_type: "Campaign budget updated",
      object_type: "CAMPAIGN_GROUP", object_id: campaignId, object_name: "Test campaign",
      extra_data: JSON.stringify({ old_value: { type: "payment_amount", currency: "INR", old_value: 1000000 }, new_value: { type: "payment_amount", currency: "INR", new_value: 400000 } }) },
    { event_time: "2026-10-16T04:00:00+0000", event_type: "update_ad_set_budget", translated_event_type: "Ad set budget updated",
      object_type: "CAMPAIGN", object_id: adsetId, object_name: "Test ad set",
      extra_data: JSON.stringify({ old_value: { type: "payment_amount", currency: "INR", old_value: 500000 }, new_value: { type: "payment_amount", currency: "INR", new_value: 700000 } }) },
    { event_time: "2026-10-16T08:56:10+0000", event_type: "update_ad_set_bid_strategy", translated_event_type: "Ad set bid strategy updated",
      object_type: "CAMPAIGN", object_id: adsetId, object_name: "Test ad set",
      extra_data: JSON.stringify({ old_value: "COST_CAP", new_value: "COST_CAP", additional_value: { old_value: 94000, new_value: 98000, currency: "INR", type: "payment_amount" } }) },
  ];
  global.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.includes("/activities?")) return Response.json({ data: activities });
    if (url.endsWith("/v21.0/") && init.method === "POST") return Response.json([{ code: 200, body: JSON.stringify({ id: adsetId, campaign_id: campaignId }) }]);
    if (url.includes("act_123456789")) return Response.json({ currency: "INR" });
    if (url.includes(adsetId) && init.method === "POST") {
      writes++;
      assert.equal(init.headers.Authorization, "Bearer test-token");
      assert.equal(String(init.body), "bid_amount=104000");
      bidAmount = 104000;
      return Response.json({ success: true });
    }
    if (url.includes(adsetId)) return Response.json({ id: adsetId, account_id: objectAccount, campaign_id: campaignId, name: "Test ad set", bid_amount: bidAmount });
    throw new Error(`Unexpected Meta request: ${url.replace(/access_token=[^&]+/, "access_token=hidden")}`);
  };
  try {
    const bid = await readMetaBid(credential, adsetId);
    assert.equal(bid.amountMinor, 98000);
    assert.equal(bid.currency, "INR");
    await assert.rejects(changeMetaBid(credential, adsetId, 94000, 104000), (error) => error instanceof MetaBidError && error.status === 409);
    assert.equal(writes, 0);
    assert.equal((await changeMetaBid(credential, adsetId, 98000, 104000)).amountMinor, 104000);
    assert.equal(writes, 1);
    objectAccount = "999999999";
    await assert.rejects(readMetaBid(credential, adsetId), (error) => error instanceof MetaBidError && error.status === 403);
    assert.equal(writes, 1);

    const log = await fetchMetaTrackingActivities(credential, { start: "2026-10-16", end: "2026-10-16" }, "calendar_ist", true);
    assert.equal(log.find((item) => item.action === "Ad set bid updated")?.detail, "₹940.00 → ₹980.00");
    assert.equal(log.filter((item) => item.budgetChange).length, 2);
    assert.equal(log.find((item) => item.objectId === adsetId && item.budgetChange)?.campaignId, campaignId);
    const campaigns = [{ key: `meta:123456789:${campaignId}`, accountId: "123456789", campaignId }];
    const indian = hourlyBudgetMarkers(log, campaigns, "2026-10-16", "calendar_ist");
    assert.equal(indian[campaigns[0].key][17][0].detail, "₹10000.00 → ₹4000.00");
    assert.equal(indian[campaigns[0].key][9][0].after, 7000);
    const us = hourlyBudgetMarkers(log, campaigns, "2026-10-16", "business_1130_ist");
    assert.equal(us[campaigns[0].key][5][0].before, 10000);
    assert.equal(us[campaigns[0].key][22].length, 0);
    const previousUs = hourlyBudgetMarkers(log, campaigns, "2026-10-15", "business_1130_ist");
    assert.equal(previousUs[campaigns[0].key][22][0].after, 7000);
  } finally { global.fetch = originalFetch; }
  console.log("Tracking bid and hourly budget marker checks passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
