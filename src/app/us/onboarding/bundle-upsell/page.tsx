"use client";
import { startUsCheckout } from "@/lib/us-main/checkout-client";
import { usePricing } from "@/lib/us-main/usePricing";

import { isReportAvailableForPurchase } from "@/lib/customer-report-visibility";
import ProductOfferTracker from "@/components/us-main/ProductOfferTracker";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState, useEffect, Suspense } from "react";
import { fadeUp } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Activity, BarChart3, Briefcase, Calendar, Check, ChevronDown, Heart, Loader2, Moon, Sparkles, Star, Users } from "lucide-react";

const progressSteps = [
  { label: "Order submitted", completed: true },
  { label: "Special offer", active: true },
  { label: "Create account", completed: false },
  { label: "Access to the app", completed: false },
];

const baseUpsellOffers = [
  {
    id: "compatibility", feature: "compatibilityTest",
    name: "Compatibility Report",
    description: "Know how your relationship energy aligns.",
    price: 499,
    originalPrice: 999,
    discount: "50% OFF",
    icon: Users,
    emoji: "💕",
    features: [
      { icon: Users, label: "Relationship chemistry", description: "Love match insights and emotional alignment" },
      { icon: Heart, label: "Romantic strengths", description: "Where your connection naturally works best" },
    ],
  },
  {
    id: "2026-predictions", feature: "prediction2026",
    name: "2026 Future Predictions",
    description: "Month-wise timeline of your next big year.",
    price: 499,
    originalPrice: 999,
    discount: "50% OFF",
    icon: Calendar,
    emoji: "🔮",
    features: [
      { icon: Calendar, label: "Month-by-month forecasts", description: "Detailed predictions for all 12 months" },
      { icon: Briefcase, label: "Career and life timing", description: "Key opportunities, changes, and windows" },
      { icon: Activity, label: "Health guidance", description: "Best times for wellness focus" },
    ],
  },
  {
    id: "past-life", feature: "pastLifeReport",
    name: "Past Life Report",
    description: "Karmic patterns, soul lessons, and hidden gifts.",
    price: 499,
    originalPrice: 999,
    discount: "50% OFF",
    icon: Moon,
    emoji: "🌙",
    features: [
      { icon: Moon, label: "Soul archetype", description: "Symbolic past-life identity and karmic theme" },
      { icon: Sparkles, label: "Karmic remedies", description: "Simple practices for healing recurring patterns" },
    ],
  },
  {
    id: "numerology", feature: "numerologyReport",
    name: "Numerology Report",
    description: "Decode your core numbers, strengths, timing, and personal remedies.",
    price: 499,
    originalPrice: 999,
    discount: "50% OFF",
    icon: BarChart3,
    emoji: "#",
    features: [
      { icon: BarChart3, label: "Core number profile", description: "Mulank, Bhagyank, and name number explained in detail" },
      { icon: Star, label: "Strengths and life themes", description: "Personality, purpose, career, and relationship patterns" },
      { icon: Sparkles, label: "Personal remedies", description: "Helpful numbers, colors, dates, and practical guidance" },
    ],
  },
  {
    id: "spirit-animal", feature: "spiritAnimalReport",
    name: "Spirit Animal Report",
    description: "Reveal your spirit animal and discover its guidance.",
    price: 499,
    originalPrice: 999,
    discount: "50% OFF",
    icon: Sparkles,
    emoji: "🐾",
    features: [
      { icon: Sparkles, label: "Your spirit animal", description: "Reveal the spirit animal reflected in your response pattern" },
      { icon: Heart, label: "Inner nature and relationships", description: "Strengths, emotional patterns, love, and connection" },
      { icon: Briefcase, label: "Purpose and growth", description: "Career direction, daily practices, and personal guidance" },
    ],
  },
  {
    id: "witch-archetype", feature: "witchArchetypeReport", name: "Witch Archetype Report",
    description: "Discover your symbolic archetype, strengths, and personal practices.",
    price: 499, originalPrice: 999, discount: "50% OFF", icon: Moon, emoji: "✦",
    features: [
      { icon: Moon, label: "Your witch archetype", description: "Reveal your strongest archetype match" },
      { icon: Heart, label: "Strengths and relationships", description: "Explore your gifts, blind spots, and connections" },
      { icon: Sparkles, label: "Personal practices", description: "A reflection ritual and everyday guidance" },
    ],
  },
].filter((offer) => isReportAvailableForPurchase(offer.feature));

