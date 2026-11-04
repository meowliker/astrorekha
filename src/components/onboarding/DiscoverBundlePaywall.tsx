"use client";

import type { RefObject } from "react";
import { motion } from "framer-motion";
import { Check, Shield, Star, Sparkles } from "lucide-react";
import Link from "next/link";
import Script from "next/script";
import { fadeUp } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import ProductOfferTracker from "@/components/ProductOfferTracker";
import type { BundlePlan } from "@/lib/pricing";
import { bundlePriceLabel, discoverBundlePrice } from "@/lib/discover-bundle-price";
import { GoogleAdsBusinessFooter } from "./GoogleAdsBusinessFooter";

type SectionRef = RefObject<HTMLDivElement | null>;
type Props = {
  plans: BundlePlan[]; selectedPlan: string; isPlanSelectionReady: boolean;
  onSelect: (id: string) => void; onPurchase: () => Promise<void>; onViewPlans: () => void;
  palmImage: string | null;
  agreedToTerms: boolean; onTermsChange: (value: boolean) => void;
  isProcessing: boolean; isCheckingCheckout: boolean; isRedeemingCoupon: boolean;
  paymentError: string; pendingTxnId: string | null;
  coupon: { visible: boolean; value: string; onShow: () => void; onChange: (value: string) => void; onApply: () => Promise<void> };
  sections: { payment: SectionRef; cards: SectionRef; cta: SectionRef; details: SectionRef; about: SectionRef };
  sticky: { payment: boolean; content: boolean };
};

// Copied from the original paywall markup. Only audit-related text/data differs.
const ASTROREKHA_ASSETS = { logo: "/logo.webp", elysia: "/elysia.webp" };
const predictionLabels = [
  { text: "Children", emoji: "👶", top: "15%", left: "20%", rotation: -15 },
  { text: "Marriage", emoji: "💕", top: "35%", left: "55%", rotation: 5 },
  { text: "Life themes", emoji: "✨", top: "55%", left: "15%", rotation: -10 },
];
const readingStats = [
  { label: "Love", color: "#EF6B6B", value: 80 }, { label: "Wellbeing", color: "#4ECDC4", value: 70 },
  { label: "Wisdom", color: "#F5C542", value: 75 }, { label: "Career", color: "#8B5CF6", value: 65 },
];
const compatibilityStats = [
  { label: "Sexual", color: "#EF6B6B", value: 80 }, { label: "Emotional", color: "#4ECDC4", value: 75 },
  { label: "Intellectual", color: "#F5C542", value: 85 }, { label: "Spiritual", color: "#8B5CF6", value: 70 },
];
const testimonials = [
  { name: "Palm Reading", country: "Digital report", flag: "👋", time: "Palmistry themes", review: "Explore traditional palmistry interpretations around emotions, personality and life experiences. Interpretations are for reflection and are not medical assessments." },
  { name: "Birth Chart", country: "Digital report", flag: "🪐", time: "Astrology themes", review: "Explore symbolic astrology themes based on your saved birth details, including your Sun sign, Moon sign and ascendant. Interpretations may be inaccurate." },
  { name: "Soulmate Sketch", country: "Digital artwork", flag: "✨", time: "Included in selected bundles", review: "An imaginative AI portrait inspired by your preferences. It does not identify a real future partner or guarantee a meeting or relationship." },
];
const scrollingEmails = ["Palmistry themes", "Birth chart insights", "AI interpretations", "Digital reports", "Personal reflection", "Sketch artwork"];

