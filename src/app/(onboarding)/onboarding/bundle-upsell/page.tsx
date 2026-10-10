"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState, useEffect, Suspense } from "react";
import { fadeUp } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { useRouter, useSearchParams } from "next/navigation";
import { Activity, BarChart3, Briefcase, Calendar, Check, ChevronDown, Heart, Loader2, Moon, Sparkles, Star, Users } from "lucide-react";
import { useUserStore } from "@/lib/user-store";
import { supabase } from "@/lib/supabase";
import { generateUserId } from "@/lib/user-profile";
import { pixelEvents } from "@/lib/pixel-events";
import Script from "next/script";
import { getPaymentAttributionPayload } from "@/lib/attribution-client";
import { trackCheckout } from "@/lib/analytics";
import { normalizeIndianWhatsappNumber, toPayUPhoneNumber } from "@/lib/whatsapp";
import { useOnboardingStore } from "@/lib/onboarding-store";

const progressSteps = [
  { label: "Order submitted", completed: true },
  { label: "Special offer", active: true },
  { label: "Create account", completed: false },
  { label: "Access to the app", completed: false },
];

const PENDING_PAYMENT_KEY = "astrorekha_pending_payu_payment";

function appendUpsellTxnId(txnId: string) {
  const existing = localStorage
    .getItem("astrorekha_upsell_txn_ids")
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean) || [];
  if (!existing.includes(txnId)) {
    localStorage.setItem("astrorekha_upsell_txn_ids", [...existing, txnId].join(","));
  }
}

function savePendingPayUPayment(payment: {
  txnid: string;
  type: string;
  bundleId?: string;
  returnTo: string;
}) {
  localStorage.setItem(
    PENDING_PAYMENT_KEY,
    JSON.stringify({
      ...payment,
      createdAt: new Date().toISOString(),
    })
  );
}

function normalizePayUStatus(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function isPayUCancelOrFailure(value: unknown): boolean {
  const status = normalizePayUStatus(value);
  return (
    !status ||
    status.includes("cancel") ||
    status.includes("fail") ||
    status.includes("bounce") ||
    status.includes("drop") ||
    status === "usercancelled"
  );
}

type PayUBoltResponse = {
  response: {
    txnStatus: string;
    txnid: string;
    mihpayid?: string;
    hash?: string;
    additionalCharges?: string;
  };
};

type PayUBolt = {
  launch: (
    params: Record<string, string>,
    handlers: {
      responseHandler: (response: PayUBoltResponse) => void | Promise<void>;
      catchException: (error: unknown) => void | Promise<void>;
    }
  ) => void;
};

async function waitForPayUConfirmation(txnId: string, attempts = 8): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, 4000));
    }

    try {
      const response = await fetch(`/api/payu/status?txnid=${encodeURIComponent(txnId)}`, {
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data?.status === "paid") {
        return true;
      }
    } catch {
      // UPI callbacks can lag behind the browser response.
    }
  }

  return false;
}

