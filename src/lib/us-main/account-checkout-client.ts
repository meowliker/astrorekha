'use client';
import type {AccountPurchaseType} from './account-catalog';
import {getPaymentAttributionPayload} from './attribution-client';
import {readUsMainGaIdentity} from './ga-client';
import {trackCheckout} from './analytics';
import {pixelEvents} from './pixel-events';
export async function startUsAccountCheckout(type:AccountPurchaseType,productId:string,userId:string){
 const basket=JSON.stringify([userId,type,productId]);let saved:{basket:string;key:string}|null=null;
 try{saved=JSON.parse(localStorage.getItem('ar_us_account_checkout')||'null');}catch{}
 const key=saved?.basket===basket?saved.key:crypto.randomUUID();
 localStorage.setItem('ar_us_account_checkout',JSON.stringify({basket,key}));
 const identity=await readUsMainGaIdentity();
 const r=await fetch('/api/us/main/checkout',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(30000),body:JSON.stringify({type,productId,requestKey:key,attribution:{marketing:getPaymentAttributionPayload(),...identity}})});
 const d=await r.json();if(!r.ok)throw new Error(d.error||'Unable to open Stripe');
 if(d.amount){trackCheckout(productId,'US AstroRekha purchase',d.amount);pixelEvents.initiateCheckout(d.amount,[productId],d.orderId);}
 window.location.assign(d.url);
}
