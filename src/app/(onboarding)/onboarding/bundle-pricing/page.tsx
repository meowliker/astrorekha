"use client";

import { motion } from "framer-motion";
import { useEffect, useState, useRef } from "react";
import { fadeUp } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Check, Shield, Star, Sparkles } from "lucide-react";
import { generateUserId } from "@/lib/user-profile";
import { pixelEvents } from "@/lib/pixel-events";
import { detectHandLandmarks } from "@/lib/palm-detection";
import { useUserStore } from "@/lib/user-store";

// Generate random stats with some variation for authenticity
function generateRandomStats() {
  const baseStats = [
    { label: "Love", color: "#EF6B6B", min: 72, max: 95 },
    { label: "Health", color: "#4ECDC4", min: 68, max: 92 },
    { label: "Wisdom", color: "#F5C542", min: 65, max: 88 },
    { label: "Career", color: "#8B5CF6", min: 58, max: 85 },
  ];
  return baseStats.map((stat) => ({
    label: stat.label,
    color: stat.color,
    value: Math.floor(Math.random() * (stat.max - stat.min + 1)) + stat.min,
  }));
}

// Bundle pricing plans
const bundlePlans = [
  {
    id: "bundle-palm",
    name: "Palm Reading",
    price: "$13.99",
    priceValue: 13.99,
    originalPrice: "$17.49",
    discount: "20% OFF",
    description: "Personalized palm reading report delivered instantly.",
    features: ["palmReading"],
    featureList: [
      "Complete palm line analysis",
      "Life, heart, head line insights",
      "Personality traits revealed",
    ],
  },
  {
    id: "bundle-palm-birth",
    name: "Palm + Birth Chart",
    price: "$18.99",
    priceValue: 18.99,
    originalPrice: "$37.98",
    discount: "50% OFF",
    description: "Deep palm insights plus your full zodiac reading.",
    features: ["palmReading", "birthChart"],
    featureList: [
      "Everything in Palm Reading",
      "Complete birth chart analysis",
      "Planetary positions & houses",
    ],
    popular: true,
  },
  {
    id: "bundle-full",
    name: "Palm + Birth Chart + Compatibility Report Bundle",
    price: "$37.99",
    priceValue: 37.99,
    originalPrice: "$126.63",
    discount: "70% OFF",
    description: "Complete cosmic package with all reports included.",
    features: ["palmReading", "birthChart", "compatibilityTest"],
    featureList: [
      "Everything in Palm + Birth Chart",
      "Full compatibility analysis",
      "Partner matching report",
    ],
    limitedOffer: true,
  },
];

