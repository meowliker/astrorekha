import {trackMarketingEvent} from './events-client';
export type CheckoutItem = {
  item_id: string;
  item_name: string;
  price: number;
  quantity: 1;
};

export type AnalyticsEvents = {
  quiz_start: { quiz_id: string };
  quiz_complete: { quiz_id: string };
  begin_checkout: { value: number; currency: "USD"; items: CheckoutItem[] };
};

declare global {
  interface Window {
    gtag?: (command: "event", event: string, params: Record<string, unknown>) => void;
  }
}

/** Client-only GA4 funnel event; safe while gtag is blocked or still loading. */
export function track<E extends keyof AnalyticsEvents>(event: E, params: AnalyticsEvents[E]): void {
  if (typeof window === "undefined") return;
  void trackMarketingEvent({eventName:event});
  if (process.env.NEXT_PUBLIC_US_MAIN_TRACKING_ENABLED !== "true" || !process.env.NEXT_PUBLIC_US_MAIN_GA_ID || !["astrorekha.com", "www.astrorekha.com"].includes(window.location.hostname)) return;
  window.gtag?.("event", event, { ...params, funnel: "us_main", send_to: process.env.NEXT_PUBLIC_US_MAIN_GA_ID });
}

export function trackCheckout(itemId: string, itemName: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) return;
  track("begin_checkout", {
    value,
    currency: "USD",
    items: [{ item_id: itemId, item_name: itemName, price: value, quantity: 1 }],
  });
}