function BundleUpsellContent() {
  const router = useRouter();
  const { pricing, enabled } = usePricing();
  const upsellOffers = useMemo(() => baseUpsellOffers.filter(p => pricing.upsells.some(x => x.id === p.id && x.active)).map(p => ({ ...p, price: pricing.upsells.find(x => x.id === p.id)?.price || 0, originalPrice: 0, discount: "" })), [pricing]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());


  const selectedOffers = useMemo(
    () => upsellOffers.filter((offer) => selectedIds.has(offer.id)),
    [selectedIds, upsellOffers]
  );
  const selectedOfferPrice = selectedOffers.reduce((sum, offer) => sum + offer.price, 0);

  useEffect(() => { let cancelled=false;fetch('/api/us/main/payment-state', {cache:'no-store'}).then(r=>r.json()).then(d=>{if(cancelled)return;if(d.hasPaidBundlePayment)setIsAuthorized(true);else router.replace('/us/onboarding/bundle-pricing');}).catch(()=>{if(!cancelled)setPaymentError('Unable to verify your purchase. Please reload.');});return()=>{cancelled=true;};},[router]);

  const toggleOffer = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCheckout = async () => {
    if(!selectedOffers.length){router.push('/us/onboarding/step-19');return;}
    if(!enabled || selectedOffers.some(p=>p.price<=0)){setPaymentError('US add-on prices are not available yet. You can skip this step.');return;}
    setIsProcessing(true);setPaymentError('');
    try { await startUsCheckout('upsell', selectedOffers.map(p=>p.id)); }
    catch(e){setPaymentError(e instanceof Error?e.message:'Unable to start checkout');}
    finally{setIsProcessing(false);}
  };

  const handleSkip = () => {
    router.push("/us/onboarding/step-19");
  };

  if (!isAuthorized) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={fadeUp}
      className="flex-1 flex flex-col min-h-screen bg-background"
    >
      {/* Progress Steps */}
      <div className="px-6 pt-5 pb-3">
        <div className="flex items-center justify-between">
          {progressSteps.map((step, index) => (
            <div key={step.label} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    step.completed
                      ? "bg-green-500 text-white"
                      : step.active
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {step.completed ? <Check className="w-4 h-4" /> : index + 1}
                </div>
                <span className="text-xs mt-1 text-center max-w-[60px] text-muted-foreground">
                  {step.label}
                </span>
              </div>
              {index < progressSteps.length - 1 && (
                <div className={`w-8 h-0.5 mx-1 ${step.completed ? "bg-green-500" : "bg-muted"}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 px-6 py-3">
        {/* Success Message */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-green-500/10 border border-green-500/30 rounded-2xl p-3 mb-8 text-center"
        >
          <div className="text-2xl mb-1">🎉</div>
          <h2 className="text-base font-bold text-green-400">Payment Successful!</h2>
          <p className="text-sm text-muted-foreground">Your reading is being prepared</p>
        </motion.div>

        {/* Upsell Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="relative"
        >
          {/* Special Offer Badge */}
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs px-4 py-1.5 rounded-full font-semibold flex items-center gap-1.5 shadow-lg">
              <Sparkles className="w-3.5 h-3.5" />
              LIMITED TIME OFFER
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-600/20 via-blue-600/10 to-purple-600/20 rounded-3xl border border-purple-500/30 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-600/30 to-blue-600/30 px-6 py-4 text-center">
              <div className="text-3xl mb-1">💞</div>
              <h3 className="text-xl font-bold text-white mb-1">Optional Add-ons</h3>
              <p className="text-white/70 text-sm">Choose any add-ons, or skip</p>
            </div>

            <div className="space-y-2.5 px-5 py-4">
              {upsellOffers.map((offer, index) => {
                const selected = selectedIds.has(offer.id);
                const expanded = expandedIds.has(offer.id);
                return (
                  <motion.div
                    key={offer.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + index * 0.1 }}
                    className={`w-full rounded-2xl border-2 text-left transition-all ${
                      selected
                        ? "border-primary bg-primary/15"
                        : "border-white/10 bg-white/5 hover:border-primary/50"
                    }`}
                  >
                    <ProductOfferTracker type="upsell" id={offer.id} name={offer.name}/>
                    <div className="flex items-center gap-3 p-3">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(offer.id)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        aria-expanded={expanded}
                      >
                        <div className={offer.id === "numerology" ? "text-3xl font-light text-amber-200" : "text-2xl"}>
                          {offer.emoji}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-semibold leading-tight text-white">{offer.name}</h4>
                          <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-white/60">{offer.description}</p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleOffer(offer.id)}
                        className={`grid h-6 w-6 flex-shrink-0 place-items-center rounded-full border-2 ${
                          selected ? "border-primary bg-primary" : "border-white/30"
                        }`}
                        aria-label={`${selected ? "Remove" : "Add"} ${offer.name}`}
                      >
                        {selected && <Check className="h-4 w-4 text-primary-foreground" />}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleExpanded(offer.id)}
                      className="flex w-full items-center justify-between border-t border-white/10 px-3 py-2 text-left"
                      aria-expanded={expanded}
                    >
                      <div className="flex items-center gap-2">

                        <span className="text-lg font-bold text-white">${offer.price > 0 ? offer.price.toFixed(2) : "—"}</span>
                        {offer.discount && <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-[10px] font-semibold text-green-400">
                          {offer.discount}
                        </span>}
                      </div>
                      <ChevronDown className={`h-4 w-4 text-white/45 transition-transform ${expanded ? "rotate-180" : ""}`} />
                    </button>

                    <AnimatePresence initial={false}>
                      {expanded ? (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.18 }}
                          className="overflow-hidden"
                        >
                          <div className="space-y-2 border-t border-white/10 px-3 py-3">
                            {offer.features.map((feature) => (
                              <div key={feature.label} className="flex items-start gap-2">
                                <feature.icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                                <div>
                                  <p className="text-xs font-medium text-white">{feature.label}</p>
                                  <p className="text-[11px] text-white/55">{feature.description}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>

            <div className="px-6 py-5 bg-black/20">
              {/* Error message */}
              {paymentError && (
                <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg mb-4">
                  {paymentError}
                </div>
              )}

              {/* CTA Button */}
              <Button
                onClick={selectedOffers.length > 0 ? handleCheckout : handleSkip}
                disabled={isProcessing}
                className={`w-full h-14 text-lg font-semibold ${
                  selectedOffers.length > 0
                    ? "bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                    : "bg-white/10 hover:bg-white/20"
                }`}
                size="lg"
              >
                {isProcessing ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processing...
                  </span>
                ) : selectedOffers.length > 0 ? (
                  `Add to Order - $${selectedOfferPrice}`
                ) : (
                  "Continue without this offer →"
                )}
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Testimonial */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-6 p-4 bg-card/50 rounded-xl border border-border/50"
        >
          <div className="flex items-center gap-1 mb-2">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="w-4 h-4 fill-yellow-500 text-yellow-500" />
            ))}
          </div>
          <p className="text-sm text-muted-foreground italic">
            &quot;The compatibility report explained our chemistry so clearly, and the 2026 predictions helped me prepare for a major career change right on time.&quot;
          </p>
          <p className="text-xs text-muted-foreground mt-2">— Sarah M., verified buyer</p>
        </motion.div>
      </div>

      {/* Bottom spacing */}
      <div className="pb-8" />
    </motion.div>
  );
}

export default function BundleUpsellPage() {
  return (
    <>
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center min-h-screen bg-background">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        }
      >
        <BundleUpsellContent />
      </Suspense>
      {/* USD offers use the separate US checkout */}

    </>
  );
}
