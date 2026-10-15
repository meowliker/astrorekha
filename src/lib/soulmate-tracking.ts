"use client";

import { trackPixelEvent, trackCustomEvent } from "./pixel-events";
import { getPaymentAttributionPayload } from "./attribution-client";
import { SOULMATE_FUNNEL } from "./soulmate-orders";
import type { PaymentAttributionPayload } from "./attribution";
import type { DeliveryId } from "@/app/soulmate/chat-data";

const SESSION_KEY = "ar_soulmate_analytics_v1";
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
  try { attribution = getPaymentAttributionPayload(); } catch { /* Malformed or blocked cookies must not block checkout. */ }
  return { sessionId: memory.id, attribution };
}

type FunnelEvent = "landing_view" | "chat_start" | "chat_complete" | "offer_view" | "checkout_view" | "payu_redirect" | "engaged" | "checkout_error";
export function trackSoulmate(event: FunnelEvent, options: { plan?: DeliveryId; value?: number; once?: string } = {}) {
  try { emitSoulmate(event, options); } catch { /* Tracking must never interrupt a reading or payment. */ }
}

function emitSoulmate(event: FunnelEvent, options: { plan?: DeliveryId; value?: number; once?: string }) {
  if (!soulmateTrackingEnabled()) return;
  const context = soulmateTrackingContext();
  if (!context) return;
  const key = `${context.sessionId}:${event}:${options.plan || ""}:${options.once || ""}`;
  if (options.once && seen.has(key)) return;
  if (options.once) seen.add(key);
  const params = { funnel: SOULMATE_FUNNEL, ...(options.plan ? { plan: options.plan, item_id: `soulmate_${options.plan}` } : {}), ...(options.value ? { value: options.value, currency: "INR" } : {}) };
  // Queue even if the global GA script has not finished loading.
  const target = window as Window & { dataLayer?: unknown[] };
  if (!target.gtag) target.gtag = (...args) => { (target.dataLayer ||= []).push(args); };
  target.gtag("event", event === "checkout_view" ? "begin_checkout" : `soulmate_${event}`, { ...params, ...(process.env.NEXT_PUBLIC_GA_ID ? { send_to: process.env.NEXT_PUBLIC_GA_ID } : {}), ...(event === "checkout_view" ? { items: [{ item_id: `soulmate_${options.plan}`, item_name: options.plan === "express" ? "Complete Soulmate Vision" : "Soulmate Sketch", price: options.value, quantity: 1 }] } : {}) });
  if (event === "landing_view") trackPixelEvent("ViewContent", { ...params, content_name: "Soulmate Sketch", content_category: SOULMATE_FUNNEL });
  else if (event === "checkout_view") trackPixelEvent("InitiateCheckout", { ...params, content_ids: [`soulmate_${options.plan}`], num_items: 1 });
  else if (event === "payu_redirect") trackCustomEvent("SoulmatePayURedirect", params);
  else if (event === "chat_start" || event === "chat_complete") trackCustomEvent(event === "chat_start" ? "SoulmateChatStart" : "SoulmateChatComplete", params);
  void fetch("/api/soulmate/events", {
    method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
    body: JSON.stringify({ event, sessionId: context.sessionId, plan: options.plan, attribution: context.attribution }),
  }).catch(() => {});
}
