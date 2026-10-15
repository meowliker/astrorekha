export const maxDuration = 60;
import { NextRequest, NextResponse } from "next/server";
import { getSoulmateOrder, receiptPath, receiptCookie, reconcileSoulmateOrder, validOrderCallback } from "@/lib/soulmate-payu";
import type { SignedPayUResponse } from "@/lib/payu-response-hash";

const validId = (id: string) => /^sm_[a-f0-9]{20}$/.test(id);
function returnToReceipt(request: NextRequest, id?: string) {
  const target = id && validId(id) ? receiptPath(id) : "/soulmate/payment/problem";
  const url = new URL(target, request.url);
  // Next dev can normalize 127.0.0.1 to localhost; keep the checkout cookie's host.
  const host = request.headers.get("host");
  if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && host && /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) url.host = host;
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest) {
  let id = "";
  try {
    const form = await request.formData();
    const payload = Object.fromEntries([...form.entries()].filter((entry): entry is [string, string] => typeof entry[1] === "string")) as SignedPayUResponse;
    id = payload.txnid || "";
    if (!validId(id)) return returnToReceipt(request);
    const order = await getSoulmateOrder(id);
    if (!order) return returnToReceipt(request);
    if (!validOrderCallback(order, payload)) {
      console.warn("[soulmate/callback] Return validation failed; receipt will verify independently", id);
      // Do not trust callback values or issue a receipt credential. After the 303,
      // the original checkout cookie can authenticate a fresh PayU API check.
      return returnToReceipt(request, id);
    }
    try { await reconcileSoulmateOrder(order); } catch { console.error("[soulmate/callback] Verification pending for", id); }
    const response = returnToReceipt(request, id);
    response.cookies.set(receiptCookie(id));
    return response;
  } catch {
    console.error("[soulmate/callback] Return processing unavailable", validId(id) ? id : "invalid order");
    return returnToReceipt(request, id);
  }
}

// Refreshing/opening the callback URL should show a helpful page, never raw JSON.
export async function GET(request: NextRequest) {
  return returnToReceipt(request);
}
