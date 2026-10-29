import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { pineLabsLocalTestOrderId } from "@/lib/pinelabs-local-test";
import { pineLabsCallbackOrigin, initiatePineLabsCheckout } from "@/lib/pinelabs-api";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { pineLabsCheckoutUrl } from "@/lib/pinelabs-checkout-url";


export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  if (!pineLabsLocalTestOrderId()) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pine Labs Local ₹1 check</title><style>body{background:#090d19;color:#eee;font:17px system-ui;max-width:520px;margin:12vh auto;padding:24px}article{border:1px solid #34394a;border-radius:20px;padding:28px;background:#151a29}p{line-height:1.6;color:#cbd0dc}button{background:#00baf2;color:#071322;border:0;border-radius:10px;padding:16px;width:100%;font:600 18px system-ui;cursor:pointer}.price{font-size:42px;font-weight:700;color:white}</style><article><p>LOCAL PAYMENT CHECK</p><h1>Palm Reading test order</h1><p class="price">₹1.00</p><p>Total includes GST. This is a real ₹1 payment for your test order. Customer prices and production checkout are unchanged.</p><p>Continue to Pine Labs and pay ₹1. Keep this browser tab open so it can return to the local app.</p><button id="pay">Continue to Pine Labs · ₹1</button><p id="status" role="status"></p></article><script>
  const token=location.hash.slice(1);history.replaceState(null,'',location.pathname);
  const button=document.getElementById('pay'),status=document.getElementById('status');
  button.onclick=async()=>{button.disabled=true;status.textContent='Opening Pine Labs…';try{
    const response=await fetch(location.pathname,{method:'POST',headers:{Authorization:'Bearer '+token}});
    const data=await response.json();if(!response.ok)throw Error(data.error||'Unable to open checkout');
    localStorage.setItem('astrorekha_email',data.email);localStorage.setItem('astrorekha_checkout_email',data.email);
    localStorage.setItem('astrorekha_pending_payu_payment',JSON.stringify({txnid:data.txnId,type:'bundle',bundleId:'palm-reading',email:data.email,returnTo:'/onboarding/bundle-upsell'}));
    location.assign(data.action);
  }catch(e){status.textContent=e.message;button.disabled=false}};
  if(!token){button.disabled=true;status.textContent='Open the private local test link provided in the chat.'}
  </script></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" } });
}

export async function POST(request: NextRequest) {
  const id = pineLabsLocalTestOrderId();
  if (!id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const provided = Buffer.from(request.headers.get("authorization")?.replace(/^Bearer /, "") || "");
  const expected = Buffer.from(process.env.PINELABS_LOCAL_TEST_TOKEN || "");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return NextResponse.json({ error: "Invalid local test access" }, { status: 401 });
  // A public callback relay may be used, but this private launcher stays local.
  if (!["localhost", "127.0.0.1", "[::1]"].includes(request.nextUrl.hostname) || request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const { data: order, error } = await getSupabaseAdmin().from("payments").select("*").eq("id", id).eq("gateway", "pinelabs").single();
    if (error || !order || order.amount !== 100 || order.currency !== "INR" || order.utm_source !== "pinelabs_local_check" || order.payment_mode !== "live") throw new Error("Prepared test order unavailable");
    if (order.payment_status === "paid") throw new Error("This test order is already paid. Do not pay again.");
    // A checkout prepared by the local test runner must be reused: Pine Labs
    // returns DUPLICATE_REQUEST rather than another URL for an existing order.
    const cached = process.env.PINELABS_LOCAL_TEST_CHECKOUT_URL;
    const checkout = order.gateway_order_id && cached
      ? { gateway: "pinelabs", action: pineLabsCheckoutUrl(cached) }
      : await initiatePineLabsCheckout(order);
    console.info("[pinelabs-local-check] Checkout opened", { orderId: id, amount: 100, callbackOrigin: pineLabsCallbackOrigin() });
    return NextResponse.json({ ...checkout, txnId: id, email: order.customer_email }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.warn("[pinelabs-local-check] Checkout unavailable", { orderId: id });
    return NextResponse.json({ error: "Unable to open this test checkout. Please ask me to check its status before retrying." }, { status: 503 });
  }
}
