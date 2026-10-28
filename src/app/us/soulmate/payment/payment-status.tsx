"use client";
import { readSoulmateGaIdentity } from "@/lib/us-soulmate-ga-client";
import { SoulmateOrderConfirmation } from "./order-confirmation";
import { useEffect, useState } from "react";
import { soulmateTrackingEnabled } from "@/lib/us-soulmate-tracking";
import { trackPixelEvent } from "@/lib/us-soulmate-pixel";
import type { SoulmateLineItem } from "@/lib/us-soulmate-cart";
import { SoulmatePaymentProblem } from "./payment-problem";
import { deliveryPlans } from "../chat-data";

type PaymentState = { items?: SoulmateLineItem[]; trackingAllowed?: boolean; status: string; plan: string; amount: number; deliveryHours: number; deliveryDueAt: string | null };
export function SoulmatePaymentStatus({ orderId }: { orderId: string }) {
  const [payment, setPayment] = useState<PaymentState | null>(null);
  const [error, setError] = useState("");
  const [waiting, setWaiting] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const abort = new AbortController();
    let attempts = 0;
    setWaiting(true);
    setError("");
    setPayment(null);
    if (!/^us_sm_[a-f0-9]{20}$/.test(orderId)) { setError("Invalid order link"); setWaiting(false); return; }
    async function check() {
      try {
        const response = await fetch(`/api/us/soulmate/payment/status?order=${encodeURIComponent(orderId)}`, { cache: "no-store", signal: abort.signal });
        const result = await response.json();
        if (!active) return;
        if (!response.ok) {
          if (response.status === 403 || response.status === 404) { setError("Unable to access this order"); setWaiting(false); return; }
          throw new Error(result.error || "Unable to check payment");
        }
        setPayment(result);
        setError("");
        if (result.status === "paid" || result.status === "failed") { setWaiting(false); return; }
      } catch (cause) {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Unable to check payment");
      }
      if (++attempts < 12) timer = setTimeout(check, 10000);
      else setWaiting(false);
    }
    void check();
    return () => { active = false; abort.abort(); clearTimeout(timer); };
  }, [orderId, retry]);
  useEffect(() => {
    if (payment?.status !== "paid" || !payment.trackingAllowed || !soulmateTrackingEnabled()) return;
    const key = `ar_us_soulmate_purchase_${orderId}`;
    try { if (sessionStorage.getItem(key)) return; } catch { /* Meta also deduplicates by order ID. */ }
    const plan = deliveryPlans.find((item) => item.id === payment.plan);
    trackPixelEvent("Purchase", { value: payment.amount / 100, currency: "USD", content_ids: payment.items?.length ? payment.items.map((item) => item.id) : [`us_soulmate_${payment.plan}`], content_name: plan?.checkoutTitle || "Soulmate Sketch", content_type: "product", funnel: "us_soulmate_standalone" }, { eventId: orderId, onQueued: () => {
      try { sessionStorage.setItem(key, "1"); } catch { /* Meta also deduplicates by order ID. */ }
    } });
  }, [payment, orderId]);
  useEffect(() => {
    if (payment?.status !== "paid" || !payment.trackingAllowed || !soulmateTrackingEnabled()) return;
    let active = true;
    void readSoulmateGaIdentity().then(identity => {
      if (!active || !identity.gaClientId) return;
      return fetch("/api/us/soulmate/payment/attribution", {
        method: "POST", headers: { "Content-Type": "application/json" }, keepalive: true,
        body: JSON.stringify({ orderId, ...identity }),
      });
    }).catch(() => {}); // Analytics must not change the buyer's confirmation screen.
    return () => { active = false; };
  }, [payment?.status, payment?.trackingAllowed, orderId]);
  const paid = payment?.status === "paid";
  const failed = payment?.status === "failed";
  if (paid) return <SoulmateOrderConfirmation orderId={orderId} />;
  return <SoulmatePaymentProblem
    kind={failed ? "failed" : waiting ? "pending" : "unverified"}
    orderId={/^us_sm_[a-f0-9]{20}$/.test(orderId) ? orderId : undefined}
    checking={waiting}
    onRetry={!failed && orderId && error !== "Unable to access this order" && error !== "Invalid order link" ? () => setRetry((value) => value + 1) : undefined}
  />;
}
