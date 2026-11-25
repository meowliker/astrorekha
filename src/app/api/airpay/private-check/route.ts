import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { airpayConfig, airpayOrigin, fetchAirpayStatus, initiateAirpayCheckout, isAirpayReportId, validateAirpayStatus } from "@/lib/airpay-api";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { reconcileAirpayOrder } from "@/lib/airpay-reconciliation";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = {"Cache-Control":"no-store", "Referrer-Policy":"origin", "X-Robots-Tag":"noindex, nofollow"};
function config() {
  const id=process.env.AIRPAY_PRIVATE_TEST_ORDER_ID || "", token=process.env.AIRPAY_PRIVATE_TEST_TOKEN || "", expires=Date.parse(process.env.AIRPAY_PRIVATE_TEST_EXPIRES_AT || "");
  if(process.env.AIRPAY_PRIVATE_TEST_ENABLED!=="true" || !isAirpayReportId(id) || !/^[a-f0-9]{64}$/.test(token) || !Number.isFinite(expires) || Date.now()>=expires) return null;
  return {id,token,email:process.env.AIRPAY_PRIVATE_TEST_EMAIL || ""};
}
export async function GET() {
  if(!config())return new NextResponse("Not found",{status:404,headers});
  return new NextResponse(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Private Airpay test</title><style>body{background:#090d19;color:#fff;font:17px system-ui;max-width:540px;margin:10vh auto;padding:24px}article{border:1px solid #34394a;border-radius:20px;padding:28px;background:#151a29}p{line-height:1.6;color:#cbd0dc}button{background:#e91e63;color:white;border:0;border-radius:10px;padding:16px;width:100%;font:600 18px system-ui;cursor:pointer}.price{font-size:42px;font-weight:700;color:white}</style><article><h1>Private Airpay test</h1><p class="price">₹1.00 total</p><p>Your existing test order and saved report inputs will be used. This link cannot create another order. The public payment gateway stays unchanged.</p><button id="pay">Continue to Airpay · ₹1</button><p id="status" role="status"></p></article><script>
const token=location.hash.slice(1);history.replaceState(null,'',location.pathname);const button=document.getElementById('pay'),status=document.getElementById('status');
button.onclick=async()=>{button.disabled=true;status.textContent='Checking payment status…';try{const response=await fetch(location.pathname,{method:'POST',headers:{Authorization:'Bearer '+token}});const data=await response.json();if(!response.ok)throw Error(data.error||'Checkout unavailable');
localStorage.setItem('astrorekha_email',data.email);localStorage.setItem('astrorekha_checkout_email',data.email);localStorage.setItem('astrorekha_pending_payu_payment',JSON.stringify({txnid:data.txnId,type:'bundle',bundleId:data.bundleId,email:data.email}));
if(data.alreadyPaid){location.assign('/payment/processing?txnid='+encodeURIComponent(data.txnId));return;}
const form=document.createElement('form');form.method='POST';form.action=data.action;for(const [name,value] of Object.entries(data.fields)){const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.appendChild(input)}document.body.appendChild(form);form.submit();
}catch(e){status.textContent=e.message;button.disabled=false}};
if(!token){button.disabled=true;status.textContent='Open the private test link supplied for this test.'}
</script></html>`,{headers:{...headers,"Content-Type":"text/html; charset=utf-8"}});
}
export async function POST(request: NextRequest) {
  const c=config();if(!c)return NextResponse.json({error:"Not found"},{status:404,headers});
  const actual=Buffer.from(request.headers.get("authorization")?.replace(/^Bearer /,"")||""), expected=Buffer.from(c.token);
  if(actual.length!==expected.length || !timingSafeEqual(actual,expected))return NextResponse.json({error:"Invalid test access"},{status:401,headers});
  if(request.headers.get("origin")!=="https://astrorekha.com" || request.nextUrl.hostname!=="astrorekha.com")return NextResponse.json({error:"Invalid origin"},{status:403,headers});
  try {
    if(airpayConfig().mode!=="live" || airpayOrigin()!=="https://astrorekha.com")throw Error("Test checkout is not configured");
    const db=getSupabaseAdmin({fresh:true});
    const found=await db.from("payments").select("*").eq("id",c.id).eq("gateway","airpay").single();const order=found.data;
    if(found.error || !order || !c.email || order.customer_email!==c.email || order.amount!==100 || order.currency!=="INR" || order.payment_mode!=="live" || order.utm_source!=="airpay_local_check" || order.bundle_id!=="palm-birth-sketch")throw Error("Prepared test order unavailable");
    const base={txnId:order.id,email:order.customer_email,bundleId:order.bundle_id};
    if(order.payment_status==="paid")return NextResponse.json({...base,alreadyPaid:true},{headers});
    // Recheck Airpay before any payable handoff. An API outage cannot create a second attempt.
    const remote=await fetchAirpayStatus(order.id,"live");
    if(remote){const verified=validateAirpayStatus(order,remote);if(verified.status==="paid"){await reconcileAirpayOrder(order.id);return NextResponse.json({...base,alreadyPaid:true},{headers});}throw Error("An Airpay attempt already exists. Please ask us to check it before trying again.");}
    // Claim this single prepared order once, across concurrent tabs and server instances.
    const claim=await db.from("payments").update({gateway_order_id:order.id}).eq("id",order.id).eq("gateway","airpay").is("gateway_order_id",null).neq("payment_status","paid").select("id").maybeSingle();
    if(claim.error || !claim.data)throw Error("This checkout has already been opened. Please return to its existing tab; do not pay twice.");
    const checkout=await initiateAirpayCheckout(order);
    return NextResponse.json({...base,...checkout},{headers});
  }catch(error){console.warn("[airpay-private-check] Checkout unavailable",error instanceof Error?error.message:"unknown");return NextResponse.json({error:error instanceof Error?error.message:"Checkout unavailable"},{status:503,headers});}
}
