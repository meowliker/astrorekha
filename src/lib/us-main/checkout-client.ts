'use client';
import { getPaymentAttributionPayload } from './attribution-client';
import { useOnboardingStore } from './onboarding-store';
import { trackCheckout } from './analytics';
import {readUsMainGaIdentity} from './ga-client';
import { pixelEvents } from './pixel-events';
export async function startUsCheckout(type:'bundle'|'upsell',ids:string[],promoCode?:string){
 const email=(localStorage.getItem('astrorekha_us_main_email')||'').trim().toLowerCase();
 const basket=JSON.stringify([email,type,ids,...(promoCode?[promoCode.trim().toUpperCase()]:[])]);const savedKey='astrorekha_us_main_request';let saved: {basket:string;key:string}|null=null;
 try{saved=JSON.parse(localStorage.getItem(savedKey)||'null');}catch{}
 const requestKey=saved?.basket===basket?saved.key:crypto.randomUUID();localStorage.setItem(savedKey,JSON.stringify({basket,key:requestKey}));
 const gaIdentity=await readUsMainGaIdentity();
 const response=await fetch('/api/us/main/checkout',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(30000),body:JSON.stringify({requestKey,email,type,...(promoCode?{promoCode:promoCode.trim().toUpperCase()}:{}),bundleId:ids[0],offerIds:ids,parentOrderId:localStorage.getItem('astrorekha_us_main_main_order'),firstName:localStorage.getItem('astrorekha_us_main_name')||'Customer',birthDetails:useOnboardingStore.getState(),attribution:{marketing:getPaymentAttributionPayload(),...gaIdentity}})});
 const data=await response.json();if(!response.ok)throw new Error(data.error||'Unable to start checkout');
 localStorage.setItem('astrorekha_us_main_pending_order',data.orderId);
 if(type==='bundle')localStorage.setItem('astrorekha_us_main_main_order',data.orderId);
 if(data.amount){trackCheckout(ids.join(','),'US AstroRekha reading',data.amount);pixelEvents.initiateCheckout(data.amount,ids,data.orderId);}
 window.location.assign(data.url);
}
export async function prepareUsEmail(email:string){
 const old=localStorage.getItem('astrorekha_us_main_email');const changed=!!old&&old!==email;
 if(changed)for(const key of ['payment_completed','registration_completed','main_order','pending_order','request','user_id','anon_id','bundle_id'])localStorage.removeItem(`astrorekha_us_main_${key}`);
 localStorage.setItem('astrorekha_us_main_email',email);localStorage.setItem('astrorekha_us_main_checkout_email',email);return changed;
}
