import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { middleware } from "../src/middleware";

async function run() {
  const first = await middleware(new NextRequest(
    "https://astrorekha.com/?utm_source=facebook&utm_campaign=FIRST&campaign_id=123"
  ));
  const firstTouch = first.cookies.get("ar_utm_first")?.value;
  assert.equal(JSON.parse(firstTouch || "{}").utm_campaign, "FIRST");
  assert.equal(JSON.parse(first.cookies.get("ar_utm_last")?.value || "{}").campaign_id, "123");

  const nextRequest = new NextRequest("https://astrorekha.com/welcome?utm_campaign=LAST", {
    headers: { Cookie: `ar_utm_first=${encodeURIComponent(firstTouch || "")}` },
  });
  const second = await middleware(nextRequest);
  assert.equal(second.cookies.get("ar_utm_first"), undefined);
  assert.equal(JSON.parse(second.cookies.get("ar_utm_last")?.value || "{}").utm_campaign, "LAST");

  const untagged = await middleware(new NextRequest("https://astrorekha.com/welcome"));
  assert.equal(untagged.cookies.get("ar_utm_last"), undefined);
  console.log("UTM middleware first/last touch checks passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