export default function BundlePricingPage() {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<string>("bundle-palm-birth");
  const [agreedToTerms, setAgreedToTerms] = useState(true);
  const [paymentError, setPaymentError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [palmImage, setPalmImage] = useState<string | null>(null);
  const [croppedPalmImage, setCroppedPalmImage] = useState<string | null>(null);
  const [readingStats, setReadingStats] = useState<{ label: string; color: string; value: number }[]>([]);
  const paymentSectionRef = useRef<HTMLDivElement>(null);
  
  const { firebaseUserId } = useUserStore();

  useEffect(() => {
    const handlePageShow = () => setIsProcessing(false);
    window.addEventListener("pageshow", handlePageShow);
    
    // Set flow type in localStorage
    localStorage.setItem("palmcosmic_onboarding_flow", "flow-b");
    
    // Route protection: Check if user has already completed payment
    const hasCompletedPayment = localStorage.getItem("palmcosmic_payment_completed") === "true";
    const hasCompletedRegistration = localStorage.getItem("palmcosmic_registration_completed") === "true";
    
    if (hasCompletedRegistration) {
      router.replace("/home");
      return;
    } else if (hasCompletedPayment) {
      router.replace("/onboarding/bundle-upsell");
      return;
    }
    
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [router]);

  // Load saved palm image and generate stats
  useEffect(() => {
    const savedImage = localStorage.getItem("palmcosmic_palm_image");
    if (savedImage) {
      setPalmImage(savedImage);
    }
    setReadingStats(generateRandomStats());
  }, []);

  // Crop palm image
  useEffect(() => {
    if (!palmImage) return;

    (async () => {
      try {
        const img = new window.Image();
        img.crossOrigin = "anonymous";
        img.src = palmImage;
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Failed to load palm image"));
        });

        const results = await detectHandLandmarks(img);
        const landmarks = results?.landmarks?.[0];
        if (!landmarks || landmarks.length === 0) {
          setCroppedPalmImage(palmImage);
          return;
        }

        let minX = 1, minY = 1, maxX = 0, maxY = 0;
        for (const p of landmarks) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }

        const pad = 0.12;
        minX = Math.max(0, minX - pad);
        minY = Math.max(0, minY - pad);
        maxX = Math.min(1, maxX + pad);
        maxY = Math.min(1, maxY + pad);

        const sx = Math.floor(minX * img.width);
        const sy = Math.floor(minY * img.height);
        const sw = Math.max(1, Math.ceil((maxX - minX) * img.width));
        const sh = Math.max(1, Math.ceil((maxY - minY) * img.height));

        const canvas = document.createElement("canvas");
        canvas.width = sw;
        canvas.height = sh;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setCroppedPalmImage(palmImage);
          return;
        }

        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        const cropped = canvas.toDataURL("image/jpeg", 0.92);
        setCroppedPalmImage(cropped);
      } catch {
        setCroppedPalmImage(palmImage);
      }
    })();
  }, [palmImage]);

  const scrollToPayment = () => {
    paymentSectionRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handlePurchase = async () => {
    setPaymentError("");
    setIsProcessing(true);
    
    const plan = bundlePlans.find(p => p.id === selectedPlan);
    if (!plan) {
      setPaymentError("Please select a plan");
      setIsProcessing(false);
      return;
    }
    
    // Save selected plan to localStorage
    localStorage.setItem("palmcosmic_selected_plan", selectedPlan);
    localStorage.setItem("palmcosmic_onboarding_flow", "flow-b");
    
    // Track AddToCart
    pixelEvents.addToCart(plan.priceValue, plan.name);

    // Track Brevo checkout_started for abandoned checkout automation (30-min email)
    const userEmail = localStorage.getItem("palmcosmic_email");
    if (userEmail) {
      fetch("/api/track-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: userEmail,
          event: "checkout_started",
          properties: { plan: selectedPlan, price: plan.priceValue, flow: "bundle" },
        }),
      }).catch(() => {});
    }

    try {
      const response = await fetch("/api/stripe/create-bundle-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bundleId: selectedPlan,
          userId: firebaseUserId || generateUserId(),
          email: localStorage.getItem("palmcosmic_email") || "",
          flow: "flow-b",
        }),
      });

      const data = await response.json();

      if (data.url) {
        pixelEvents.initiateCheckout(plan.priceValue, [plan.name]);
        pixelEvents.addPaymentInfo(plan.priceValue, plan.name);
        window.location.href = data.url;
      } else if (data.error) {
        setPaymentError(data.error);
        setIsProcessing(false);
      } else {
        setPaymentError("Unable to start checkout. Please try again.");
        setIsProcessing(false);
      }
    } catch (error) {
      console.error("Checkout error:", error);
      setPaymentError("Something went wrong. Please try again.");
      setIsProcessing(false);
    }
  };

  const selectedPlanData = bundlePlans.find(p => p.id === selectedPlan);

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={fadeUp}
      className="flex flex-col bg-background min-h-screen"
    >
      {/* Header */}
      <div className="flex flex-col items-center px-6 pt-8 pb-4">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-1 mb-4"
        >
          <img src="/logo.png" alt="PalmCosmic" className="w-16 h-16 object-contain" />
          <span className="text-sm text-muted-foreground">PalmCosmic</span>
        </motion.div>

        {/* Palm Reading Stats Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="w-full max-w-sm bg-card/50 backdrop-blur-sm border border-border rounded-2xl p-5 mb-6"
        >
          {/* Palm image with unlock badge */}
          <div className="relative w-full h-48 rounded-xl overflow-hidden mb-4 bg-gradient-to-b from-muted/50 to-muted flex items-center justify-center">
            {palmImage ? (
              <img
                src={palmImage}
                alt="Your palm"
                className="w-full h-full object-cover opacity-70"
              />
            ) : (
              <img
                src="/palm.png"
                alt="Your palm"
                className="w-32 h-40 object-contain opacity-70"
              />
            )}
          </div>

          <h3 className="text-lg font-semibold text-center mb-4">Your palm reading</h3>

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
                    transition={{ delay: 0.5 + index * 0.15, duration: 0.8 }}
                  />
                </div>
                <span className="text-sm text-muted-foreground w-10 text-right">{stat.value}%</span>
              </div>
            ))}
          </div>

          {/* Reading descriptions */}
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              Your <span className="text-[#EF6B6B] font-medium">Heart Line</span> shows that you are very passionate and freely express your thoughts and feelings.
            </p>
            <p>
              Your <span className="text-[#4ECDC4] font-medium">Life Line</span> depicts that your physical health requires hard work to improve...
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

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-2xl font-bold text-center mb-2"
          ref={paymentSectionRef}
        >
          Choose Your Reading
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-muted-foreground text-center text-sm mb-6"
        >
          One-time payment • Lifetime access
        </motion.p>
      </div>

      {/* Pricing Cards */}
      <div className="px-4 pb-6 space-y-4">
        {bundlePlans.map((plan, index) => (
          <motion.div
            key={plan.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + index * 0.1 }}
            onClick={() => setSelectedPlan(plan.id)}
            className={`relative rounded-2xl border-2 p-4 cursor-pointer transition-all ${
              selectedPlan === plan.id
                ? "border-primary bg-primary/5"
                : "border-border/50 bg-card/50"
            } ${plan.popular ? "ring-2 ring-primary/50" : ""}`}
          >
            {/* Badge */}
            {plan.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs px-4 py-1 rounded-full font-semibold flex items-center gap-1">
                <Star className="w-3 h-3" /> Most Popular
              </div>
            )}
            {plan.limitedOffer && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-cyan-500 to-teal-500 text-white text-xs px-4 py-1 rounded-full font-semibold flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Limited Offer
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
                    {plan.discount}
                  </span>
                </div>
                <p className="text-muted-foreground text-sm mb-3">{plan.description}</p>
                
                {/* Price */}
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-2xl font-bold text-primary">{plan.price}</span>
                  <span className="text-muted-foreground line-through text-sm">{plan.originalPrice}</span>
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

      {/* Terms & CTA */}
      <div className="px-6 pb-8 mt-auto">
        {/* Terms checkbox */}
        <label className="flex items-start gap-3 mb-4 cursor-pointer">
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

        {/* Error message */}
        {paymentError && (
          <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg mb-4">
            {paymentError}
          </div>
        )}

        {/* CTA Button */}
        <Button
          onClick={handlePurchase}
          disabled={!agreedToTerms || isProcessing}
          className="w-full h-14 text-lg font-semibold"
          size="lg"
        >
          {isProcessing ? (
            <span className="flex items-center gap-2">
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Processing...
            </span>
          ) : (
            `Get My Reading - ${selectedPlanData?.price}`
          )}
        </Button>

        {/* Trust badges */}
        <div className="flex items-center justify-center gap-4 mt-4 text-muted-foreground text-xs">
          <div className="flex items-center gap-1">
            <Shield className="w-4 h-4" />
            <span>Secure checkout</span>
          </div>
          <div className="flex items-center gap-1">
            <span>💳</span>
            <span>30-day guarantee</span>
          </div>
        </div>

        {/* Payment methods */}
        <div className="flex items-center justify-center gap-3 mt-4">
          <div className="bg-white text-blue-600 font-bold text-xs px-2 py-1 rounded">VISA</div>
          <div className="bg-gradient-to-r from-red-500 to-yellow-500 text-white font-bold text-xs px-2 py-1 rounded">MC</div>
          <div className="bg-blue-500 text-white font-bold text-xs px-2 py-1 rounded">AMEX</div>
          <div className="bg-blue-700 text-white font-bold text-xs px-2 py-1 rounded">PayPal</div>
        </div>
      </div>
    </motion.div>
  );
}
