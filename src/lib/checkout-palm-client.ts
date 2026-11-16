"use client";
import { readSessionHint } from "@/lib/session-storage";
import { validCheckoutPalm } from "@/lib/report-input-snapshot";
/** Compact the existing scan before the gateway handoff; never send it to analytics. */
export async function checkoutPalm(key: string): Promise<string | undefined> {
  const raw = readSessionHint(key);
  if(!raw || !raw.startsWith("data:image/")) return undefined;
  if(validCheckoutPalm(raw)) return raw;
  return new Promise((resolve,reject) => {
    const fail=()=>reject(new Error("We couldn’t prepare your saved palm photo. Please retry before paying."));
    const image = new Image();
    const timer = setTimeout(fail, 4000);
    image.onerror = () => { clearTimeout(timer); fail(); };
    image.onload = () => {
      clearTimeout(timer);
      try {
        const canvas=document.createElement("canvas"), scale=Math.min(1,1024/Math.max(image.width,image.height));
        canvas.width=Math.max(1,Math.round(image.width*scale)); canvas.height=Math.max(1,Math.round(image.height*scale));
        const context=canvas.getContext("2d");
        if(!context) return fail();
        context.drawImage(image,0,0,canvas.width,canvas.height);
        const compact=canvas.toDataURL("image/jpeg",0.8);
        if(validCheckoutPalm(compact)) resolve(compact); else fail();
      }catch { fail(); }
    };
    image.src=raw;
  });
}
