"use client";

import { motion } from "framer-motion";
import { useState, useEffect, Suspense } from "react";
import { fadeUp } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import Image from "next/image";
import { useUserStore } from "@/lib/user-store";
import { useOnboardingStore } from "@/lib/onboarding-store";
import { supabase } from "@/lib/supabase";
import { generateUserId } from "@/lib/user-profile";
import { pixelEvents } from "@/lib/pixel-events";
import Script from "next/script";

const progressSteps = [
  { label: "Order submitted", completed: true },
  { label: "Special offer", active: true },
  { label: "Create account", completed: false },
  { label: "Access to the app", completed: false },
];

const upsellOffers = [
  {
    id: "2026-predictions",
    name: "2026 Future Predictions",
    price: "₹499",
    priceINR: 499,
    originalPrice: "₹799",
    discount: "37% OFF",
    icon: "🔮",
  },
  {
    id: "birth-chart",
    name: "Birth Chart Report",
    price: "₹499",
    priceINR: 499,
    originalPrice: "₹799",
    discount: "37% OFF",
    icon: "🌙",
  },
  {
    id: "compatibility",
    name: "Compatibility Report",
    price: "₹499",
    priceINR: 499,
    originalPrice: "₹799",
    discount: "37% OFF",
    icon: "🔮",
  },
  {
    id: "ultra-pack",
    name: "Ultra Pack 3 in 1",
    price: "₹999",
    priceINR: 999,
    originalPrice: "₹1,599",
    discount: "37% OFF",
    icon: "📦",
    recommended: true,
  },
];

