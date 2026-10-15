"use client";
import { trackSoulmate, soulmateTrackingContext } from "@/lib/soulmate-tracking";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CreditCard, Download, Landmark, LockKeyhole, Mail, ShieldCheck, Smartphone, HandCoins, Wallet } from "lucide-react";
import { checkoutSession } from "./session-save";
import { Answers, DeliveryId, deliveryPlans, formatRupees, GST_RATE, priceWithGst, steps } from "./chat-data";
import { CHECKOUT_ATTEMPT_KEY, CHECKOUT_RECOVERY_KEY, readCheckoutDetails, saveCheckoutDetails } from "./checkout-state";
import { SoulmateImage } from "./soulmate-image";
import { CheckoutExtras, CheckoutReviews, CheckoutStory } from "./checkout-extras";
import { addOnsForPlan, sanitizeAddOnIds, checkoutTotals, type AddOnId } from "./checkout-addons";
import styles from "./soulmate-checkout.module.css";

// Keep existing receipt/retry consumers compatible.
export { CHECKOUT_ATTEMPT_KEY, CHECKOUT_RECOVERY_KEY } from "./checkout-state";
const paymentMethods = [
  { id: "upi", name: "UPI", detail: "Pay with your preferred UPI app", icon: Smartphone },
  { id: "cards", name: "Credit / debit card", detail: "Visa, Mastercard, RuPay and more", icon: CreditCard },
  { id: "netbanking", name: "Net banking", detail: "Pay securely through your bank", icon: Landmark },
  { id: "wallets", name: "Wallets", detail: "Choose from available wallets", icon: Wallet },
] as const;

