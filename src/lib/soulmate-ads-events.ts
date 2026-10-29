"use client";

import { soulmateTrackingEnabled } from "./soulmate-tracking";
import { SOULMATE_FUNNEL } from "./soulmate-orders";

export type SoulmateAdsPurchase = {
  transactionId: string;
  amountPaise: number;
  currency: "INR";
  email: string;
};

const purchases = new Set<string>();
const leads = new Set<string>();
const normalizedEmail = (value: string) => value.trim().toLowerCase();
const validEmail = (value: string) => value.length <= 254 && /^[^\s@|]+@[^\s@|]+\.[^\s@|]+$/.test(value);

// These are GTM custom events only. Existing GA4/Meta purchase owners stay intact.
// The agency must map user_email only to Google Ads user-provided data, never GA4 event parameters.
function pushEvent(event: Record<string, unknown>) {
  if (!soulmateTrackingEnabled() || !/^\/soulmate(?:\/|$)/.test(window.location.pathname)) return false;
  const target = window as Window & { dataLayer?: unknown[] };
  const layer = target.dataLayer ||= [];
  layer.push({ cta_location: null, transaction_id: null, value: null, currency: null, user_email: null,
    ...event, funnel: SOULMATE_FUNNEL });
  // Clear the GTM data model after this event so later unrelated tags cannot reuse the email.
  layer.push({ user_email: null });
  return true;
}

export function trackSoulmateCta(location: "hero" | "bottom") {
  try { pushEvent({ event: "cta_click", cta_location: location }); } catch { /* Analytics cannot block the chat. */ }
}

/** Called on a valid checkout submission; the current chat does not collect email. */
export function trackSoulmateEmail(email: string) {
  try {
    const normalized = normalizedEmail(email);
    if (!validEmail(normalized) || leads.has(normalized)) return;
    if (pushEvent({ event: "email_submitted", user_email: normalized })) leads.add(normalized);
  } catch { /* Analytics cannot block payment. */ }
}

/** Input comes only from the receipt-authorized status API after a live payment is confirmed. */
export function trackSoulmateAdsPurchase(order: SoulmateAdsPurchase) {
  try {
    if (!/^sm_[a-f0-9]{20}$/.test(order.transactionId) || !Number.isSafeInteger(order.amountPaise) || order.amountPaise <= 0 || order.currency !== "INR") return;
    const email = normalizedEmail(order.email);
    if (!validEmail(email) || purchases.has(order.transactionId)) return;
    const key = `ar_soulmate_ads_purchase_v1:${order.transactionId}`;
    try { if (sessionStorage.getItem(key)) return; } catch { /* In-memory and Ads transaction ID dedupe remain. */ }
    if (!pushEvent({ event: "purchase_complete", transaction_id: order.transactionId,
      value: order.amountPaise / 100, currency: order.currency, user_email: email })) return;
    purchases.add(order.transactionId);
    try { sessionStorage.setItem(key, "1"); } catch { /* In-memory and Ads transaction ID dedupe remain. */ }
  } catch { /* Analytics cannot block the confirmation screen. */ }
}
