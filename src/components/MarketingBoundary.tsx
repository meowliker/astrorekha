"use client";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { useEffect, useRef } from "react";
import { MetaPixel } from "./MetaPixel";
import { GoogleAnalytics } from "./GoogleAnalytics";
import { Clarity } from "./Clarity";
import { trackPixelEvent as trackUSPixelEvent } from "@/lib/us-soulmate-pixel";

const isUS = (path: string) => path === "/us/soulmate" || path.startsWith("/us/soulmate/");

export function MarketingBoundary() {
  const pathname = usePathname();
  const us = isUS(pathname);
  const initialUS = useRef(us).current;
  const previousPath = useRef(pathname);
  useEffect(() => {
    const changed = previousPath.current !== pathname;
    previousPath.current = pathname;
    // The base script owns the first PageView; Next navigation needs subsequent ones.
    if (us && initialUS && changed) trackUSPixelEvent("PageView");
  }, [pathname, us, initialUS]);
  useEffect(() => {
    // A new document clears vendor globals when crossing between funnels.
    // Navigation within either existing flow keeps its original SPA behavior.
    const onClick = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") as HTMLAnchorElement | null : null;
      if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin === window.location.origin && isUS(url.pathname) !== initialUS) {
        event.preventDefault();
        event.stopPropagation();
        window.location.assign(url.href);
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [initialUS]);
  useEffect(() => { if (us !== initialUS) window.location.replace(window.location.href); }, [us, initialUS]);
  if (pathname === "/page-previews" || pathname.startsWith("/page-previews/")) return null;
  if (us !== initialUS) return null;
  if (!us) return <><MetaPixel /><GoogleAnalytics /><Clarity /></>;
  const pixel = process.env.NEXT_PUBLIC_US_SOULMATE_META_PIXEL_ID;
  const ga = process.env.NEXT_PUBLIC_US_SOULMATE_GA_ID;
  const clarity = process.env.NEXT_PUBLIC_US_SOULMATE_CLARITY_ID;
  return <>
    {pixel && /^\d+$/.test(pixel) && <Script id="us-soulmate-pixel" strategy="afterInteractive">{`
      !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;
      s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
      fbq('set', 'autoConfig', false, '${pixel}');
      fbq('init', '${pixel}');fbq('trackSingle', '${pixel}', 'PageView');`}</Script>}
    {ga && /^G-[A-Z0-9]+$/.test(ga) && <><Script src={`https://www.googletagmanager.com/gtag/js?id=${ga}`} strategy="afterInteractive" /><Script id="us-soulmate-ga" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${ga}',{cookie_prefix:'us_soulmate'});`}</Script></>}
    {clarity && /^[a-z0-9]+$/i.test(clarity) && <Script id="us-soulmate-clarity" strategy="afterInteractive">{`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src='https://www.clarity.ms/tag/'+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,'clarity','script','${clarity}');`}</Script>}
  </>;
}
