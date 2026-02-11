"use client";

import { motion } from "framer-motion";
import { useState, useEffect, Suspense } from "react";
import { fadeUp } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Loader2, Star, Sparkles, Calendar, Heart, Briefcase, Activity } from "lucide-react";
import { useUserStore } from "@/lib/user-store";
import { useOnboardingStore } from "@/lib/onboarding-store";
import { supabase } from "@/lib/supabase";
import { generateUserId } from "@/lib/user-profile";
import { pixelEvents } from "@/lib/pixel-events";

const progressSteps = [
  { label: "Order submitted", completed: true },
  { label: "Special offer", active: true },
  { label: "Create account", completed: false },
  { label: "Access to the app", completed: false },
];

// Preview features for 2026 predictions
const predictionFeatures = [
  { icon: Calendar, label: "Month-by-month forecasts", description: "Detailed predictions for all 12 months" },
  { icon: Heart, label: "Love & relationships", description: "When romance will bloom in your life" },
  { icon: Briefcase, label: "Career milestones", description: "Key opportunities and timing" },
  { icon: Activity, label: "Health guidance", description: "Best times for wellness focus" },
];

function BundleUpsellContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState(true);
  
  const { userId: storeUserId } = useUserStore();
  const { birthMonth, birthDay, birthYear } = useOnboardingStore();

  // Fulfill checkout to unlock features in Supabase
  const fulfillCheckout = async (bundleId: string) => {
    try {
      const userId = storeUserId || localStorage.getItem("astrorekha_user_id") || generateUserId();
      
      await supabase.from("users").update({
        bundle_purchased: bundleId,
      }).eq("id", userId);
      
      console.log("Bundle checkout fulfilled for:", bundleId);
    } catch (err) {
      console.error("Failed to fulfill bundle checkout:", err);
    }
  };

  // Route protection
  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    const hasCompletedPayment = localStorage.getItem("astrorekha_payment_completed") === "true";
    const hasCompletedRegistration = localStorage.getItem("astrorekha_registration_completed") === "true";
    const flow = localStorage.getItem("astrorekha_onboarding_flow");
    
    // If not flow-b, redirect to regular upsell
    if (flow !== "flow-b") {
      router.replace("/onboarding/step-18");
      return;
    }
    
    if (hasCompletedRegistration) {
      router.replace("/home");
      return;
    }
    
    if (sessionId || hasCompletedPayment) {
      setIsAuthorized(true);
      
      if (sessionId) {
        localStorage.setItem("astrorekha_payment_completed", "true");
        localStorage.setItem("astrorekha_payment_session_id", sessionId);
        localStorage.setItem("astrorekha_purchase_type", "one-time");
        
        // Save the bundle ID for later use
        const selectedPlan = localStorage.getItem("astrorekha_selected_plan") || "palm-birth";
        localStorage.setItem("astrorekha_bundle_id", selectedPlan);
        
        // Track Purchase pixel
        const planPrices: Record<string, number> = {
          "palm-reading": 1163,
          "palm-birth": 1578,
          "palm-birth-compat": 3158,
        };
        pixelEvents.purchase(planPrices[selectedPlan] || 1578, selectedPlan, selectedPlan);
        
        // Fulfill the checkout to unlock features
        fulfillCheckout(selectedPlan);
      }
    } else {
      router.replace("/onboarding/bundle-pricing");
      return;
    }
  }, [searchParams, router]);

  const handleAddUpsell = async () => {
    setPaymentError("");
    setIsProcessing(true);
    
    const upsellPriceINR = 499;
    // Track AddToCart for upsell
    pixelEvents.addToCart(upsellPriceINR, "2026 Future Predictions");

    try {
      const response = await fetch("/api/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: upsellPriceINR * 100, // paise
          userId: storeUserId || localStorage.getItem("astrorekha_user_id") || generateUserId(),
          bundleId: "2026-predictions",
          type: "upsell",
        }),
      });

      const data = await response.json();

      if (data.orderId) {
        pixelEvents.initiateCheckout(upsellPriceINR, ["2026 Future Predictions"]);

        const options = {
          key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
          amount: upsellPriceINR * 100,
          currency: "INR",
          name: "AstroRekha",
          description: "2026 Future Predictions",
          order_id: data.orderId,
          handler: async (res: any) => {
            await fetch("/api/razorpay/verify-payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id: res.razorpay_order_id,
                razorpay_payment_id: res.razorpay_payment_id,
                razorpay_signature: res.razorpay_signature,
              }),
            });
            pixelEvents.purchase(upsellPriceINR, "2026-predictions", "2026 Future Predictions");
            setIsProcessing(false);
            router.push("/onboarding/step-19");
          },
          prefill: { email: localStorage.getItem("astrorekha_email") || "" },
          theme: { color: "#7C3AED" },
        };
        const rzp = new (window as any).Razorpay(options);
        rzp.on("payment.failed", () => {
          setPaymentError("Payment failed. Please try again.");
          setIsProcessing(false);
        });
        rzp.open();
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
      <div className="px-6 pt-6 pb-4">
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
      <div className="flex-1 px-6 py-4">
        {/* Success Message */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 mb-6 text-center"
        >
          <div className="text-3xl mb-2">🎉</div>
          <h2 className="text-lg font-bold text-green-400">Payment Successful!</h2>
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
            <div className="bg-gradient-to-r from-purple-600/30 to-blue-600/30 px-6 py-5 text-center">
              <div className="text-4xl mb-2">🔮</div>
              <h3 className="text-2xl font-bold text-white mb-1">2026 Future Predictions</h3>
              <p className="text-white/70 text-sm">Know what the stars have in store for you</p>
            </div>

            {/* Features */}
            <div className="px-6 py-5 space-y-4">
              {predictionFeatures.map((feature, index) => (
                <motion.div
                  key={feature.label}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                  className="flex items-start gap-3"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <feature.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-white text-sm">{feature.label}</h4>
                    <p className="text-white/60 text-xs">{feature.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Price Section */}
            <div className="px-6 py-5 bg-black/20">
              <div className="flex items-center justify-center gap-3 mb-4">
                <span className="text-white/50 line-through text-lg">₹999</span>
                <span className="text-4xl font-bold text-white">₹499</span>
                <span className="bg-green-500/20 text-green-400 text-xs px-2 py-1 rounded-full font-semibold">
                  50% OFF
                </span>
              </div>

              {/* Selection Toggle */}
              <label
                className={`flex items-center gap-3 p-4 rounded-xl cursor-pointer transition-all mb-4 ${
                  selectedOffer
                    ? "bg-primary/20 border-2 border-primary"
                    : "bg-white/5 border-2 border-transparent"
                }`}
                onClick={() => setSelectedOffer(!selectedOffer)}
              >
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                  selectedOffer ? "border-primary bg-primary" : "border-white/30"
                }`}>
                  {selectedOffer && <Check className="w-4 h-4 text-primary-foreground" />}
                </div>
                <div className="flex-1">
                  <span className="font-semibold text-white">Add to my order</span>
                  <p className="text-white/60 text-xs">One-time payment • Instant access</p>
                </div>
              </label>

              {/* Error message */}
              {paymentError && (
                <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg mb-4">
                  {paymentError}
                </div>
              )}

              {/* CTA Button */}
              <Button
                onClick={handleAddUpsell}
                disabled={!selectedOffer || isProcessing}
                className="w-full h-14 text-lg font-semibold bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                size="lg"
              >
                {isProcessing ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processing...
                  </span>
                ) : (
                  "Add to Order - ₹499"
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
            "The 2026 predictions were incredibly accurate! It helped me prepare for a major career change that happened exactly when predicted."
          </p>
          <p className="text-xs text-muted-foreground mt-2">— Sarah M., verified buyer</p>
        </motion.div>
      </div>

      {/* Skip Button */}
      <div className="px-6 pb-8">
        <button
          onClick={handleSkip}
          disabled={isProcessing}
          className="w-full text-center text-muted-foreground text-sm py-3 hover:text-white transition-colors"
        >
          No thanks, continue without this offer →
        </button>
      </div>
    </motion.div>
  );
}

export default function BundleUpsellPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center min-h-screen bg-background">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      }
    >
      <BundleUpsellContent />
    </Suspense>
  );
}
