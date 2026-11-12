'use client';
import {useEffect,useState,Suspense} from 'react';
import {useSearchParams,useRouter} from 'next/navigation';
import {useUserStore} from '@/lib/us-main/user-store';
function Status(){const params=useSearchParams(),router=useRouter(),[message,setMessage]=useState('Confirming your payment…'),[retry,setRetry]=useState(0),[waiting,setWaiting]=useState(true),[failed,setFailed]=useState(false),[returnPath,setReturnPath]=useState('/us/onboarding/bundle-pricing');
 useEffect(()=>{let cancelled=false,timer:ReturnType<typeof setTimeout>;const order=params.get('order');let attempts=0;
 const check=async()=>{try{const res=await fetch(`/api/us/main/payment/status?order=${encodeURIComponent(order||'')}`,{cache:'no-store'}),d=await res.json();if(cancelled)return;
 if(res.ok&&['report','coins','chat_pass'].includes(d.type))setReturnPath(d.type==='report'?'/reports':'/chat');
 if(res.ok&&d.fulfilled&&d.status==='paid'){
 if(['report','coins','chat_pass'].includes(d.type)){
 localStorage.removeItem('ar_us_account_checkout');
 window.location.replace(d.type==='report'?'/reports':'/chat');return;
 }
 localStorage.removeItem('astrorekha_us_main_pending_order');localStorage.removeItem('astrorekha_us_main_request');localStorage.setItem('astrorekha_us_main_email',d.email);localStorage.setItem('astrorekha_us_main_checkout_email',d.email);localStorage.setItem('astrorekha_us_main_user_id',d.userId);useUserStore.getState().setUserId(d.userId);
 if(d.type==='bundle'){localStorage.setItem('astrorekha_us_main_main_order',d.id);localStorage.setItem('astrorekha_us_main_payment_completed','true');localStorage.setItem('astrorekha_us_main_bundle_id',d.bundleId);router.replace('/us/onboarding/bundle-upsell');}else router.replace('/us/onboarding/step-19');return;}
 if(res.ok&&d.status==='failed'){setFailed(true);setWaiting(false);setMessage('This checkout expired without a confirmed payment. You can return to your offer.');localStorage.removeItem('astrorekha_us_main_request');localStorage.removeItem('ar_us_account_checkout');return;}
 if(res.status===403){setWaiting(false);setMessage('Open this order in the browser where you started checkout.');return;}
 }catch{/* Keep the same transaction while verification is temporarily unavailable. */}
 if(cancelled)return;if(++attempts<20){timer=setTimeout(check,3000);}else{setWaiting(false);setMessage('Payment is not confirmed yet. If charged, do not pay again. Check the same transaction again.');}};
 setWaiting(true);void check();return()=>{cancelled=true;clearTimeout(timer);};},[params,router,retry]);
 return <main className="min-h-screen bg-background flex items-center justify-center p-6"><div className="max-w-md rounded-3xl border border-border bg-card p-8 text-center"><h1 className="text-2xl font-bold mb-6">Payment Status</h1><p className="text-muted-foreground">{message}</p>{!waiting&&<button className="mt-6 w-full rounded-xl bg-primary p-4" onClick={()=>setRetry(x=>x+1)}>Check Again</button>}{failed&&<a className="block mt-4 underline" href={returnPath}>Return to your offer</a>}{params.get('cancelled')==='1'&&<a className="block mt-4 underline" href={returnPath}>Return to checkout</a>}</div></main>;
}
export default function Payment(){return <Suspense><Status/></Suspense>;}
