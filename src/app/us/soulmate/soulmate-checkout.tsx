"use client";
import { trackSoulmate } from "@/lib/us-soulmate-tracking";
import { trackSoulmateEmail } from "@/lib/us-soulmate-ads-events";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Download, LockKeyhole, Mail, ShieldCheck, HandCoins } from "lucide-react";
import { Answers, DeliveryId, deliveryPlans, formatRupees, priceWithTax, steps } from "./chat-data";
import { readCheckoutDetails, saveCheckoutDetails } from "./checkout-state";
import { SoulmateImage } from "./soulmate-image";
import { CheckoutExtras, CheckoutReviews, CheckoutStory } from "./checkout-extras";
import { addOnsForPlan, sanitizeAddOnIds, checkoutTotals, type AddOnId } from "./checkout-addons";
import { StripePaymentFields, prepareCheckout, type PromotionQuote, type InlinePayment } from "./stripe-payment-fields";
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
  const [promoInput, setPromoInput] = useState("");
  const [promoError, setPromoError] = useState("");
  const [promoBusy, setPromoBusy] = useState(false);
  const [promotion, setPromotion] = useState<{ context: string; quote: PromotionQuote; input: string } | null>(null);
  const [error, setError] = useState("");
  const plan = deliveryPlans.find((item) => item.id === planId)!;
  const price = priceWithTax(plan.price);
  const catalog = addOnsForPlan(planId);
  const selectedAddOns = sanitizeAddOnIds(addOns, planId);
  const totals = checkoutTotals(plan.price, selectedAddOns, catalog);
  const checkoutTotal = totals?.total;
  const hasAnswers = steps.every((step) => answers[step]);
  const cartDetails = { planId, answers, addOns: selectedAddOns };
  const promoContext = JSON.stringify({ ...cartDetails, email: email.trim().toLowerCase() });
  const activePromotion = promotion?.context === promoContext ? promotion : null;
  const quote = activePromotion?.quote;
  const displayTotal = quote ? quote.total / 100 : totals?.total;
  const signature = JSON.stringify({ ...cartDetails, ...(activePromotion ? { promotionCode: activePromotion.input } : {}) });
  const busy = loading || promoBusy;
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
    if (ready && checkoutTotal !== undefined) trackSoulmate("checkout_view", { plan: planId, value: checkoutTotal, itemIds: [`us_soulmate_${planId}`, ...sanitizeAddOnIds(addOns, planId)], once: "checkout" });
  }, [ready, planId, checkoutTotal, addOns]);
  async function applyPromotion() {
    if (submitting.current) return;
    setPromoError("");
    if (!hasAnswers) { setPromoError("Complete your sketch preferences before applying a promo code."); return; }
    if (!validEmail) { setPromoError("Enter your email above before applying a promo code."); return; }
    if (!promoInput.trim()) { setPromoError("Enter a promo code."); return; }
    submitting.current = true; setPromoBusy(true);
    try {
      const input = promoInput.trim();
      const { data } = await prepareCheckout(JSON.stringify({ ...cartDetails, promotionCode: input }), email.trim().toLowerCase());
      const value = data.quote as PromotionQuote | undefined;
      if (!value || !value.code || ![value.subtotal, value.discount, value.tax, value.total].every(Number.isSafeInteger) || value.discount <= 0 || value.total < 50 || value.total !== value.subtotal - value.discount + value.tax) throw new Error("Unable to apply this promo code. Please try again.");
      setPromotion({ context: promoContext, quote: value, input }); setError("");
    } catch (cause) { setPromoError(cause instanceof Error ? cause.message : "Unable to apply this code."); }
    finally { submitting.current = false; setPromoBusy(false); }
  }
  async function checkout(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || !hasAnswers || !validEmail || !totals || !paymentReady || !payment) return;
    trackSoulmateEmail(email);
    submitting.current = true;
    setLoading(true);
    setError("");
    try {
      const receiptUrl = await payment.confirm(email.trim().toLowerCase());
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
        <Link href="/us/soulmate?checkout=back" aria-disabled={busy} onClick={(event) => { if (busy) event.preventDefault(); }}><ArrowLeft size={15} /> Back to your sketch</Link>
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

      <form className={styles.columns} onSubmit={checkout} aria-busy={busy}>
        <div className={styles.leftColumn}>
          <section className={styles.panel} aria-labelledby="customer-title">
            <div className={styles.panelHeading}><h2 id="customer-title">Customer Information</h2></div>
            <div className={styles.customerFields}>
              <label htmlFor="sketch-email">Email <span aria-hidden="true">*</span>
                <input id="sketch-email" name="email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={(event) => { setEmail(event.target.value); setPromotion(null); setPromoError(""); }} disabled={busy} placeholder="you@example.com" aria-describedby="email-help" />
              </label>
              <p id="email-help" className={styles.fieldHint}>Your sketch and order confirmation will be sent here.</p>
            </div>
          </section>

          <section className={styles.panel} aria-labelledby="payment-title">
            <div className={styles.panelHeading}><h2 id="payment-title">Payment Information</h2><p>Payments are securely processed by Stripe.</p></div>
            <StripePaymentFields signature={signature} amount={Math.round((displayTotal || 0) * 100)} enabled={ready && !!totals} onPayment={setPayment} />
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
              {quote && <div className={styles.discount}><dt>Discount ({quote.code})</dt><dd>−{formatRupees(quote.discount / 100)}</dd></div>}
              <div><dt>Tax</dt><dd>{totals ? formatRupees(quote ? quote.tax / 100 : totals.tax) : "To be confirmed"}</dd></div>
              <div className={styles.total}><dt>Total</dt><dd>{totals ? formatRupees(displayTotal!) : "To be confirmed"}</dd></div>
            </dl>
            <div className={styles.promo}>
              <label htmlFor="promo-code">Promo code</label>
              <div className={styles.promoControls}>
                <input id="promo-code" name="promoCode" autoComplete="off" maxLength={200} value={promoInput} disabled={busy || !!activePromotion} onChange={(event) => { setPromoInput(event.target.value); setPromoError(""); }} placeholder="Enter promo code" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void applyPromotion(); } }} aria-describedby="promo-feedback" />
                {activePromotion ? <button type="button" disabled={busy} onClick={() => { setPromotion(null); setPromoInput(""); setPromoError(""); }}>Remove</button> : <button type="button" disabled={busy || !ready} onClick={() => void applyPromotion()}>{promoBusy ? "Applying…" : "Apply"}</button>}
              </div>
              <p id="promo-feedback" className={promoError ? styles.error : styles.fieldHint} role={promoError ? "alert" : "status"}>{promoError || (activePromotion ? `${quote!.code} applied. Your total has been updated.` : "")}</p>
            </div>
            <CheckoutExtras planId={planId} selected={selectedAddOns} onChange={(value) => { setAddOns(value); setPromotion(null); setPromoError(""); }} disabled={busy} />
            <p className={styles.checkoutTerms}>By clicking Pay Now, you agree to our <a href="/Terms/terms-of-service.html">Terms of Sale</a>.</p>
            {ready && !hasAnswers && <p className={styles.sessionNotice}>Complete your <Link href="/us/soulmate">sketch preferences</Link> before making a payment.</p>}
            {error && <p className={styles.error} role="alert">{error}</p>}
            <button type="submit" className={styles.payButton} disabled={!ready || !hasAnswers || !validEmail || !totals || !paymentReady || busy}><LockKeyhole size={17} />{loading ? "Processing payment…" : (totals ? `Pay Now · ${formatRupees(displayTotal!)}` : "US pricing coming soon")}<ArrowRight size={18} /></button>
            <p className={styles.smallPrint}>One-time payment. No subscription.</p>
            <CheckoutReviews />
          </section>
        </aside>
      </form>
      <footer className={styles.footer}><span>© {new Date().getFullYear()} Astro Rekha</span><nav aria-label="Checkout policies"><a href="/Terms/privacy-policy.html">Privacy</a><a href="/Terms/terms-of-service.html">Terms</a><a href="/Terms/money-back-policy.html">Refunds</a><a href="/Terms/contact-us.html">Contact</a></nav></footer>
    </div>
  </main>;
}
