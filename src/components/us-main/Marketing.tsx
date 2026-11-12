'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Script from 'next/script';
import { captureAttributionFromPage } from '@/lib/us-main/attribution-client';
import { trackMarketingEvent } from '@/lib/us-main/events-client';
import { trackPixelEvent } from '@/lib/us-main/pixel-events';

/** Independent pixel/GA cookies and first-party event ledger for the US main funnel. */
export function USMainMarketing() {
 const path = usePathname();
 const previous = useRef<string | null>(null);
 const pixel = process.env.NEXT_PUBLIC_US_MAIN_META_PIXEL_ID;
 const ga = process.env.NEXT_PUBLIC_US_MAIN_GA_ID;
 const [live,setLive]=useState(false);
 const gaConfigured=useRef(false);
 useEffect(()=>{setLive(process.env.NEXT_PUBLIC_US_MAIN_TRACKING_ENABLED==='true'&&['astrorekha.com','www.astrorekha.com'].includes(location.hostname));},[]);
 useEffect(() => {
  if (previous.current === path) return;
  previous.current = path;
  captureAttributionFromPage();
  void trackMarketingEvent({eventName:'page_view'});
 },[path]);
 useEffect(()=>{
  if (!live) return;
  if (pixel) trackPixelEvent('PageView');
  if (ga && /^G-[A-Z0-9]+$/.test(ga)) {
   // Queue before the asynchronously loaded GA library; do not create a second container.
   const w = window as typeof window & {dataLayer?: unknown[]};
   w.dataLayer ||= [];
   if (!w.gtag) w.gtag = function () {
    // gtag processes Arguments objects, not arrays of command parameters.
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer!.push(arguments);
   };
   if(!gaConfigured.current){
    gaConfigured.current=true;
    const command=w.gtag as (...args:unknown[])=>void;
    command('js',new Date());command('config',ga,{cookie_prefix:'us_main',send_page_view:false});
   }
   w.gtag('event','page_view',{send_to:ga,page_location:location.href,page_path:path,funnel:'us_main'});
  }
 },[path,live,pixel,ga]);
 if (!live) return null;
 return <>
  {pixel && /^\d+$/.test(pixel) && <Script id="us-main-pixel" strategy="afterInteractive">{`
   !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
   fbq.disablePushState=true;fbq('set','autoConfig',false,'${pixel}');fbq('init','${pixel}');`}</Script>}
  {ga && /^G-[A-Z0-9]+$/.test(ga) && <>
   <Script src={`https://www.googletagmanager.com/gtag/js?id=${ga}`} strategy="afterInteractive" />
  </>}
 </>;
}
