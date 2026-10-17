"use client";
import { trackSoulmate } from "@/lib/us-soulmate-tracking";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Download, LockKeyhole, Mail, ShieldCheck, HandCoins } from "lucide-react";
import { Answers, DeliveryId, deliveryPlans, formatRupees, priceWithTax, steps } from "./chat-data";
import { readCheckoutDetails, saveCheckoutDetails } from "./checkout-state";
import { SoulmateImage } from "./soulmate-image";
import { CheckoutExtras, CheckoutReviews, CheckoutStory } from "./checkout-extras";
import { addOnsForPlan, sanitizeAddOnIds, checkoutTotals, type AddOnId } from "./checkout-addons";
import { StripePaymentFields, type InlinePayment } from "./stripe-payment-fields";
import styles from "./soulmate-checkout.module.css";

// Keep existing receipt/retry consumers compatible.
export { CHECKOUT_ATTEMPT_KEY, CHECKOUT_RECOVERY_KEY } from "./checkout-state";
export function SoulmateCheckout({ planId }: { planId: DeliveryId }) {
  const submitting = useRef(false);
  const [answers, setAnswers] = useState<Answers>({});
  const [email, setEmail] = useState("");
  const [payment, setPayment] = useState<InlinePayment | null>(null);
  const [addOns, setAddOns] = useState<AddOnId[]>([]);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const plan = deliveryPlans.find((item) => item.id === planId)!;
  const price = priceWithTax(plan.price);
  const catalog = addOnsForPlan(planId);
  const selectedAddOns = sanitizeAddOnIds(addOns, planId);
  const totals = checkoutTotals(plan.price, selectedAddOns, catalog);
  const hasAnswers = steps.every((step) => answers[step]);
  const signature = JSON.stringify({ email: email.trim().toLowerCase(), planId, answers, addOns: selectedAddOns });
  const paymentReady = payment?.signature === signature && payment.canPay;
  const validEmail = /^[^\s@|]+@[^\s@|]+\.[^\s@|]+$/.test(email.trim()) && email.trim().length <= 254;

  useEffect(() => {
    const saved = readCheckoutDetails();
    if (saved) {
      setAnswers(saved.answers);
      setEmail(saved.email);
      setAddOns(sanitizeAddOnIds(saved.addOns, planId));
    }
    setReady(true);
  }, [planId]);

  useEffect(() => {
    if (ready && hasAnswers) saveCheckoutDetails({ answers, planId, email, addOns: sanitizeAddOnIds(addOns, planId) });
  }, [ready, hasAnswers, answers, planId, email, addOns]);
  useEffect(() => {
    if (ready && hasAnswers) trackSoulmate("checkout_view", { plan: planId, value: price.total, once: "checkout" });
  }, [ready, hasAnswers, planId, price.total]);
  async function checkout(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || !hasAnswers || !totals || !paymentReady || !payment) return;
    submitting.current = true;
    setLoading(true);
    setError("");
    try {
      trackSoulmate("payment_submit", { plan: planId, value: totals.total, once: payment.orderId });
      const receiptUrl = await payment.confirm();
      window.location.assign(receiptUrl);
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
        <Link href="/us/soulmate?checkout=back" aria-disabled={loading} onClick={(event) => { if (loading) event.preventDefault(); }}><ArrowLeft size={15} /> Back to your sketch</Link>
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
            </div>
          </section>

          <section className={styles.panel} aria-labelledby="payment-title">
            <div className={styles.panelHeading}><h2 id="payment-title">Payment Information</h2><p>Payments are securely processed by Stripe.</p></div>
            <StripePaymentFields key={signature} signature={signature} amount={Math.round((totals?.total || 0) * 100)} enabled={ready && hasAnswers && validEmail && !!totals} onPayment={setPayment} />
            <div className={styles.paymentNote}><LockKeyhole size={17} aria-hidden="true" /><p>Enter your card details here, then click Pay Now to complete your order securely.</p></div>
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
              <div><dt>Tax</dt><dd>{totals ? formatRupees(totals.tax) : "To be confirmed"}</dd></div>
              <div className={styles.total}><dt>Total</dt><dd>{totals ? formatRupees(totals.total) : "To be confirmed"}</dd></div>
            </dl>
            <CheckoutExtras planId={planId} selected={selectedAddOns} onChange={setAddOns} disabled={loading} />
            <p className={styles.checkoutTerms}>By clicking Pay Now, you agree to our <a href="/Terms/terms-of-service.html">Terms of Sale</a>.</p>
            {ready && !hasAnswers && <p className={styles.sessionNotice}>Complete your <Link href="/us/soulmate">sketch preferences</Link> before making a payment.</p>}
            {error && <p className={styles.error} role="alert">{error}</p>}
            <button type="submit" className={styles.payButton} disabled={!ready || !hasAnswers || !totals || !paymentReady || loading}><LockKeyhole size={17} />{loading ? "Processing payment…" : (totals ? `Pay Now · ${formatRupees(totals.total)}` : "US pricing coming soon")}<ArrowRight size={18} /></button>
            <p className={styles.smallPrint}>One-time payment. No subscription.</p>
            <CheckoutReviews />
          </section>
        </aside>
      </form>
      <footer className={styles.footer}><span>© {new Date().getFullYear()} Astro Rekha</span><nav aria-label="Checkout policies"><a href="/Terms/privacy-policy.html">Privacy</a><a href="/Terms/terms-of-service.html">Terms</a><a href="/Terms/money-back-policy.html">Refunds</a><a href="/Terms/contact-us.html">Contact</a></nav></footer>
    </div>
  </main>;
}