export function DiscoverBundlePaywall(props: Props) {
  const { plans: bundlePlans, selectedPlan, isPlanSelectionReady, agreedToTerms, isProcessing, isCheckingCheckout, isRedeemingCoupon, paymentError, pendingTxnId } = props;
  const handlePurchase = props.onPurchase, scrollToPayment = props.onViewPlans, handleCouponUnlock = props.coupon.onApply;
  const setAgreedToTerms = props.onTermsChange, setCouponCode = props.coupon.onChange;
  const showCouponInput = props.coupon.visible, couponCode = props.coupon.value;
  const setShowCouponInput = () => props.coupon.onShow();
  const palmImage = props.palmImage, croppedPalmImage = props.palmImage;
  const paymentSectionRef = props.sections.payment, pricingCardsRef = props.sections.cards, checkoutCtaRef = props.sections.cta;
  const testimonialSectionRef = props.sections.details, birthChartSectionRef = props.sections.about;
  const showStickyCTA = props.sticky.content, showPaymentStickyCTA = props.sticky.payment;
  const heroPredictionLabels = predictionLabels;
  const selected = bundlePlans.find(plan => plan.id === selectedPlan);
  const selectedPlanDisplayPrice = selected ? bundlePriceLabel(discoverBundlePrice(selected).total).replace("₹", "") : "";

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={fadeUp}
      className="flex flex-col bg-background"
    >
      {/* Section 1: Hero Ready - Full Screen */}
      <div className="min-h-[100vh] flex flex-col items-center justify-center px-6 py-8">
        {/* Header with Logo */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-1 mb-2"
        >
          <img src={ASTROREKHA_ASSETS.logo} alt="AstroRekha" className="w-20 h-20 object-contain" />
          <span className="text-sm text-muted-foreground">AstroRekha</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-2xl md:text-3xl font-bold text-center mb-1"
        >
          Your Palm Reading
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-xl md:text-2xl font-bold text-primary mb-8"
        >
          Explore Your Insights
        </motion.p>

        {/* Palm with prediction labels */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className="relative w-72 h-80 mb-8"
        >
          {/* Circular glow background */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-b from-primary/20 via-primary/10 to-transparent blur-2xl" />

          {/* Dark circle container */}
          <div className="absolute inset-4 rounded-full bg-card/80 border border-border/50 overflow-hidden flex items-center justify-center">
            {croppedPalmImage ? (
              <img src={croppedPalmImage} alt="Your palm" className="w-full h-full object-cover opacity-80" />
            ) : (
              <img
                src="/palm.png"
                alt="Your palm reading"
                className="w-[200px] h-[240px] object-contain opacity-80"
              />
            )}
          </div>

          {/* Prediction labels */}
          {heroPredictionLabels.map((label, index) => (
            <motion.div
              key={label.text}
              initial={{ opacity: 0, scale: 0, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.6 + index * 0.2, type: "spring", stiffness: 200 }}
              className="absolute rounded-lg px-3 py-1.5 bg-[#121b2f] border border-white/20 text-white shadow-[0_10px_28px_rgba(0,0,0,0.48)] whitespace-nowrap"
              style={{
                top: label.top,
                left: label.left,
                transform: `rotate(${label.rotation}deg)`,
              }}
            >
              <span className="text-sm font-medium flex items-center gap-1">
                {label.text} <span>{label.emoji}</span>
              </span>
            </motion.div>
          ))}
        </motion.div>

        {/* Get My Prediction Button */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="w-full max-w-sm"
        >
          <Button
            onClick={scrollToPayment}
            className="w-full h-14 text-lg font-semibold"
            size="lg"
          >
            Get My Prediction
          </Button>
        </motion.div>
        <p className="mt-4 max-w-sm text-center text-xs leading-relaxed text-muted-foreground">AI-generated digital readings for personal reflection. Your full reports are available after payment confirmation; they do not diagnose health conditions or guarantee future events.</p>
      </div>

      {/* Section 2: Payment Section */}
      <div ref={paymentSectionRef} className="min-h-[100vh] flex flex-col items-center px-6 pt-4 pb-8">
        {/* Complete Your Purchase heading */}
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-xl font-bold text-center mb-2"
        >
          Choose Your Reading
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-muted-foreground text-center text-sm mb-6"
        >
          One-time payment • Lifetime access
        </motion.p>

        {/* Pricing Cards */}
        <div ref={pricingCardsRef} role="radiogroup" aria-label="Reading bundles" className="w-full max-w-sm space-y-4 mb-6">
          {!isPlanSelectionReady ? (
            <div className="rounded-2xl border border-border/50 bg-card/50 p-6 text-center text-sm text-muted-foreground">
              Loading your offer...
            </div>
          ) : bundlePlans.map((plan, index) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + index * 0.1 }}
              role="radio" aria-label={plan.name} aria-checked={selectedPlan === plan.id} tabIndex={0}
              onClick={() => props.onSelect(plan.id)}
              onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); props.onSelect(plan.id); } }}
              className={`relative rounded-2xl border-2 p-4 cursor-pointer transition-all ${
                selectedPlan === plan.id
                  ? "border-primary bg-primary/5"
                  : "border-border/50 bg-card/50"
              }`}
            >
              <ProductOfferTracker type="bundle" id={plan.id} name={plan.name}/>
              {/* Badge */}
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs px-4 py-1 rounded-full font-semibold flex items-center gap-1">
                  <Star className="w-3 h-3" /> Bundle option
                </div>
              )}
              {plan.limitedOffer && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-cyan-500 to-teal-500 text-white text-xs px-4 py-1 rounded-full font-semibold flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Sketch bundle
                </div>
              )}

              <div className="flex items-start gap-3">
                {/* Radio */}
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center mt-1 ${
                  selectedPlan === plan.id ? "border-primary bg-primary" : "border-muted-foreground/30"
                }`}>
                  {selectedPlan === plan.id && <Check className="w-4 h-4 text-primary-foreground" />}
                </div>

                {/* Content */}
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-bold text-lg flex-1">{plan.name}</h3>
                    <span className="bg-green-500/20 text-green-400 text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0">
                      GST included
                    </span>
                  </div>
                  <p className="text-muted-foreground text-sm mb-3">{plan.description}</p>

                  {/* Price */}
                    <div className="flex items-baseline gap-2 mb-3">
                      <span className="text-2xl font-bold text-primary">{bundlePriceLabel(discoverBundlePrice(plan).total)}</span>
                      <span className="text-muted-foreground text-sm">incl. GST</span>
                    </div>

                  {/* Features */}
                  <ul className="space-y-1.5">
                    {plan.featureList.map((feature, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Terms checkbox */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="w-full max-w-sm mb-4"
        >
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              className="mt-1 w-4 h-4 rounded border-border"
            />
            <span className="text-xs text-muted-foreground">
              I agree to the{" "}
              <a href="/Terms/terms-of-service.html" target="_blank" className="text-primary underline">Terms of Service</a>
              {" "}and{" "}
              <a href="/Terms/privacy-policy.html" target="_blank" className="text-primary underline">Privacy Policy</a>
            </span>
          </label>
        </motion.div>

        {/* Error message */}
        {paymentError && (
          <div role="alert" className="w-full max-w-sm bg-destructive/10 text-destructive text-sm p-3 rounded-lg mb-4">
            {paymentError}
          </div>
        )}

        {/* CTA Button */}
        <motion.div
          ref={checkoutCtaRef}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="w-full max-w-sm mb-6"
        >
          <Button
            onClick={handlePurchase}
            disabled={!isPlanSelectionReady || !agreedToTerms || isCheckingCheckout || isProcessing || isRedeemingCoupon}
            className="w-full h-14 text-lg font-semibold"
            size="lg"
          >
            {isProcessing ? (
              <span className="flex items-center gap-2">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Processing...
              </span>
            ) : (
                isPlanSelectionReady
                  ? pendingTxnId ? "Check payment status" : `Get My Reading - ₹${selectedPlanDisplayPrice}`
                  : "Loading your offer..."
              )}
            </Button>
        </motion.div>

        {/* Coupon unlock for internal testing */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65 }}
          className="w-full max-w-sm mb-6"
        >
          {!showCouponInput ? (
            <button
              type="button"
              onClick={() => setShowCouponInput()}
              className="mx-auto block text-sm font-medium text-primary underline-offset-4 transition-colors hover:text-primary/80 hover:underline"
            >
              Have a coupon code?
            </button>
          ) : (
            <div className="rounded-2xl border border-primary/25 bg-primary/5 p-3">
              <label htmlFor="discover-coupon" className="mb-2 block text-xs font-medium text-muted-foreground">
                Coupon code
              </label>
              <div className="flex gap-2">
                <input
                  id="discover-coupon" value={couponCode}
                  onChange={(event) => setCouponCode(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleCouponUnlock();
                    }
                  }}
                  placeholder="Enter coupon code"
                  className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <Button
                  type="button"
                  onClick={handleCouponUnlock}
                  disabled={isRedeemingCoupon || isProcessing}
                  className="shrink-0"
                >
                  {isRedeemingCoupon ? "Applying..." : "Apply"}
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                A valid access code unlocks the bundle assigned to that code.
              </p>
            </div>
          )}
        </motion.div>

        {/* Safe checkout */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="flex flex-col items-center gap-2 mb-8"
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            <Shield className="w-4 h-4 text-primary" />
            <span className="text-sm">Secure checkout</span>
          </div>

          {/* Payment icons */}
          <div className="flex items-center gap-2">
            <div className="w-10 h-6 bg-[#1A1F71] rounded flex items-center justify-center">
              <span className="text-white text-xs font-bold">VISA</span>
            </div>
            <div className="w-10 h-6 bg-[#EB001B] rounded flex items-center justify-center">
              <div className="flex">
                <div className="w-3 h-3 bg-[#EB001B] rounded-full" />
                <div className="w-3 h-3 bg-[#F79E1B] rounded-full -ml-1" />
              </div>
            </div>
            <div className="w-10 h-6 bg-[#006FCF] rounded flex items-center justify-center">
              <span className="text-white text-[8px] font-bold">AMEX</span>
            </div>
            <div className="w-10 h-6 bg-[#5F259F] rounded flex items-center justify-center">
              <span className="text-white text-[8px] font-bold">UPI</span>
            </div>
          </div>
        </motion.div>

        {/* Palm Reading Stats Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="w-full max-w-sm bg-card/50 backdrop-blur-sm border border-border rounded-2xl p-5 mb-8"
        >
          {/* Palm image with stats overlay */}
          <div className="relative w-full h-48 rounded-xl overflow-hidden mb-4 bg-gradient-to-b from-muted/50 to-muted">
            {palmImage ? (
              <img
                src={palmImage}
                alt="Your palm"
                className="w-full h-full object-cover opacity-70"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <img
                  src="/palm.png"
                  alt="Your palm"
                  className="w-32 h-40 object-contain opacity-70"
                />
              </div>
            )}
          </div>

          <h3 className="text-lg font-semibold text-center mb-4">
            Palm reading preview
          </h3>

          <p className="mb-4 text-center text-xs text-muted-foreground">Illustrative example only. These charts are not measurements of your health, personality or future.</p>
          {/* Stats bars */}
          <div className="space-y-3 mb-4">
            {readingStats.map((stat, index) => (
              <div key={stat.label} className="flex items-center gap-3">
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: stat.color }}
                />
                <span className="text-sm text-muted-foreground w-16">{stat.label}</span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: stat.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${stat.value}%` }}
                    transition={{ delay: 1 + index * 0.15, duration: 0.8 }}
                  />
                </div>
                <span className="text-sm text-muted-foreground w-10 text-right">{stat.value}%</span>
              </div>
            ))}
          </div>

          {/* Reading descriptions */}
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              The <span className="text-[#EF6B6B] font-medium">Heart Line</span> is explored through traditional palmistry themes around emotions and relationships.
            </p>
            <p>
              The <span className="text-[#4ECDC4] font-medium">Life Line</span> is explored as a symbolic reflection on life experiences, not a medical assessment.
            </p>
            <p className="text-primary cursor-pointer" onClick={scrollToPayment}>More data in the full report</p>
          </div>

          {/* Get Full Report Button */}
          <Button
            onClick={scrollToPayment}
            className="w-full h-12 text-base font-semibold mt-4 bg-blue-500 hover:bg-blue-600"
            size="lg"
          >
            Get Full Report
          </Button>
        </motion.div>

        {/* Elysia Advisor Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          className="w-full max-w-sm p-8 mb-8"
        >
          {/* Elysia image with gradient ring */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-gradient-to-b from-purple-500/30 via-amber-500/20 to-transparent blur-xl scale-150" />
              <div className="relative w-28 h-28 rounded-full bg-gradient-to-b from-amber-600/80 via-amber-700/60 to-purple-900/80 p-1 border border-amber-500/50">
                <div className="w-full h-full rounded-full overflow-hidden">
                  <img
                    src={ASTROREKHA_ASSETS.elysia}
                    alt="Elysia"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = ASTROREKHA_ASSETS.logo;
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          <h3 className="text-xl font-bold text-center mb-3">
            Get personalized guidance from Elysia
          </h3>

          <p className="text-sm text-muted-foreground text-center leading-relaxed">
            Elysia is an AI guide providing personalized palmistry and astrology interpretations for personal reflection. Responses may be inaccurate.
          </p>
        </motion.div>

        {/* Compatibility Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.0 }}
          className="w-full max-w-sm bg-card/50 backdrop-blur-sm border border-border rounded-2xl p-5 mb-8"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500/30 to-purple-500/30 flex items-center justify-center">
              <span className="text-lg">💫</span>
            </div>
            <div>
              <h3 className="font-semibold">Compatibility Insights</h3>
              <p className="text-xs text-muted-foreground">Illustrative themes, not a measured compatibility result</p>
            </div>
          </div>

          {/* Compatibility stats */}
          <div className="space-y-3 mb-4">
            {compatibilityStats.map((stat, index) => (
              <div key={stat.label} className="flex items-center gap-3">
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: stat.color }}
                />
                <span className="text-sm text-muted-foreground w-20">{stat.label}</span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: stat.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${stat.value}%` }}
                    transition={{ delay: 1.2 + index * 0.15, duration: 0.8 }}
                  />
                </div>
                <span className="text-sm text-muted-foreground w-10 text-right">{stat.value}%</span>
              </div>
            ))}
          </div>

          {/* Love and Marriage insights */}
          <div className="space-y-4 mb-4">
            <div className="flex gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500/30 to-orange-500/30 flex items-center justify-center flex-shrink-0">
                <span className="text-lg">💕</span>
              </div>
              <p className="text-sm text-muted-foreground">
                <span className="text-[#EF6B6B] font-medium">Love</span> themes explore communication, trust and the qualities you value in a relationship.
              </p>
            </div>
            <div className="flex gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500/30 to-pink-500/30 flex items-center justify-center flex-shrink-0">
                <span className="text-lg">💍</span>
              </div>
              <p className="text-sm text-muted-foreground">
                <span className="text-[#8B5CF6] font-medium">Marriage</span> themes offer prompts for reflecting on commitment and shared values. They do not predict a relationship outcome.
              </p>
            </div>
          </div>

          <p onClick={scrollToPayment} className="text-primary text-sm text-center mb-4 cursor-pointer hover:underline">More data in the full report</p>

          <Button
            onClick={scrollToPayment}
            className="w-full h-12 text-base font-semibold bg-blue-500 hover:bg-blue-600"
            size="lg"
          >
            Get Full Report
          </Button>
        </motion.div>

        {/* Testimonial Section */}
        <div ref={testimonialSectionRef} className="w-full max-w-sm mb-8">
          {/* Trustpilot Rating */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.2 }}
            className="flex items-center justify-center gap-3 mb-4"
          >
            <span className="text-3xl font-bold text-emerald-400">AI</span>
            <div>
              <p className="text-sm text-muted-foreground">generated <span className="text-emerald-400 font-semibold">digital readings</span></p>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <div key={star} className="w-4 h-4 bg-emerald-500 flex items-center justify-center">
                    <span className="text-[10px] text-white">✦</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* World map background with stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.3 }}
            className="relative bg-gradient-to-b from-blue-900/30 to-slate-900/50 rounded-2xl p-6 mb-4 overflow-hidden"
          >
            <div className="absolute inset-0 opacity-20" style={{
              backgroundImage: `radial-gradient(circle, #3b82f6 1px, transparent 1px)`,
              backgroundSize: '8px 8px'
            }} />

            <div className="relative text-center">
              <h3 className="text-4xl font-bold text-blue-400 mb-2">Personalized</h3>
              <p className="text-sm text-muted-foreground italic">interpretations for personal reflection</p>
            </div>
          </motion.div>

          {/* Scrolling emails */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.4 }}
            className="overflow-hidden mb-6"
          >
            <div className="flex animate-scroll">
              {[...scrollingEmails, ...scrollingEmails].map((email, index) => (
                <div key={index} className="flex items-center gap-2 px-4 flex-shrink-0">
                  <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
                    <span className="text-xs text-white font-semibold">{email.charAt(0).toUpperCase()}</span>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{email}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Testimonial Cards */}
          <div className="space-y-4">
            {testimonials.map((testimonial, index) => (
              <motion.div
                key={testimonial.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.5 + index * 0.1 }}
                className="bg-card/50 backdrop-blur-sm border border-border rounded-2xl p-4"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                    <span className="text-lg text-white font-semibold">{testimonial.name.charAt(0)}</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{testimonial.name}</span>
                      <span className="text-xs text-emerald-400 flex items-center gap-1">
                        <span className="w-3 h-3 rounded-full bg-emerald-500 flex items-center justify-center">
                          <span className="text-[8px] text-white">✓</span>
                        </span>
                        Report theme
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{testimonial.flag} {testimonial.country}</span>
                      <span>•</span>
                      <span>{testimonial.time}</span>
                    </div>
                    <div className="flex gap-0.5 mt-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <span key={star} className="text-amber-400 text-xs">✦</span>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{testimonial.review}</p>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Birth Chart Analysis Section */}
        <div ref={birthChartSectionRef} className="w-full max-w-sm mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.6 }}
            className="bg-gradient-to-b from-slate-800/80 to-slate-900/90 rounded-3xl p-6"
          >
            <h3 className="text-xl font-bold text-center mb-6">Birth chart preview</h3>

            {/* Message bubble with Elysia */}
            <div className="relative bg-white rounded-2xl p-4 mb-4">
              <p className="text-sm text-slate-700 text-center">
                Your birth details help personalize the <span className="text-cyan-500 font-medium">astrology themes</span> explored in your full report.
              </p>
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white rotate-45" />
            </div>

            {/* Elysia avatar */}
            <div className="flex justify-center mb-6">
              <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-amber-500/50">
                <img
                  src={ASTROREKHA_ASSETS.elysia}
                  alt="Elysia"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = ASTROREKHA_ASSETS.logo;
                  }}
                />
              </div>
            </div>

            {/* Zodiac wheel placeholder */}
            <div className="flex justify-center mb-6">
              <div className="relative w-48 h-48">
                <div className="absolute inset-0 rounded-full bg-gradient-to-b from-cyan-500/20 to-transparent blur-xl" />
                <div className="relative w-full h-full rounded-full bg-gradient-to-b from-slate-700 to-slate-800 border border-slate-600 flex items-center justify-center">
                  <div className="w-36 h-36 rounded-full bg-slate-900/80 border border-slate-600 flex items-center justify-center">
                    <div className="text-center">
                      <span className="text-3xl">✨</span>
                      <p className="text-xs text-muted-foreground mt-1">Your Chart</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Core personality */}
            <h4 className="text-lg font-bold text-center mb-4">Personality themes</h4>

            <div className="space-y-4 mb-4">
              <div className="flex gap-3">
                <span className="text-2xl text-cyan-400">☀️</span>
                <p className="text-sm text-muted-foreground">
                  Your <span className="text-cyan-400 font-medium">Sun sign</span> is used in astrology to explore symbolic themes of identity and self-expression.
                </p>
              </div>
              <div className="flex gap-3">
                <span className="text-2xl text-cyan-400">🌙</span>
                <p className="text-sm text-muted-foreground">
                  Your <span className="text-cyan-400 font-medium">Moon sign</span> is used in astrology to explore symbolic themes of emotions and inner life.
                </p>
              </div>
            </div>

            <p onClick={scrollToPayment} className="text-primary text-sm text-center mb-4 cursor-pointer hover:underline">More data in the full report</p>

            <Button
              onClick={scrollToPayment}
              className="w-full h-12 text-base font-semibold bg-blue-500 hover:bg-blue-600"
              size="lg"
            >
              Get Full Report
            </Button>
          </motion.div>
        </div>

        {/* What you'll find in AstroRekha */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.7 }}
          className="w-full max-w-sm bg-gradient-to-b from-slate-800/80 to-slate-900/90 rounded-3xl p-6 mb-8"
        >
          <h3 className="text-xl font-bold text-center mb-6">What you&apos;ll find in AstroRekha</h3>

          <div className="space-y-4">
            {[
              { emoji: "👋", title: "Palm Reading", desc: "Dive deeper into your personality" },
              { emoji: "✨", title: "Zodiac Matches", desc: "Get love matches, lucky places & more" },
              { emoji: "🪐", title: "Your Birth Chart", desc: "Examine your chart and daily transits" },
              { emoji: "💬", title: "AI Advisor Access", desc: "Chat with Elysia using your available questions" },
              { emoji: "🔮", title: "Personal Horoscopes", desc: "Find out what the day or year holds" },
            ].map((feature) => (
              <div key={feature.title} className="flex items-center gap-4">
                <span className="text-2xl">{feature.emoji}</span>
                <div className="flex-1">
                  <p className="font-medium">{feature.title}</p>
                  <p className="text-xs text-muted-foreground">{feature.desc}</p>
                </div>
                <Check className="w-5 h-5 text-cyan-400" />
              </div>
            ))}
          </div>

          <Button
            onClick={scrollToPayment}
            className="w-full h-12 text-base font-semibold bg-blue-500 hover:bg-blue-600 mt-6"
            size="lg"
          >
            Try AstroRekha
          </Button>
        </motion.div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.8 }}
          className="w-full max-w-sm pb-[6rem]"
        >
          {/* Logo */}
          <div className="flex flex-col items-center mb-6">
            <img
              src={ASTROREKHA_ASSETS.logo}
              alt="AstroRekha"
              className="w-12 h-12 mb-2"
            />
            <p className="text-sm font-medium">AstroRekha</p>
          </div>

          {/* Contact Us */}
          <Link href="/Terms/contact-us.html" target="_blank" className="block w-full">
            <Button
              variant="outline"
              className="w-full h-12 text-base mb-6 hover:bg-primary hover:text-primary-foreground"
            >
              Contact Us
            </Button>
          </Link>

          {/* Legal Links */}
          <div className="grid grid-cols-2 gap-4 text-center">
            <Link href="/Terms/privacy-policy.html" target="_blank" className="text-sm text-primary hover:underline">
              Privacy Policy
            </Link>
            <Link href="/Terms/terms-of-service.html" target="_blank" className="text-sm text-primary hover:underline">
              Terms of Service
            </Link>
            <Link href="/Terms/billing-terms.html" target="_blank" className="text-sm text-primary hover:underline">
              Billing Terms
            </Link>
            <Link href="/Terms/money-back-policy.html" target="_blank" className="text-sm text-primary hover:underline">
              Money-Back Policy
            </Link>
          </div>

          <div className="mt-6 text-center text-sm text-foreground space-y-1">
            <GoogleAdsBusinessFooter />
            </div>
        </motion.div>
      </div>

      {/* Sticky CTA Button - only visible in testimonial and birth chart sections */}
      {showStickyCTA && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent"
        >
          <div className="max-w-sm mx-auto">
            <Button
              onClick={scrollToPayment}
              className="w-full h-14 text-lg font-semibold bg-blue-500 hover:bg-blue-600"
              size="lg"
            >
              Get personal prediction
            </Button>
          </div>
        </motion.div>
      )}

      {showPaymentStickyCTA && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-gradient-to-t from-background via-background to-transparent"
        >
          <div className="max-w-sm mx-auto">
            <Button
              onClick={handlePurchase}
              disabled={!isPlanSelectionReady || !agreedToTerms || isCheckingCheckout || isProcessing || isRedeemingCoupon}
              className="w-full h-14 text-lg font-semibold"
              size="lg"
            >
              {isProcessing ? (
                <span className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Processing...
                </span>
              ) : (
                  isPlanSelectionReady
                    ? pendingTxnId ? "Check payment status" : `Get My Reading - ₹${selectedPlanDisplayPrice}`
                    : "Loading your offer..."
                )}
            </Button>
          </div>
        </motion.div>
      )}

      {/* Load PayU Bolt script eagerly for faster checkout */}
      <Script src="https://jssdk.payu.in/bolt/bolt.min.js" strategy="afterInteractive" />
    </motion.div>
  );
}