function Step18Content() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedOffers, setSelectedOffers] = useState<Set<string>>(new Set(["ultra-pack"]));
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [isAnalyzingPalm, setIsAnalyzingPalm] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  
  const { unlockFeature, unlockAllFeatures, purchaseBundle, addCoins } = useUserStore();
  const { birthMonth, birthDay, birthYear } = useOnboardingStore();

  // Route protection: Check if user has completed payment
  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    const hasCompletedPayment = localStorage.getItem("astrorekha_payment_completed") === "true";
    const hasCompletedRegistration = localStorage.getItem("astrorekha_registration_completed") === "true";
    
    // If user has completed registration, redirect to app
    if (hasCompletedRegistration) {
      router.replace("/home");
      return;
    }
    
    // Allow access if: valid payment completed
    if (sessionId || hasCompletedPayment) {
      setIsAuthorized(true);
      
      // Mark payment as completed if coming from Razorpay callback
      if (sessionId) {
        localStorage.setItem("astrorekha_payment_completed", "true");
        localStorage.setItem("astrorekha_payment_session_id", sessionId);
      }
    } else {
      // No valid payment - redirect to bundle pricing
      router.replace("/onboarding/bundle-pricing");
      return;
    }
  }, [searchParams, router]);

  // Trigger palm reading analysis and Purchase pixel after successful payment
  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    if (sessionId) {
      // Prevent duplicate Purchase events by checking if already tracked for this session
      const trackedSessionId = localStorage.getItem("astrorekha_tracked_purchase_session");
      if (trackedSessionId !== sessionId) {
        // Get the plan from localStorage to determine correct purchase value
        const selectedPlan = localStorage.getItem("astrorekha_selected_plan") || "2week";
        const planPrices: Record<string, number> = {
          "1week": 1.00,
          "2week": 5.49,
          "4week": 9.99,
        };
        const purchaseValue = planPrices[selectedPlan] || 5.49;
        const planName = `${selectedPlan} Trial`;
        
        // Track PURCHASE event - Critical for Meta ROAS tracking
        console.log("[Meta Pixel] Firing Purchase event:", { value: purchaseValue, plan: planName });
        pixelEvents.purchase(purchaseValue, `subscription-${selectedPlan}`, planName);
        
        // Also track Subscribe event for additional tracking
        pixelEvents.subscribe(purchaseValue, planName);
        
        // Mark this session as tracked to prevent duplicates
        localStorage.setItem("astrorekha_tracked_purchase_session", sessionId);
      }
      
      // User just completed payment - analyze palm and add coins
      analyzePalmAfterPayment();
    }
  }, [searchParams]);

  useEffect(() => {
    const handlePageShow = () => setIsProcessing(false);
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  useEffect(() => {
    if (searchParams.get("cancelled") === "true") {
      setIsProcessing(false);
    }
  }, [searchParams]);

  const analyzePalmAfterPayment = async () => {
    // Check if reading already exists
    const userId = generateUserId();
    try {
      const { data: existing } = await supabase.from("palm_readings").select("reading").eq("id", userId).single();
      if (existing?.reading) {
        return;
      }
    } catch (err) {
      console.error("Error checking existing reading:", err);
    }

    // Get palm image from localStorage
    const palmImage = localStorage.getItem("astrorekha_palm_image");
    if (!palmImage) return;

    setIsAnalyzingPalm(true);

    try {
      const birthDate = `${birthYear}-${birthMonth}-${birthDay}`;
      const zodiacSign = calculateZodiacSign(birthMonth, birthDay);

      const response = await fetch("/api/palm-reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageData: palmImage,
          birthDate,
          zodiacSign,
        }),
      });

      const result = await response.json();

      if (result.success && result.reading) {
        await supabase.from("palm_readings").upsert({
          id: userId,
          reading: result.reading,
          palm_image_url: palmImage,
          created_at: new Date().toISOString(),
          birth_date: birthDate,
          zodiac_sign: zodiacSign,
        }, { onConflict: "id" });
      }
    } catch (err) {
      console.error("Palm analysis error:", err);
    } finally {
      setIsAnalyzingPalm(false);
    }
  };

  // Helper function to calculate zodiac sign
  const calculateZodiacSign = (month: string | number | null, day: string | number | null): string => {
    const m = Number(month);
    const d = Number(day);
    if (!m || !d) return "Aries";
    
    const signs = [
      { sign: "Capricorn", end: [1, 19] }, { sign: "Aquarius", end: [2, 18] },
      { sign: "Pisces", end: [3, 20] }, { sign: "Aries", end: [4, 19] },
      { sign: "Taurus", end: [5, 20] }, { sign: "Gemini", end: [6, 20] },
      { sign: "Cancer", end: [7, 22] }, { sign: "Leo", end: [8, 22] },
      { sign: "Virgo", end: [9, 22] }, { sign: "Libra", end: [10, 22] },
      { sign: "Scorpio", end: [11, 21] }, { sign: "Sagittarius", end: [12, 21] },
      { sign: "Capricorn", end: [12, 31] }
    ];
    
    for (const { sign, end } of signs) {
      if (m < end[0] || (m === end[0] && d <= end[1])) return sign;
    }
    return "Capricorn";
  };

  const handleSelectOffer = (offerId: string) => {
    setSelectedOffers(prev => {
      const newSet = new Set(prev);
      
      if (offerId === "ultra-pack") {
        // Ultra pack is exclusive - selecting it deselects others
        if (newSet.has("ultra-pack")) {
          newSet.delete("ultra-pack");
        } else {
          newSet.clear();
          newSet.add("ultra-pack");
        }
      } else {
        // Individual items - toggle selection, but deselect ultra-pack if selected
        if (newSet.has("ultra-pack")) {
          newSet.delete("ultra-pack");
        }
        
        if (newSet.has(offerId)) {
          newSet.delete(offerId);
        } else {
          newSet.add(offerId);
        }
      }
      
      return newSet;
    });
  };

  const calculateTotal = () => {
    if (selectedOffers.has("ultra-pack")) return "₹999";
    const count = selectedOffers.size;
    if (count === 0) return "₹0";
    return `₹${count * 499}`;
  };

  const calculateTotalINR = () => {
    if (selectedOffers.has("ultra-pack")) return 999;
    return selectedOffers.size * 499;
  };

  const handleGetReport = async () => {
    if (selectedOffers.size === 0) return;

    setPaymentError("");
    setIsProcessing(true);

    try {
      const totalINR = calculateTotalINR();
      const offerNames = Array.from(selectedOffers).join(", ");

      const response = await fetch("/api/payu/initiate-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: generateUserId(),
          bundleId: selectedOffers.has("ultra-pack") ? "ultra-pack" : Array.from(selectedOffers).join(","),
          type: "upsell",
          email: localStorage.getItem("astrorekha_email") || "",
          firstName: localStorage.getItem("astrorekha_name") || "Customer",
        }),
      });

      const data = await response.json();

      if (data.txnId) {
        // Track pixel events for upsell checkout
        pixelEvents.initiateCheckout(totalINR, Array.from(selectedOffers));
        pixelEvents.addPaymentInfo(totalINR, `Upsell: ${offerNames}`);

        const bolt = (window as any).bolt;
        bolt.launch({
          key: data.key,
          txnid: data.txnId,
          hash: data.hash,
          amount: data.amount,
          firstname: data.firstName,
          email: data.email,
          phone: "",
          productinfo: data.productInfo,
          udf1: data.udf1,
          udf2: data.udf2,
          udf3: data.udf3,
          udf4: data.udf4,
          udf5: data.udf5,
          surl: `${window.location.origin}/api/payu/success`,
          furl: `${window.location.origin}/api/payu/failure`,
        }, {
          responseHandler: async (response: any) => {
            if (response.response.txnStatus === "SUCCESS") {
              await fetch("/api/payu/verify-payment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  txnid: response.response.txnid,
                  mihpayid: response.response.mihpayid,
                  status: "success",
                  hash: response.response.hash,
                  amount: data.amount,
                  productinfo: data.productInfo,
                  firstname: data.firstName,
                  email: data.email,
                  udf1: data.udf1,
                  udf2: data.udf2,
                  udf3: data.udf3,
                  udf4: data.udf4,
                  udf5: data.udf5,
                  key: data.key,
                }),
              });
              pixelEvents.purchase(totalINR, `upsell-${offerNames}`, offerNames);
              setIsProcessing(false);
              router.push("/onboarding/step-19");
            } else {
              setPaymentError("Payment failed. Please try again.");
              setIsProcessing(false);
            }
          },
          catchException: (error: any) => {
            console.error("PayU Bolt error:", error);
            setPaymentError("Payment was cancelled or failed.");
            setIsProcessing(false);
          }
        });
      } else {
        setPaymentError(data.error || "Unable to start checkout. Please try again.");
        setIsProcessing(false);
      }
    } catch (error) {
      console.error("Upsell checkout error:", error);
      setPaymentError("Something went wrong. Please try again.");
      setIsProcessing(false);
    }
  };

  const handleSkip = () => {
    // User skips upsells - only palm reading is unlocked (from base subscription)
    router.push("/onboarding/step-19");
  };

  // Show loading while checking authorization
  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
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
      {/* Progress indicator */}
      <div className="px-6 pt-6 pb-4">
        <div className="w-full max-w-md mx-auto">
          <div className="flex items-start">
            {progressSteps.map((step, index) => (
              <div key={step.label} className="flex items-center flex-1 last:flex-none">
                {/* Circle and label column */}
                <div className="flex flex-col items-center">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                      step.completed
                        ? "bg-primary text-primary-foreground"
                        : step.active
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {step.completed ? <Check className="w-4 h-4" /> : index + 1}
                  </div>
                  <span
                    className={`text-[10px] text-center mt-1 w-14 ${
                      step.active ? "text-primary font-medium" : "text-muted-foreground"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {/* Connector line */}
                {index < progressSteps.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-1 mt-3.5 ${
                      step.completed ? "bg-primary" : "bg-muted"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center px-6 py-4 overflow-y-auto">
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xl md:text-2xl font-bold text-center mb-6"
        >
          Choose your sign-up offer!
        </motion.h1>

        {/* Offer cards */}
        <div className="w-full max-w-sm space-y-3 mb-6">
          {upsellOffers.map((offer, index) => (
            <motion.button
              key={offer.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + index * 0.1 }}
              onClick={() => handleSelectOffer(offer.id)}
              className={`w-full p-4 rounded-xl border-2 transition-all flex items-center gap-4 ${
                selectedOffers.has(offer.id)
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card hover:border-primary/50"
              }`}
            >
              {/* Icon */}
              <div className="w-12 h-12 rounded-lg bg-card border border-border flex items-center justify-center overflow-hidden flex-shrink-0">
                {offer.icon.startsWith("/") ? (
                  <Image
                    src={offer.icon}
                    alt={offer.name}
                    width={40}
                    height={40}
                    className="object-cover"
                  />
                ) : (
                  <span className="text-2xl">{offer.icon}</span>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 text-left">
                <h3 className="font-semibold text-sm">{offer.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-bold">{offer.price}</span>
                  <span className="text-muted-foreground text-xs line-through">
                    (was {offer.originalPrice})
                  </span>
                  <span className="text-primary text-xs font-semibold">
                    {offer.discount}
                  </span>
                </div>
              </div>

              {/* Selection indicator */}
              <div
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  selectedOffers.has(offer.id)
                    ? "border-primary bg-primary"
                    : "border-muted-foreground"
                }`}
              >
                {selectedOffers.has(offer.id) && (
                  <Check className="w-4 h-4 text-primary-foreground" />
                )}
              </div>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Bottom section */}
      <div className="p-6 space-y-3">
        {/* Payment Error Message */}
        {paymentError && (
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
            <p className="text-red-400 text-sm text-center">{paymentError}</p>
          </div>
        )}

        <Button
          onClick={handleGetReport}
          disabled={selectedOffers.size === 0 || isProcessing}
          className="w-full h-14 text-lg font-semibold"
          size="lg"
        >
          {isProcessing 
            ? "Processing..." 
            : selectedOffers.size === 0 
              ? "Select an offer" 
              : `Get my reports - ${calculateTotal()}`}
        </Button>

        <button
          onClick={handleSkip}
          disabled={isProcessing}
          className="w-full text-muted-foreground text-sm underline hover:text-foreground transition-colors"
        >
          No, I don&apos;t want to get my reports
        </button>

        <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
          Purchase the Ultra Pack 3 in 1 for ₹999, charged via Razorpay.
          By clicking &quot;Get my reports&quot;, you confirm your purchase. The report will be
          delivered electronically after purchase. All sales are final and non-refundable.
        </p>
      </div>
    </motion.div>
  );
}

export default function Step18Page() {
  return (
    <>
      <Suspense
        fallback={
          <div className="min-h-screen bg-background flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">Loading...</p>
            </div>
          </div>
        }
      >
        <Step18Content />
      </Suspense>
      {/* Load PayU Bolt script only on this page */}
      <Script src="https://jssdk.payu.in/bolt/bolt.min.js" strategy="afterInteractive" />
    </>
  );
}
