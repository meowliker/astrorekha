'use client';
import {isUSGoogleJourney} from './google-ads-funnel';
import {getPaymentAttributionPayload} from './attribution-client';
const seen=new Map<string,number>();
export async function trackMarketingEvent(input:{eventName:string;productType?:string;productId?:string;productName?:string;dedupeKey?:string;dedupeTtlMs?:number}){
 try{const key=input.dedupeKey||`${input.eventName}:${location.pathname}`,now=Date.now();if(now-(seen.get(key)||0)<(input.dedupeTtlMs||2000))return;seen.set(key,now);
 const sessionKey=isUSGoogleJourney()?'ar_us_main_google_session':'ar_us_main_session';let session=sessionStorage.getItem(sessionKey);if(!session){session=crypto.randomUUID();sessionStorage.setItem(sessionKey,session);}
 await fetch('/api/us/main/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({eventId:crypto.randomUUID(),eventName:input.eventName,productType:input.productType,productId:input.productId,path:location.pathname,sessionId:session,attribution:getPaymentAttributionPayload()}),keepalive:true});
 }catch{/* Tracking never blocks onboarding. */}
}
