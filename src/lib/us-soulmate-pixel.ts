"use client";

type PixelOptions = { eventId?: string; onQueued?: () => void };
const pending = new Set<string>();

/** Keep early events until the US base script has installed fbq's queue. */
function emit(command: "trackSingle" | "trackSingleCustom", event: string, parameters: Record<string, unknown>, options: PixelOptions = {}) {
  const id = process.env.NEXT_PUBLIC_US_SOULMATE_META_PIXEL_ID;
  if (!id || !/^\d+$/.test(id) || typeof window === "undefined") return;
  const eventId = options.eventId || `us_${event}_${crypto.randomUUID()}`;
  const key = `${id}:${event}:${eventId}`;
  if (pending.has(key)) return;
  pending.add(key);
  const send = (attempt: number) => {
    // A delayed US event must never fire after leaving this funnel.
    if (typeof window === "undefined" || !/^\/us\/soulmate(?:\/|$)/.test(window.location.pathname)) { pending.delete(key); return; }
    if (window.fbq) {
      try {
        window.fbq(command, id, event, parameters, { eventID: eventId });
        options.onQueued?.();
      } catch { /* Optional analytics must never interrupt checkout. */ }
      finally { pending.delete(key); }
    } else if (attempt < 20) {
      setTimeout(() => send(attempt + 1), 500);
    } else {
      pending.delete(key);
    }
  };
  send(0);
}
export function trackPixelEvent(event: string, parameters: Record<string, unknown> = {}, options?: PixelOptions) {
  emit("trackSingle", event, parameters, options);
}
export function trackCustomEvent(event: string, parameters: Record<string, unknown> = {}) {
  emit("trackSingleCustom", event, parameters);
}
