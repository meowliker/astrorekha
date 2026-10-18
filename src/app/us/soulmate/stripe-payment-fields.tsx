"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { soulmateTrackingContext, trackSoulmate } from "@/lib/us-soulmate-tracking";
import { CHECKOUT_ATTEMPT_KEY, CHECKOUT_RECOVERY_KEY } from "./checkout-state";
import { checkoutSession } from "./session-save";
import { checkedPaymentTotal, checkedReceiptPath, collectDeferredPayment, confirmInlinePayment, loadUSStripe, type CheckoutActions, type PaymentElement } from "./stripe-inline-client";
import styles from "./soulmate-checkout.module.css";

const useCommittedEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

type PaymentAttempt = { key: string; signature: string; savedAt: number };
let memoryAttempt: PaymentAttempt | null = null;
export type PromotionQuote = { subtotal: number; discount: number; tax: number; total: number; code: string | null };
/** Both applying a code and paying reuse the exact same idempotent server checkout. */
export async function prepareCheckout(signature: string, email: string, signal?: AbortSignal) {
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
    method: "POST", headers: { "Content-Type": "application/json" }, signal,
    body: JSON.stringify({ ...details, email, plan: details.planId, tracking: soulmateTrackingContext(), session: checkoutSession(), checkoutKey: attempt.key }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Unable to prepare your payment. Please try again.");
  const receiptUrl = checkedReceiptPath(data.receiptUrl);
  const orderId = new URL(receiptUrl, window.location.origin).searchParams.get("order")!;
  try { sessionStorage.setItem(CHECKOUT_RECOVERY_KEY, JSON.stringify({ answers: details.answers, planId: details.planId, receiptUrl, savedAt: Date.now() })); } catch { /* Receipt also uses its secure cookie. */ }
  return { data, receiptUrl, orderId, details };
}

export type InlinePayment = { signature: string; canPay: boolean; confirm: (email: string) => Promise<string> };
export function StripePaymentFields({ signature, amount, enabled, onPayment }: {
  signature: string; amount: number; enabled: boolean; onPayment: (payment: InlinePayment | null) => void;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const cart = useRef({ signature, amount });
  const refresh = useRef<(() => void) | null>(null);
  // Commit cart changes before payment handlers can run, without remounting Stripe.
  useCommittedEffect(() => {
    cart.current = { signature, amount };
    refresh.current?.();
  }, [signature, amount]);
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
        let appliedAmount = cart.current.amount, updating = false;
        const elements = stripe.elements({ mode: "payment", amount: appliedAmount, currency: "usd", allowedPaymentMethodTypes: ["card"], paymentMethodCreation: "manual", appearance: {
          theme: "stripe", variables: { colorPrimary: "#128a0a", colorText: "#484761", borderRadius: "3px", fontFamily: "Arial, sans-serif", fontSizeBase: "15px" },
        } });
        const publish = () => {
          if (!active || failed) return;
          const snapshot = cart.current;
          const { signature, amount } = snapshot;
          const checkCurrent = () => {
            if (!active || failed || cart.current !== snapshot || updating) throw new Error("Checkout changed. Please try again.");
          };
          onPayment({ signature, canPay: elementReady && complete && !updating, confirm: async (email) => {
            checkCurrent();
            if (!elementReady || !complete || confirming) throw new Error("Please wait for the current payment form to load.");
            confirming = true;
            try {
              const paymentMethod = await collectDeferredPayment(stripe, elements, email);
              checkCurrent();
              const { data, receiptUrl, orderId, details } = await prepareCheckout(signature, email, abort.signal);
              checkCurrent();
              if (data.checkStatus) return receiptUrl;
              if (data.amount !== amount || typeof data.clientSecret !== "string" || !data.clientSecret) throw new Error("Your payment total changed. Please reload checkout before paying.");
              if (prepared?.orderId !== orderId) {
                const checkout = stripe.initCheckoutElementsSdk({ clientSecret: data.clientSecret, elementsOptions: { appearance: { theme: "stripe", variables: {} } } });
                const result = await checkout.loadActions();
                checkCurrent();
                if (result.type === "error") throw new Error(result.error.message);
                prepared = { orderId, actions: result.actions };
              }
              setStripeTotal(checkedPaymentTotal(prepared.actions.getSession(), amount));
              trackSoulmate("payment_submit", { plan: details.planId, value: amount / 100, once: orderId });
              await confirmInlinePayment(prepared.actions, amount, { paymentMethod });
              return receiptUrl;
            } finally { confirming = false; }
          } });
        };
        // Serialize amount updates; rapid Apply/Remove must settle on the latest cart.
        // The existing Stripe iframe retains the card details throughout these updates.
        const refreshCart = async () => {
          if (!active || failed || updating) return;
          updating = true;
          setStripeTotal("");
          publish();
          try {
            while (active && appliedAmount !== cart.current.amount) {
              const nextAmount = cart.current.amount;
              await elements.update({ amount: nextAmount });
              appliedAmount = nextAmount;
            }
          } catch (cause) { fail(cause); }
          finally { updating = false; publish(); }
        };
        refresh.current = () => { void refreshCart(); };
        element = elements.create("payment", { layout: "tabs", wallets: { link: "never" }, fields: { billingDetails: { email: "never", phone: "never" } } });
        element.on("ready", () => { if (active) { elementReady = true; window.clearTimeout(fieldTimeout); setStatus(""); publish(); } });
        element.on("change", (event) => { complete = event.complete; publish(); });
        element.on("loaderror", () => fail(new Error("Secure payment fields could not load. Please try again.")));
        fieldTimeout = window.setTimeout(() => {
          if (!active || elementReady) return;
          // Retry one stalled initial iframe automatically; no card data exists before ready.
          if (retry === 0) setRetry(1);
          else fail(new Error("Secure payment fields are taking too long to load. Please try again."));
        }, retry === 0 ? 10000 : 30000);
        element.mount(mount.current!);
      } catch (cause) { fail(cause); }
    }
    void initialize();
    return () => { active = false; refresh.current = null; window.clearTimeout(fieldTimeout); abort.abort(); element?.destroy(); };
  }, [enabled, publicKey, retry, onPayment]);

  return <div className={styles.paymentFields}>
    {!publicKey ? <p role="status">Secure card payments will be available soon.</p> : !enabled ? <p role="status">Loading checkout…</p> : <>
      {status && <p role="status">{status}</p>}
      <div ref={mount} aria-label="Secure card payment details" />
      {stripeTotal && <p className={styles.fieldHint}>Payment total: {stripeTotal}</p>}
      {error && <div role="alert"><p className={styles.error}>{error}</p><button type="button" className={styles.retryPayment} onClick={() => setRetry((value) => value + 1)}>Try again</button></div>}
    </>}
  </div>;
}
