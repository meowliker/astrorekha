"use client";

import { trackPixelEvent, trackCustomEvent } from "./us-soulmate-pixel";
import { getSoulmateAttributionPayload } from "./us-soulmate-attribution-client";
import { US_SOULMATE_FUNNEL } from "./us-soulmate-orders";
import type { PaymentAttributionPayload } from "./attribution";
import type { DeliveryId } from "@/app/us/soulmate/chat-data";

const SESSION_KEY = "ar_us_soulmate_analytics_v1";
const seen = new Set<string>();
let memory: { id: string; at: number } | null = null;

// Preview and local development must never create advertising conversions.
export function soulmateTrackingEnabled() {
  return typeof window !== "undefined" && process.env.NODE_ENV === "production" &&
    ["astrorekha.com", "www.astrorekha.com"].includes(window.location.hostname);
}

export function soulmateTrackingContext() {
  if (typeof window === "undefined") return null;
  const now = Date.now();
  try { memory = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null") || memory; } catch { /* Memory fallback. */ }
  if (!memory || !/^[a-f0-9-]{36}$/i.test(memory.id || "") || !Number.isFinite(memory.at) || now < memory.at || now - memory.at > 30 * 60 * 1000) memory = { id: crypto.randomUUID(), at: now };
  memory.at = now;
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(memory)); } catch { /* Memory fallback. */ }
  let attribution: PaymentAttributionPayload = {};
  try { attribution = getSoulmateAttributionPayload(); } catch { /* Malformed or blocked cookies must not block checkout. */ }
  return { sessionId: memory.id, attribution };
}

type FunnelEvent = "landing_view" | "chat_start" | "chat_complete" | "offer_view" | "add_to_cart" | "checkout_view" | "stripe_redirect" | "payment_submit" | "engaged" | "checkout_error";
export function trackSoulmate(event: FunnelEvent, options: { plan?: DeliveryId; value?: number; once?: string; itemIds?: string[] } = {}) {
  try { emitSoulmate(event, options); } catch { /* Tracking must never interrupt a reading or payment. */ }
}

function emitSoulmate(event: FunnelEvent, options: { plan?: DeliveryId; value?: number; once?: string; itemIds?: string[] }) {
  if (!soulmateTrackingEnabled()) return;
  const context = soulmateTrackingContext();
  if (!context) return;
  const key = `${context.sessionId}:${event}:${options.plan || ""}:${options.once || ""}`;
  if (options.once && seen.has(key)) return;
  if (options.once) seen.add(key);
  const params = { funnel: US_SOULMATE_FUNNEL, ...(options.plan ? { plan: options.plan, item_id: `us_soulmate_${options.plan}` } : {}), ...(typeof options.value === "number" && Number.isFinite(options.value) ? { value: options.value, currency: "USD" } : {}) };
  // Queue even if the global GA script has not finished loading.
  const target = window as Window & { dataLayer?: unknown[] };
  const gaId = process.env.NEXT_PUBLIC_US_SOULMATE_GA_ID;
  if (gaId) {
    if (!target.gtag) target.gtag = (...args) => { (target.dataLayer ||= []).push(args); };
    target.gtag("event", event === "checkout_view" ? "begin_checkout" : event === "add_to_cart" ? "add_to_cart" : `us_soulmate_${event}`, {
      ...params, send_to: gaId,
      ...(["checkout_view", "add_to_cart"].includes(event) ? { items: [{ item_id: `us_soulmate_${options.plan}`, item_name: options.plan === "express" ? "Complete Soulmate Vision" : "Soulmate Sketch", price: options.value, quantity: 1 }] } : {}),
    });
  }
  const commerce = { ...params, content_ids: options.itemIds || [`us_soulmate_${options.plan}`], content_type: "product", content_name: options.plan === "express" ? "Complete Soulmate Vision" : "Soulmate Sketch", num_items: options.itemIds?.length || 1 };
  if (event === "landing_view") trackPixelEvent("ViewContent", { ...params, content_name: "Soulmate Sketch", content_category: US_SOULMATE_FUNNEL });
  else if (event === "checkout_view") trackPixelEvent("InitiateCheckout", commerce);
  else if (event === "add_to_cart") trackPixelEvent("AddToCart", commerce);
  else if (event === "payment_submit") {
    // Emitted only after Stripe validates and creates a payment method, never for an empty form.
    trackPixelEvent("AddPaymentInfo", commerce);
    trackCustomEvent("USSourcePaymentSubmit", params);
  }
  else if (event === "stripe_redirect") trackCustomEvent("USSourceStripeRedirect", params);
  else if (event === "chat_start" || event === "chat_complete") trackCustomEvent(event === "chat_start" ? "SoulmateChatStart" : "SoulmateChatComplete", params);
  void fetch("/api/us/soulmate/events", {
    method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
    body: JSON.stringify({ event, sessionId: context.sessionId, plan: options.plan, url: window.location.href, attribution: context.attribution }),
  }).catch(() => {});
}
