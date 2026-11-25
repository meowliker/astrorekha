import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { readShiprocketState, shiprocketConfig } from "@/lib/shiprocket-checkout-api";
import { shiprocketBrowserSession } from "@/lib/shiprocket-checkout";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const states = request.nextUrl.searchParams.getAll("state");
  const id = states.length === 1 ? readShiprocketState(states[0]) : null;
  if (!id) return new NextResponse("Invalid checkout link", { status: 400 });
  try {
    const { token } = await shiprocketBrowserSession(id), { ui } = shiprocketConfig();
    const fallback = id.startsWith("sm_") ? `/soulmate/payment?order=${id}` : `/payment/processing?txnid=${id}`;
    const nonce = crypto.randomBytes(16).toString("base64");
    const json = (value: string) => JSON.stringify(value).replace(/</g, "\\u003c");
    return new NextResponse(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AstroRekha secure checkout</title><link rel="stylesheet" href="${ui}/assets/styles/shopify.css"><style nonce="${nonce}">body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0f1a;color:white;font:16px system-ui}main{max-width:400px;padding:32px;text-align:center}button{padding:16px 24px;border:0;border-radius:12px;background:#ec1248;color:white;font:inherit;font-weight:600;cursor:pointer}button:disabled{opacity:.5}a{color:#aaa}p{line-height:1.5;color:#aaa}</style></head><body><main><h1>Opening secure checkout…</h1><p>Please wait while your payment options load.</p><button id="checkout" disabled>Loading checkout…</button><p id="message"></p><a href="${fallback}">Check payment status</a></main><script nonce="${nonce}">const button=document.getElementById('checkout');function failed(){document.getElementById('message').textContent='Checkout could not load. Please check your payment status before retrying.';}function ready(){if(!window.HeadlessCheckout){failed();return;}button.disabled=false;button.textContent='Continue to secure checkout';button.addEventListener('click',function(e){button.disabled=true;try{HeadlessCheckout.addToCart(e,${json(token)},{fallbackUrl:location.origin+${json(fallback)},isInitiatedFromApp:true});}catch{failed();}finally{button.disabled=false;}});button.click();}const script=document.createElement('script');script.src=${json(ui + "/assets/js/channels/shopify.js")};script.onload=ready;script.onerror=failed;document.head.appendChild(script);</script></body></html>`, { headers: {
      "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": `default-src 'self'; script-src 'self' 'nonce-${nonce}' ${ui} https://sr-cdn.shiprocket.in; style-src 'self' 'unsafe-inline' ${ui}; img-src 'self' https: data:; frame-src ${ui} https://fastrr-boost-ui.pickrr.com https://checkout-ui.shiprocket.com; connect-src 'self' https://events.pickrr.com https://uptime2.fastrr.com https://checkout-api.shiprocket.com; frame-ancestors 'self'; base-uri 'none'; form-action 'none'`,
    } });
  } catch { return new NextResponse("This checkout expired or is unavailable. Return to your order to check its payment status before paying again.", { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