export function SoulmateCheckout({ planId }: { planId: DeliveryId }) {
  const submitting = useRef(false);
  const attempt = useRef({ key: "", signature: "" });
  const [answers, setAnswers] = useState<Answers>({});
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [addOns, setAddOns] = useState<AddOnId[]>([]);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const plan = deliveryPlans.find((item) => item.id === planId)!;
  const price = priceWithGst(plan.price);
  const catalog = addOnsForPlan(planId);
  const selectedAddOns = sanitizeAddOnIds(addOns, planId);
  const totals = checkoutTotals(plan.price, selectedAddOns, catalog);
  const hasAnswers = steps.every((step) => answers[step]);

  useEffect(() => {
    const saved = readCheckoutDetails();
    if (saved) {
      setAnswers(saved.answers);
      setEmail(saved.email);
      setPhone(saved.phone);
      setAddOns(sanitizeAddOnIds(saved.addOns, planId));
    }
    setReady(true);
  }, [planId]);

  useEffect(() => {
    if (ready && hasAnswers) saveCheckoutDetails({ answers, planId, email, phone, addOns: sanitizeAddOnIds(addOns, planId) });
  }, [ready, hasAnswers, answers, planId, email, phone, addOns]);
  useEffect(() => {
    if (ready && hasAnswers) trackSoulmate("checkout_view", { plan: planId, value: price.total, once: "checkout" });
  }, [ready, hasAnswers, planId, price.total]);
  async function checkout(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || !hasAnswers || !totals) return;
    submitting.current = true;
    setLoading(true);
    setError("");
    try {
      const signature = JSON.stringify({ email, phone, planId, answers, addOns: selectedAddOns });
      try {
        const saved = JSON.parse(sessionStorage.getItem(CHECKOUT_ATTEMPT_KEY) || "null");
        if (saved?.signature === signature && saved.savedAt > Date.now() - 24 * 3600000) attempt.current = saved;
      } catch { /* Fall back to the in-memory attempt. */ }
      if (attempt.current.signature !== signature) attempt.current = { signature, key: crypto.randomUUID() };
      try { sessionStorage.setItem(CHECKOUT_ATTEMPT_KEY, JSON.stringify({ ...attempt.current, savedAt: Date.now() })); } catch { /* Double-click protection still applies. */ }
      const response = await fetch("/api/soulmate/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tracking: soulmateTrackingContext(), email, phone, answers, session: checkoutSession(), addOns: selectedAddOns, plan: planId, checkoutKey: attempt.current.key }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to start payment");
      try { sessionStorage.setItem(CHECKOUT_RECOVERY_KEY, JSON.stringify({ answers, planId, receiptUrl: data.receiptUrl, savedAt: Date.now() })); } catch { /* Payment works without browser storage. */ }
      if (data.checkStatus) { window.location.assign(data.receiptUrl); return; }
      if (!["https://secure.payu.in/_payment", "https://test.payu.in/_payment"].includes(data.action)) throw new Error("Invalid payment destination");
      const form = document.createElement("form");
      form.method = "POST";
      form.action = data.action;
      for (const [name, value] of Object.entries(data.fields)) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = String(value);
        form.appendChild(input);
      }
      document.body.appendChild(form);
      trackSoulmate("payu_redirect", { plan: planId, value: totals.total, once: data.orderId });
      form.submit();
      form.remove();
    } catch (cause) {
      trackSoulmate("checkout_error", { plan: planId });
      setError(cause instanceof Error ? cause.message : "Unable to start payment");
      submitting.current = false;
      setLoading(false);
    }
  }

  return <main className={styles.page}>
    <div className={styles.shell}>
      <nav className={styles.navigation} aria-label="Checkout navigation">
        <Link href="/soulmate?checkout=back" aria-disabled={loading} onClick={(event) => { if (loading) event.preventDefault(); }}><ArrowLeft size={15} /> Back to your sketch</Link>
        <span><LockKeyhole size={13} /> Secure checkout</span>
      </nav>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.brand}>Astro Rekha <span>· Soulmate sketches</span></p>
          <h1>I will draw your soulmate</h1>
          <p className={styles.headline}>You’re seconds away from revealing<br className={styles.desktopBreak} /> <span>your soulmate’s face</span></p>
        </div>
        <div className={styles.artist}>
          <SoulmateImage src="/soulmate/astrorekha-artist.png" width={230} height={250} alt="Astro Rekha, soulmate sketch artist" priority />
          <div><strong>Astro Rekha</strong><span>Your soulmate sketch artist</span></div>
        </div>
      </header>
      <div className={styles.assurances}>
        <span><ShieldCheck aria-hidden="true" /> Secure order</span>
        <span><Mail aria-hidden="true" /> Email delivery</span>
        <span><HandCoins aria-hidden="true" /> Best Price Guaranteed</span>
      </div>
      <div className={styles.secureBanner}><LockKeyhole size={16} aria-hidden="true" /> Secure Checkout</div>

      <form className={styles.columns} onSubmit={checkout} aria-busy={loading}>
        <div className={styles.leftColumn}>
          <section className={styles.panel} aria-labelledby="customer-title">
            <div className={styles.panelHeading}><h2 id="customer-title">Customer Information</h2></div>
            <div className={styles.customerFields}>
              <label htmlFor="sketch-email">Email <span aria-hidden="true">*</span>
                <input id="sketch-email" name="email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} disabled={loading} placeholder="you@example.com" aria-describedby="email-help" />
              </label>
              <p id="email-help" className={styles.fieldHint}>Your sketch and order confirmation will be sent here.</p>
              <label htmlFor="sketch-phone">Phone number <span aria-hidden="true">*</span>
                <span className={styles.phoneField}>
                  <span id="sketch-country-code" className={styles.countryCode}>+91</span>
                  <input id="sketch-phone" name="phone" type="tel" autoComplete="tel-national" inputMode="numeric" aria-describedby="sketch-country-code" pattern="[6-9][0-9]{9}" title="Enter your 10-digit Indian mobile number" maxLength={16} required value={phone} placeholder="10-digit mobile number" onChange={(event) => {
                    const digits = event.target.value.replace(/\D/g, "");
                    setPhone(digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits.length === 11 && digits.startsWith("0") ? digits.slice(1) : digits);
                  }} disabled={loading} />
                </span>
              </label>
            </div>
          </section>

          <section className={styles.panel} aria-labelledby="payment-title">
            <div className={styles.panelHeading}><h2 id="payment-title">Available Payment Methods</h2><p>Payments are securely processed by PayU.</p></div>
            <ul className={styles.paymentMethods} aria-label="Available payment methods on PayU">
              {paymentMethods.map(({ id, name, detail, icon: Icon }) => <li key={id}><span className={styles.methodIcon}><Icon size={23} aria-hidden="true" /></span><div><strong>{name}</strong><span>{detail}</span></div><ShieldCheck size={17} className={styles.methodCheck} aria-hidden="true" /></li>)}
            </ul>
            <div className={styles.paymentNote}><LockKeyhole size={17} aria-hidden="true" /><p>Click Pay Now to choose your payment method and complete your payment in PayU’s secure window.</p></div>
          </section>
        </div>

        <aside className={styles.rightColumn} aria-label="Your sketch and order summary">
          <CheckoutStory />
          <section className={styles.summary} aria-labelledby="cart-title">
            <h2 id="cart-title">Cart Summary</h2>
            <h3>{plan.checkoutTitle}</h3>
            <p className={styles.digital}><Download size={15} aria-hidden="true" /> Digital product</p>
            <dl aria-live="polite" aria-atomic="true">
              <div><dt>{plan.name}</dt><dd>{formatRupees(price.base)}</dd></div>
              {catalog.filter((item) => selectedAddOns.includes(item.id)).map((item) => <div key={item.id}><dt>{item.title}</dt><dd>{item.price === null ? "To be confirmed" : formatRupees(item.price)}</dd></div>)}
              <div className={styles.subtotal}><dt>Subtotal</dt><dd>{totals ? formatRupees(totals.subtotal) : "To be confirmed"}</dd></div>
              <div><dt>GST ({GST_RATE}%)</dt><dd>{totals ? formatRupees(totals.gst) : "To be confirmed"}</dd></div>
              <div className={styles.total}><dt>Total</dt><dd>{totals ? formatRupees(totals.total) : "To be confirmed"}</dd></div>
            </dl>
            <CheckoutExtras planId={planId} selected={selectedAddOns} onChange={setAddOns} disabled={loading} />
            <p className={styles.checkoutTerms}>By clicking Pay Now, you agree to our <a href="/Terms/terms-of-service.html">Terms of Sale</a>.</p>
            {ready && !hasAnswers && <p className={styles.sessionNotice}>Complete your <Link href="/soulmate">sketch preferences</Link> before making a payment.</p>}
            {error && <p className={styles.error} role="alert">{error}</p>}
            <button type="submit" className={styles.payButton} disabled={!ready || !hasAnswers || loading}><LockKeyhole size={17} />{loading ? "Opening secure checkout…" : (totals ? `Pay Now · ${formatRupees(totals.total)}` : "Pay Now")}<ArrowRight size={18} /></button>
            <p className={styles.smallPrint}>One-time payment. No subscription.</p>
            <CheckoutReviews />
          </section>
        </aside>
      </form>
      <footer className={styles.footer}><span>© {new Date().getFullYear()} Astro Rekha</span><nav aria-label="Checkout policies"><a href="/Terms/privacy-policy.html">Privacy</a><a href="/Terms/terms-of-service.html">Terms</a><a href="/Terms/money-back-policy.html">Refunds</a><a href="/Terms/contact-us.html">Contact</a></nav></footer>
    </div>
  </main>;
}
