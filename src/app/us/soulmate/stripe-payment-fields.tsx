"use client";
import { useEffect, useRef, useState } from "react";
import { soulmateTrackingContext, trackSoulmate } from "@/lib/us-soulmate-tracking";
import { CHECKOUT_ATTEMPT_KEY, CHECKOUT_RECOVERY_KEY } from "./checkout-state";
import { checkoutSession } from "./session-save";
import { checkedPaymentTotal, checkedReceiptPath, collectDeferredPayment, confirmInlinePayment, loadUSStripe, type CheckoutActions, type PaymentElement } from "./stripe-inline-client";
import styles from "./soulmate-checkout.module.css";

type PaymentAttempt = { key: string; signature: string; savedAt: number };
let memoryAttempt: PaymentAttempt | null = null;
export type InlinePayment = { signature: string; canPay: boolean; confirm: (email: string) => Promise<string> };
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
    let active = true, failed = false, element: PaymentElement | undefined, elementReady = false, complete = false, confirming = false;
    const abort = new AbortController();
    let fieldTimeout: number | undefined;
    let prepared: { orderId: string; actions: CheckoutActions } | undefined;
    const fail = (cause: unknown) => {
      if (!active) return;
      failed = true; window.clearTimeout(fieldTimeout); onPayment(null); setStatus("");
      setError(cause instanceof Error ? cause.message : "Secure payment could not load. Please try again.");
    };
    async function initialize() {
      try {
        setError(""); setStatus("Loading secure payment fields…"); setStripeTotal("");
        const Stripe = await loadUSStripe();
        if (!active) return;
        const stripe = Stripe(publicKey!);
        const elements = stripe.elements({ mode: "payment", amount, currency: "usd", allowedPaymentMethodTypes: ["card"], paymentMethodCreation: "manual", appearance: {
          theme: "stripe", variables: { colorPrimary: "#128a0a", colorText: "#484761", borderRadius: "3px", fontFamily: "Arial, sans-serif", fontSizeBase: "15px" },
        } });
        const publish = () => {
          if (!active || failed) return;
          onPayment({ signature, canPay: elementReady && complete, confirm: async (email) => {
            if (!active || failed || !elementReady || confirming) throw new Error("Please wait for the current payment form to load.");
            confirming = true;
            try {
              const paymentMethod = await collectDeferredPayment(stripe, elements, email);
              if (!active) throw new Error("Checkout changed. Please try again.");
              const details = JSON.parse(signature);
              const attemptSignature = JSON.stringify({ ...details, email });
              let attempt = memoryAttempt;
              try { attempt = JSON.parse(sessionStorage.getItem(CHECKOUT_ATTEMPT_KEY) || "null") || memoryAttempt; } catch { /* Storage is optional. */ }
              if (!attempt || attempt.signature !== attemptSignature || attempt.savedAt < Date.now() - 24 * 3600000) {
                attempt = { key: crypto.randomUUID(), signature: attemptSignature, savedAt: Date.now() };
              }
              memoryAttempt = attempt;
              try { sessionStorage.setItem(CHECKOUT_ATTEMPT_KEY, JSON.stringify(attempt)); } catch { /* Keep retries idempotent in memory. */ }
              const response = await fetch("/api/us/soulmate/checkout", {
                method: "POST", headers: { "Content-Type": "application/json" }, signal: abort.signal,
                body: JSON.stringify({ ...details, email, plan: details.planId, tracking: soulmateTrackingContext(), session: checkoutSession(), checkoutKey: attempt.key }),
              });
              const data = await response.json();
              if (!active) throw new Error("Checkout changed. Please try again.");
              if (!response.ok) throw new Error(data.error || "Unable to prepare your payment. Please try again.");
              const receiptUrl = checkedReceiptPath(data.receiptUrl);
              const orderId = new URL(receiptUrl, window.location.origin).searchParams.get("order")!;
              try { sessionStorage.setItem(CHECKOUT_RECOVERY_KEY, JSON.stringify({ answers: details.answers, planId: details.planId, receiptUrl, savedAt: Date.now() })); } catch { /* Receipt also uses its secure cookie. */ }
              if (data.checkStatus) return receiptUrl;
              if (data.amount !== amount || typeof data.clientSecret !== "string" || !data.clientSecret) throw new Error("Your payment total changed. Please reload checkout before paying.");
              if (prepared?.orderId !== orderId) {
                const checkout = stripe.initCheckoutElementsSdk({ clientSecret: data.clientSecret, elementsOptions: { appearance: { theme: "stripe", variables: {} } } });
                const result = await checkout.loadActions();
                if (!active) throw new Error("Checkout changed. Please try again.");
                if (result.type === "error") throw new Error(result.error.message);
                prepared = { orderId, actions: result.actions };
              }
              setStripeTotal(checkedPaymentTotal(prepared.actions.getSession(), amount));
              trackSoulmate("payment_submit", { plan: details.planId, value: amount / 100, once: orderId });
              await confirmInlinePayment(prepared.actions, amount, { paymentMethod, email });
              return receiptUrl;
            } finally { confirming = false; }
          } });
        };
        element = elements.create("payment", { layout: "tabs", wallets: { link: "never" }, fields: { billingDetails: { email: "never", phone: "never" } } });
        element.on("ready", () => { if (active) { elementReady = true; window.clearTimeout(fieldTimeout); setStatus(""); publish(); } });
        element.on("change", (event) => { complete = event.complete; publish(); });
        element.on("loaderror", () => fail(new Error("Secure payment fields could not load. Please try again.")));
        fieldTimeout = window.setTimeout(() => fail(new Error("Secure payment fields are taking too long to load. Please try again.")), 30000);
        element.mount(mount.current!);
      } catch (cause) { fail(cause); }
    }
    void initialize();
    return () => { active = false; window.clearTimeout(fieldTimeout); abort.abort(); element?.destroy(); };
  }, [signature, amount, enabled, publicKey, retry, onPayment]);

  return <div className={styles.paymentFields}>
    {!publicKey ? <p role="status">Secure card payments will be available soon.</p> : !enabled ? <p role="status">Loading checkout…</p> : <>
      {status && <p role="status">{status}</p>}
      <div ref={mount} aria-label="Secure card payment details" />
      {stripeTotal && <p className={styles.fieldHint}>Payment total: {stripeTotal}</p>}
      {error && <div role="alert"><p className={styles.error}>{error}</p><button type="button" className={styles.retryPayment} onClick={() => setRetry((value) => value + 1)}>Try again</button></div>}
    </>}
  </div>;
}
