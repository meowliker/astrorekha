import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { paytmPreviewOrderId, paytmCallbackOrigin } from "@/lib/paytm-preview";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { initiatePaytmCheckout } from "@/lib/paytm-api";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  if (!paytmPreviewOrderId()) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Paytm HTTPS ₹1 check</title><style>body{background:#090d19;color:#eee;font:17px system-ui;max-width:520px;margin:12vh auto;padding:24px}article{border:1px solid #34394a;border-radius:20px;padding:28px;background:#151a29}p{line-height:1.6;color:#cbd0dc}button{background:#00baf2;color:#071322;border:0;border-radius:10px;padding:16px;width:100%;font:600 18px system-ui;cursor:pointer}.price{font-size:42px;font-weight:700;color:white}</style><article><p>HTTPS PREVIEW CHECK</p><h1>Palm Reading test order</h1><p class="price">₹1.00</p><p>Total includes GST. This is a real payment for the existing test account. Customer prices and production checkout are unchanged.</p><p>Continue to Paytm, then scan the QR with the same GPay account used for the successful payment link.</p><button id="pay">Continue to Paytm · ₹1</button><p id="status" role="status"></p></article><script>
  const token=location.hash.slice(1);history.replaceState(null,'',location.pathname);
  const button=document.getElementById('pay'),status=document.getElementById('status');
  button.onclick=async()=>{button.disabled=true;status.textContent='Opening Paytm…';try{
    const response=await fetch(location.pathname,{method:'POST',headers:{Authorization:'Bearer '+token}});
    const data=await response.json();if(!response.ok)throw Error(data.error||'Unable to open checkout');
    localStorage.setItem('astrorekha_email',data.email);localStorage.setItem('astrorekha_checkout_email',data.email);
    localStorage.setItem('astrorekha_pending_payu_payment',JSON.stringify({txnid:data.txnId,type:'bundle',bundleId:'palm-reading',email:data.email,returnTo:'/onboarding/bundle-upsell'}));
    const action=new URL(data.action);if(action.origin!=='https://secure.paytmpayments.com'||action.pathname!=='/theia/api/v1/showPaymentPage')throw Error('Invalid checkout destination');
    const form=document.createElement('form');form.method='POST';form.action=action.href;
    for(const [name,value] of Object.entries(data.fields)){const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.appendChild(input)}
    document.body.appendChild(form);form.submit();
  }catch(e){status.textContent=e.message;button.disabled=false}};
  if(!token){button.disabled=true;status.textContent='Open the private preview link provided in the chat.'}
  </script></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" } });
}

export async function POST(request: NextRequest) {
  const id = paytmPreviewOrderId();
  if (!id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const provided = Buffer.from(request.headers.get("authorization")?.replace(/^Bearer /, "") || "");
  const expected = Buffer.from(process.env.PAYTM_PREVIEW_TEST_TOKEN || "");
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return NextResponse.json({ error: "Invalid preview access" }, { status: 401 });
  if (request.headers.get("origin") !== paytmCallbackOrigin()) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  try {
    const { data: order, error } = await getSupabaseAdmin().from("payments").select("*").eq("id", id).eq("gateway", "paytm").single();
    if (error || !order || order.amount !== 100 || order.currency !== "INR" || order.utm_source !== "paytm_https_preview_check" || order.payment_mode !== "live") throw new Error("Prepared test order unavailable");
    if (order.payment_status === "paid") throw new Error("This test order is already paid. Do not pay again.");
    const checkout = await initiatePaytmCheckout(order);
    console.info("[paytm-preview] Checkout opened", { orderId: id, amount: 100, callbackOrigin: paytmCallbackOrigin() });
    return NextResponse.json({ ...checkout, txnId: id, email: order.customer_email }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.warn("[paytm-preview] Checkout unavailable", { orderId: id });
    return NextResponse.json({ error: "Unable to open this test checkout. Please ask me to check its status before retrying." }, { status: 503 });
  }
}
