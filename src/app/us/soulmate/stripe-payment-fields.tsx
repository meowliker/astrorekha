"use client";
import { useEffect, useRef, useState } from "react";
import { soulmateTrackingContext } from "@/lib/us-soulmate-tracking";
import { CHECKOUT_ATTEMPT_KEY, CHECKOUT_RECOVERY_KEY } from "./checkout-state";
import { checkoutSession } from "./session-save";
import { checkedPaymentTotal, checkedReceiptPath, confirmInlinePayment, loadUSStripe, type CheckoutActions, type PaymentElement, type StripeSessionView } from "./stripe-inline-client";
import styles from "./soulmate-checkout.module.css";

type PaymentAttempt = { key: string; signature: string; savedAt: number };
// Retain retries when sessionStorage is unavailable (accessed only in the effect).
let memoryAttempt: PaymentAttempt | null = null;
export type InlinePayment = { signature: string; orderId: string; canPay: boolean; confirm: () => Promise<string> };
export function StripePaymentFields({ signature, amount, enabled, onPayment }: {
  signature: string; amount: number; enabled: boolean; onPayment: (payment: InlinePayment | null) => void;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const [retry, setRetry] = useState(0);
  const [status, setStatus] = useState("Loading secure payment fields…");
  const [error, setError] = useState("");
  const [stripeTotal, setStripeTotal] = useState("");
  const publicKey = process.env.NEXT_PUBLIC_US_SOULMATE_STRIPE_PUBLISHABLE_KEY?.trim();
  useEffect(() => {
    onPayment(null);
    if (!enabled || !publicKey) return;
    let active = true, failed = false, element: PaymentElement | undefined, elementReady = false;
    let actions: CheckoutActions | undefined, receiptUrl = "", orderId = "";
    const abort = new AbortController();
    const fail = (cause: unknown) => {
      if (!active) return;
      failed = true;
      onPayment(null);
      setStatus("");
      setError(cause instanceof Error ? cause.message : "Secure payment could not load. Please try again.");
    };
    const update = (session: StripeSessionView) => {
      if (!active || failed || !actions) return;
      try {
        setStripeTotal(checkedPaymentTotal(session, amount));
        onPayment({ signature, orderId, canPay: elementReady && session.canConfirm, confirm: async () => {
          if (!active || failed || !actions || !elementReady) throw new Error("Please wait for the current payment form to load.");
          await confirmInlinePayment(actions, amount);
          return receiptUrl;
        } });
      } catch (cause) { fail(cause); }
    };
    const timer = window.setTimeout(async () => {
      try {
        setError(""); setStatus("Loading secure payment fields…"); setStripeTotal("");
        const details = JSON.parse(signature);
        let attempt = memoryAttempt;
        try { attempt = JSON.parse(sessionStorage.getItem(CHECKOUT_ATTEMPT_KEY) || "null") || memoryAttempt; } catch { /* Storage is optional. */ }
        if (!attempt || attempt.signature !== signature || attempt.savedAt < Date.now() - 24 * 3600000) {
          attempt = { key: crypto.randomUUID(), signature, savedAt: Date.now() };
        }
        memoryAttempt = attempt;
        try { sessionStorage.setItem(CHECKOUT_ATTEMPT_KEY, JSON.stringify(attempt)); } catch { /* Current request remains idempotent. */ }
        const [Stripe, response] = await Promise.all([loadUSStripe(), fetch("/api/us/soulmate/checkout", {
          method: "POST", headers: { "Content-Type": "application/json" }, signal: abort.signal,
          body: JSON.stringify({ ...details, plan: details.planId, tracking: soulmateTrackingContext(), session: checkoutSession(), checkoutKey: attempt.key }),
        })]);
        const data = await response.json();
        if (!active) return;
        if (!response.ok) throw new Error(data.error || "Unable to prepare your payment. Please try again.");
        receiptUrl = checkedReceiptPath(data.receiptUrl);
        orderId = new URL(receiptUrl, window.location.origin).searchParams.get("order")!;
        try { sessionStorage.setItem(CHECKOUT_RECOVERY_KEY, JSON.stringify({ answers: details.answers, planId: details.planId, receiptUrl, savedAt: Date.now() })); } catch { /* Receipt also uses its secure cookie. */ }
        if (data.checkStatus) { window.location.assign(receiptUrl); return; }
        if (data.amount !== amount || typeof data.clientSecret !== "string" || !data.clientSecret) throw new Error("Your payment total changed. Please reload checkout before paying.");
        const checkout = Stripe(publicKey).initCheckoutElementsSdk({ clientSecret: data.clientSecret, elementsOptions: { appearance: {
          theme: "stripe", variables: { colorPrimary: "#128a0a", colorText: "#484761", borderRadius: "3px", fontFamily: "Arial, sans-serif", fontSizeBase: "15px" },
        } } });
        const result = await checkout.loadActions();
        if (!active) return;
        if (result.type === "error") throw new Error(result.error.message);
        actions = result.actions;
        checkedPaymentTotal(actions.getSession(), amount);
        element = checkout.createPaymentElement({ layout: "tabs", fields: { billingDetails: { phone: "never" } } });
        element.on("ready", () => { if (active && actions) { elementReady = true; setStatus(""); update(actions.getSession()); } });
        element.on("loaderror", () => fail(new Error("Secure payment fields could not load. Please try again.")));
        checkout.on("change", update);
        update(actions.getSession());
        element.mount(mount.current!);
      } catch (cause) { fail(cause); }
    }, 500);
    return () => { active = false; window.clearTimeout(timer); abort.abort(); element?.destroy(); };
  }, [signature, amount, enabled, publicKey, retry, onPayment]);

  return <div className={styles.paymentFields}>
    {!publicKey ? <p role="status">Secure card payments will be available soon.</p> : !enabled ? <p role="status">Enter your email and complete your sketch preferences to load secure payment fields.</p> : <>
      {status && <p role="status">{status}</p>}
      <div ref={mount} aria-label="Secure card payment details" />
      {stripeTotal && <p className={styles.fieldHint}>Payment total: {stripeTotal}</p>}
      {error && <div role="alert"><p className={styles.error}>{error}</p><button type="button" className={styles.retryPayment} onClick={() => setRetry((value) => value + 1)}>Try again</button></div>}
    </>}
  </div>;
}
