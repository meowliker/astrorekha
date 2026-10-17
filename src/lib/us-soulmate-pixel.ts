"use client";
export function trackPixelEvent(event: string, parameters: Record<string, unknown> = {}, options?: { eventId?: string }) {
  const id = process.env.NEXT_PUBLIC_US_SOULMATE_META_PIXEL_ID;
  if (!id || typeof window === "undefined") return;
  window.fbq?.("trackSingle", id, event, parameters, options?.eventId ? { eventID: options.eventId } : {});
}
export function trackCustomEvent(event: string, parameters: Record<string, unknown> = {}) {
  const id = process.env.NEXT_PUBLIC_US_SOULMATE_META_PIXEL_ID;
  if (!id || typeof window === "undefined") return;
  window.fbq?.("trackSingleCustom", id, event, parameters);
}
