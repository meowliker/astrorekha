import assert from "node:assert/strict";
import { fetchMetaTrackingActivities } from "../src/lib/tracking-meta-detail";

async function main() {
  const originalFetch = global.fetch;
  global.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/activities?")) return Response.json({ data: [
      {
        event_time: "2026-10-15T07:32:24+0000",
        event_type: "update_campaign_budget",
        translated_event_type: "Campaign budget updated",
        extra_data: JSON.stringify({
          old_value: { type: "payment_amount", currency: "INR", old_value: 500000, additional_value: "Per day" },
          new_value: { type: "payment_amount", currency: "INR", new_value: 1500000, additional_value: "Per day" },
          type: "composite_data",
        }),
      },
      {
        event_time: "2026-10-15T07:31:24+0000",
        event_type: "update_campaign_budget",
        translated_event_type: "Campaign budget updated",
        extra_data: JSON.stringify({ old_value: "₹5,000.00", new_value: "₹15,000.00" }),
      },
    ] });
    if (url.includes("/act_123?")) return Response.json({ currency: "INR" });
    throw new Error(`Unexpected Meta request: ${new URL(url).pathname}`);
  };
  try {
    const activities = await fetchMetaTrackingActivities({ accountId: "123", accessToken: "example" }, { start: "2026-10-15", end: "2026-10-15" });
    assert.equal(activities.length, 2);
    assert.equal(activities[0].detail, "₹5000.00 → ₹15000.00");
    assert.equal(activities[1].detail, "₹5000.00 → ₹15000.00");
  } finally {
    global.fetch = originalFetch;
  }
  console.log("Meta budget activity formatting checks passed");
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