const upsellOffers = [
  {
    id: "compatibility",
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
    id: "2026-predictions",
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
    id: "past-life",
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
    id: "numerology",
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
    id: "spirit-animal",
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
];

function BundleUpsellContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  
  const { userId: storeUserId } = useUserStore();

  const selectedOffers = useMemo(
    () => upsellOffers.filter((offer) => selectedIds.has(offer.id)),
    [selectedIds]
  );
  const selectedOfferIds = selectedOffers.map((offer) => offer.id).join(",");
  const selectedOfferNames = selectedOffers.map((offer) => offer.name);
  const selectedOfferLabel = selectedOfferNames.join(" + ");
  const selectedOfferPrice = selectedOffers.reduce((sum, offer) => sum + offer.price, 0);

  // Fulfill checkout to unlock features in Supabase
  const fulfillCheckout = async (bundleId: string) => {
    try {
      const userId = storeUserId || localStorage.getItem("astrorekha_user_id") || generateUserId();
      
      await supabase.from("users").update({
        bundle_purchased: bundleId,
      }).eq("id", userId);
    } catch (err) {
      console.error("Failed to fulfill bundle checkout:", err);
    }
  };

  // Route protection
  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    const hasCompletedPayment = localStorage.getItem("astrorekha_payment_completed") === "true";
    const hasCompletedRegistration = localStorage.getItem("astrorekha_registration_completed") === "true";
    localStorage.setItem("astrorekha_onboarding_flow", "flow-a");
    localStorage.setItem("astrorekha_layout_variant", "A");
    
    if (hasCompletedRegistration) {
      router.replace("/dashboard");
      return;
    }
    
    if (sessionId || hasCompletedPayment) {
      setIsAuthorized(true);
      
      if (sessionId) {
        localStorage.setItem("astrorekha_payment_completed", "true");
        localStorage.setItem("astrorekha_payment_session_id", sessionId);
        localStorage.setItem("astrorekha_purchase_type", "one-time");
        
        // Save the bundle ID for later use
        const selectedPlan = localStorage.getItem("astrorekha_selected_plan") || "palm-birth-sketch";
        localStorage.setItem("astrorekha_bundle_id", selectedPlan);
        
        // Track Purchase pixel
        const planPrices: Record<string, number> = {
          "palm-reading": 1163,
          "palm-birth": 1578,
          "palm-birth-compat": 3158,
          "palm-birth-sketch": 3158,
        };
        pixelEvents.purchase(planPrices[selectedPlan] || 1578, selectedPlan, selectedPlan, sessionId);
        
        // Fulfill the checkout to unlock features
        fulfillCheckout(selectedPlan);
      }
    } else {
      router.replace("/onboarding/bundle-pricing");
      return;
    }
  }, [searchParams, router]);

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
    if (selectedOffers.length === 0) {
      router.push("/onboarding/step-19");
      return;
    }

    setPaymentError("");
    setIsProcessing(true);

    // Track AddToCart for upsell
    pixelEvents.addToCart(selectedOfferPrice, selectedOfferLabel);

    try {
      const checkoutWhatsappNumber = normalizeIndianWhatsappNumber(
        localStorage.getItem("astrorekha_whatsapp_number")
      );
      const response = await fetch("/api/payu/initiate-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: storeUserId || localStorage.getItem("astrorekha_user_id") || generateUserId(),
          bundleId: selectedOfferIds,
          type: "upsell",
          email: localStorage.getItem("astrorekha_email") || "",
          firstName: localStorage.getItem("astrorekha_name") || "Customer",
          whatsappNumber: checkoutWhatsappNumber,
          birthDetails: useOnboardingStore.getState(),
          attribution: getPaymentAttributionPayload(),
        }),
      });

      const data = await response.json();

      if (data.txnId) {
        trackCheckout(selectedOfferIds, data.productInfo || selectedOfferLabel, Number(data.amount));
        savePendingPayUPayment({
          txnid: data.txnId,
          type: "upsell",
          bundleId: selectedOfferIds,
          returnTo: "/onboarding/step-19",
        });
        pixelEvents.initiateCheckout(selectedOfferPrice, selectedOfferNames, data.txnId);
        pixelEvents.addPaymentInfo(selectedOfferPrice, selectedOfferLabel, data.txnId);

        const bolt = (window as Window & { bolt?: PayUBolt }).bolt;
        if (!bolt) {
          setPaymentError("Payment checkout is still loading. Please try again.");
          setIsProcessing(false);
          return;
        }

        const completeUpsellCheckout = () => {
          localStorage.removeItem(PENDING_PAYMENT_KEY);
          appendUpsellTxnId(data.txnId);
          pixelEvents.purchase(selectedOfferPrice, `upsell-${selectedOfferIds}`, selectedOfferLabel, data.txnId);
          setIsProcessing(false);
          router.push("/onboarding/step-19");
        };

        const recoverAmbiguousPayment = async () => {
          setPaymentError("Confirming your payment. This can take a few moments.");
          const confirmed = await waitForPayUConfirmation(data.txnId);
          if (confirmed) {
            completeUpsellCheckout();
            return;
          }
          router.push(`/payment/processing?txnid=${encodeURIComponent(data.txnId)}&source=upsell_recovery`);
        };

        bolt.launch(
          {
            key: data.key,
            txnid: data.txnId,
            hash: data.hash,
            amount: data.amount,
            firstname: data.firstName,
            email: data.email,
            phone: data.phone || toPayUPhoneNumber(checkoutWhatsappNumber),
            productinfo: data.productInfo,
            udf1: data.udf1,
            udf2: data.udf2,
            udf3: data.udf3,
            udf4: data.udf4,
            udf5: data.udf5,
            surl: `${window.location.origin}/api/payu/success`,
            furl: `${window.location.origin}/api/payu/failure`,
          },
          {
            responseHandler: async (responsePayload: PayUBoltResponse) => {
              const txnStatus = responsePayload.response.txnStatus;
              if (isPayUCancelOrFailure(txnStatus)) {
                localStorage.removeItem(PENDING_PAYMENT_KEY);
                setPaymentError("Payment was cancelled. You can try again whenever you're ready.");
                setIsProcessing(false);
                return;
              }

              if (txnStatus !== "SUCCESS") {
                await recoverAmbiguousPayment();
                return;
              }

              const verifyRes = await fetch("/api/payu/verify-payment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  txnid: responsePayload.response.txnid,
                  mihpayid: responsePayload.response.mihpayid,
                  status: "success",
                  hash: responsePayload.response.hash,
                  additionalCharges: responsePayload.response.additionalCharges,
                  amount: data.amount,
                  productinfo: data.productInfo,
                  firstname: data.firstName,
                  email: data.email,
                  phone: data.phone || toPayUPhoneNumber(checkoutWhatsappNumber),
                  udf1: data.udf1,
                  udf2: data.udf2,
                  udf3: data.udf3,
                  udf4: data.udf4,
                  udf5: data.udf5,
                  key: data.key,
                }),
              });
              const verifyData = await verifyRes.json().catch(() => ({ success: false }));
              if (verifyRes.ok && verifyData?.success) {
                completeUpsellCheckout();
              } else {
                await recoverAmbiguousPayment();
              }
            },
            catchException: async () => {
              localStorage.removeItem(PENDING_PAYMENT_KEY);
              setPaymentError("Payment was cancelled. You can try again whenever you're ready.");
              setIsProcessing(false);
            },
          }
        );
      } else if (data.error) {
        setPaymentError(data.error);
        setIsProcessing(false);
      } else {
        setPaymentError("Unable to process. Please try again.");
        setIsProcessing(false);
      }
    } catch (error) {
      console.error("Upsell error:", error);
      setPaymentError("Something went wrong. Please try again.");
      setIsProcessing(false);
    }
  };

  const handleSkip = () => {
    router.push("/onboarding/step-19");
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
                        <span className="text-sm text-white/45 line-through">₹{offer.originalPrice}</span>
                        <span className="text-lg font-bold text-white">₹{offer.price}</span>
                        <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-[10px] font-semibold text-green-400">
                          {offer.discount}
                        </span>
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
                  `Add to Order - ₹${selectedOfferPrice}`
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
            "The compatibility report explained our chemistry so clearly, and the 2026 predictions helped me prepare for a major career change right on time."
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
      {/* Load PayU Bolt script only on this page */}
      <Script src="https://jssdk.payu.in/bolt/bolt.min.js" strategy="afterInteractive" />
    </>
  );
}
