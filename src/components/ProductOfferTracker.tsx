"use client";

import { useEffect, useRef } from "react";
import { trackMarketingEvent } from "@/lib/marketing-events-client";

/** Place inside an offer card. Count exposure only when at least half the card is visible. */
export default function ProductOfferTracker({
  type,
  id,
  name,
}: {
  type: string;
  id: string;
  name?: string;
}) {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const card = marker.current?.parentElement;
    if (!card || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          !entries.some(
            (entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5,
          )
        )
          return;
        void trackMarketingEvent({
          eventName: "product_offer_view",
          productType: type,
          productId: id,
          productName: name,
          dedupeKey: `offer:${window.location.pathname}:${type}:${id}`,
          dedupeTtlMs: 30 * 60 * 1000,
        });
        observer.disconnect();
      },
      { threshold: 0.5 },
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, [type, id, name]);
  return <span ref={marker} hidden aria-hidden="true" />;
}
