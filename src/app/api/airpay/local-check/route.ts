import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { localPaymentGateway } from "@/lib/local-payment-gateway";
import { isAirpayReportId, initiateAirpayCheckout } from "@/lib/airpay-api";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { normalizeBirthDetailsSnapshot } from "@/lib/birth-details";
import { saveCheckoutReportInputs } from "@/lib/checkout-report-inputs";
import { validCheckoutPalm } from "@/lib/report-input-snapshot";
import { normalizePricing } from "@/lib/pricing";
import { quotePaymentOrder } from "@/lib/payment-quote";
import { normalizeIndianWhatsappNumber, toPayUPhoneNumber } from "@/lib/whatsapp";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const EMAIL = "kittufake123+airpay@gmail.com";
function testId() {
  const id = process.env.AIRPAY_LOCAL_TEST_ORDER_ID || "";
  return localPaymentGateway() === "airpay" && isAirpayReportId(id) && /^[a-f0-9]{64}$/.test(process.env.AIRPAY_LOCAL_TEST_TOKEN || "") ? id : null;
}
export async function GET() {
  if (!testId()) return new NextResponse("Not found", {status:404});
  return new NextResponse(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Airpay ₹1 flow test</title><style>body{background:#090d19;color:#eee;font:16px system-ui;max-width:600px;margin:32px auto;padding:24px}article{border:1px solid #34394a;border-radius:20px;padding:28px;background:#151a29}p{line-height:1.6;color:#cbd0dc}label{display:block;margin:16px 0}input,select{box-sizing:border-box;width:100%;padding:10px;margin-top:5px;border-radius:8px;border:1px solid #555;background:#202638;color:white}button{background:#e91e63;color:white;border:0;border-radius:10px;padding:16px;width:100%;font:600 18px system-ui;cursor:pointer}.price{font-size:38px;font-weight:700;color:white}small{color:#9da4b6}</style><article><h1>Airpay test checkout</h1><p class="price">₹1.00 total</p><p>Palm + Birth Chart + Soulmate bundle with its normal report access and bonus coins. Only this private test order costs ₹1. Public prices and Pine Labs remain unchanged.</p><p>${EMAIL}</p><form id="details"><label>First name<input name="name" required value="Airpay Test"></label><label>Phone for Airpay checkout<input name="phone" inputmode="numeric" required placeholder="10-digit mobile number"></label><label>Birth date<input name="date" type="date" required></label><label>Birth time<input name="time" type="time" required></label><label>Birthplace<input name="place" required placeholder="City, state, country"></label><label>Gender<select name="gender"><option value="male">Male</option><option value="female">Female</option></select></label><label>Palm photo<input id="palm" type="file" accept="image/jpeg,image/png,image/webp" required></label><small>Your photo is saved for the report, not sent to Airpay.</small><p><button>Continue to Airpay · ₹1</button></p></form><p id="status" role="status"></p></article><script>
const token=location.hash.slice(1);history.replaceState(null,'',location.pathname);
const form=document.getElementById('details'),status=document.getElementById('status'),button=form.querySelector('button');
form.onsubmit=async(e)=>{e.preventDefault();button.disabled=true;status.textContent='Saving report inputs and opening Airpay…';try{
const file=document.getElementById('palm').files[0];if(!file)throw Error('Choose a palm photo');
const bitmap=await createImageBitmap(file),canvas=document.createElement('canvas');const scale=Math.min(1,1000/Math.max(bitmap.width,bitmap.height));canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);const palmImage=canvas.toDataURL('image/jpeg',0.8);bitmap.close();
const f=new FormData(form),[year,month,day]=f.get('date').split('-'),[hour,minute]=f.get('time').split(':');
const birthDetails={birthYear:year,birthMonth:month,birthDay:day,birthHour:String(Number(hour)%12||12),birthMinute:minute,birthPeriod:Number(hour)>=12?'PM':'AM',birthPlace:f.get('place'),gender:f.get('gender'),timezone:'Asia/Kolkata',knowsBirthTime:true};
const response=await fetch(location.pathname,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({name:f.get('name'),phone:f.get('phone'),birthDetails,palmImage})});const data=await response.json();if(!response.ok)throw Error(data.error||'Unable to open checkout');
localStorage.setItem('astrorekha_email',data.email);localStorage.setItem('astrorekha_checkout_email',data.email);localStorage.setItem('astrorekha_user_id',data.userId);localStorage.setItem('astrorekha_anon_id',data.userId);localStorage.setItem('astrorekha_birth_details',JSON.stringify(birthDetails));
localStorage.setItem('astrorekha_pending_payu_payment',JSON.stringify({txnid:data.txnId,type:'bundle',bundleId:'palm-birth-sketch',email:data.email,returnTo:'/onboarding/bundle-upsell'}));
const checkout=document.createElement('form');checkout.method='POST';checkout.action=data.action;for(const [name,value]of Object.entries(data.fields)){const field=document.createElement('input');field.type='hidden';field.name=name;field.value=value;checkout.appendChild(field)}document.body.appendChild(checkout);checkout.submit();
}catch(e){status.textContent=e.message;button.disabled=false}};
if(!token){button.disabled=true;status.textContent='Open the private test link supplied in this session.'}
</script></html>`,{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Referrer-Policy":"no-referrer","X-Robots-Tag":"noindex, nofollow"}});
}
export async function POST(request: NextRequest) {
  const id=testId();if(!id)return NextResponse.json({error:"Not found"},{status:404});
  const expected=Buffer.from(process.env.AIRPAY_LOCAL_TEST_TOKEN || ""),actual=Buffer.from(request.headers.get("authorization")?.replace(/^Bearer /,"") || "");
  if(actual.length!==expected.length || !timingSafeEqual(actual,expected))return NextResponse.json({error:"Invalid test access"},{status:401});
  let origin: URL;
  try { origin = new URL(request.headers.get("origin") || ""); } catch { return NextResponse.json({error:"Invalid origin"},{status:403}); }
  if(!["localhost","127.0.0.1"].includes(origin.hostname) || !["http:","https:"].includes(origin.protocol) || origin.host !== (request.headers.get("host") || request.nextUrl.host))return NextResponse.json({error:"Invalid origin"},{status:403});
  try {
    if(Number(request.headers.get("content-length"))>1700000)throw Error("Photo too large");
    const body=await request.json(),birth=normalizeBirthDetailsSnapshot(body.birthDetails,"airpay_local_check");
    const phone=toPayUPhoneNumber(normalizeIndianWhatsappNumber(body.phone));
    if(!birth?.completeForBirthChart || !validCheckoutPalm(body.palmImage) || !phone)throw Error("Complete the birth details, phone and palm photo first");
    const name=String(body.name || "Airpay Test").replace(/[^a-zA-Z ]/g,"").trim().slice(0,50) || "Airpay Test";
    const db=getSupabaseAdmin({fresh:true});
    const uid=process.env.AIRPAY_LOCAL_TEST_USER_ID || "";if(!/^[a-f0-9-]{36}$/.test(uid))throw Error("Test account not configured");
    const {data:existingUser,error:userRead}=await db.from("users").select("id").eq("email",EMAIL).maybeSingle();if(userRead || (existingUser && existingUser.id!==uid))throw Error("Test email already belongs to another account");
    if(!existingUser){const {error}=await db.from("users").insert({id:uid,email:EMAIL,payment_status:"pending",coins:0,unlocked_features:{}});if(error)throw Error("Unable to prepare test account");}
    const existing=await db.from("payments").select("*").eq("id",id).maybeSingle();if(existing.error)throw Error("Unable to read test order");
    let order=existing.data;
    if(!order){
      const pricing=await db.from("settings").select("value").eq("key","pricing").maybeSingle();if(pricing.error)throw Error("Unable to read bundle");
      const quote=quotePaymentOrder(normalizePricing(pricing.data?.value),{type:"bundle",bundleId:"palm-birth-sketch"});
      const row={id,gateway:"airpay",payment_mode:"live",user_id:uid,customer_email:EMAIL,customer_phone:phone,customer_name:name,type:"bundle",bundle_id:"palm-birth-sketch",product_name:quote.productName,amount:100,total_amount:100,base_amount:85,gst_amount:15,gst_rate:18,tax_mode:"inclusive",currency:"INR",payment_status:"created",fulfillment_features:quote.features,fulfillment_coins:quote.coins,feature:quote.features.join(","),coins:quote.coins,birth_details_snapshot:birth,birth_details_complete:true,utm_source:"airpay_local_check",utm_medium:"manual_test",utm_campaign:"airpay_one_rupee_20261125",landing_path:"/",landing_url:"http://127.0.0.1:3228/api/airpay/local-check",created_at:new Date().toISOString()};
      const saved=await db.from("payments").insert(row).select("*").single();if(saved.error)throw Error("Unable to save test order");order=saved.data;
    }
    if(order.gateway!=="airpay" || order.payment_mode!=="live" || order.amount!==100 || order.customer_email!==EMAIL || order.user_id!==uid || order.utm_source!=="airpay_local_check")throw Error("Test order mismatch");
    if(order.payment_status==="paid")throw Error("This order is already paid. Do not pay again.");
    await saveCheckoutReportInputs("IN",id,body.palmImage);
    const checkout=await initiateAirpayCheckout(order);
    return NextResponse.json({...checkout,txnId:id,userId:uid,email:EMAIL},{headers:{"Cache-Control":"no-store"}});
  } catch(error) {console.warn("[airpay-local-check] Unable to open test checkout",error instanceof Error?error.message:"unknown");return NextResponse.json({error:error instanceof Error?error.message:"Unable to open test checkout"},{status:503});}
}
