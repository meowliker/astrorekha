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
import Link from "next/link";
import Script from "next/script";
import { usePricing } from "@/hooks/usePricing";

const predictionLabels = [
  { text: "Children", emoji: "👶", top: "15%", left: "20%", rotation: -15 },
  { text: "Marriage", emoji: "💕", top: "35%", left: "55%", rotation: 5 },
  { text: "Big change at", emoji: "✨", top: "55%", left: "15%", rotation: -10 },
];

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

// Generate compatibility stats
function generateCompatibilityStats() {
  return [
    { label: "Sexual", color: "#EF6B6B", value: Math.floor(Math.random() * 15) + 85 },
    { label: "Emotional", color: "#4ECDC4", value: Math.floor(Math.random() * 20) + 75 },
    { label: "Intellectual", color: "#F5C542", value: Math.floor(Math.random() * 15) + 85 },
    { label: "Spiritual", color: "#8B5CF6", value: Math.floor(Math.random() * 20) + 75 },
  ];
}

// Testimonials data
const testimonials = [
  {
    name: "Priya",
    country: "India",
    flag: "🇮🇳",
    time: "4 days ago",
    review: "Finally a palm reading app that actually works. Scanned my palm and got insights about my career path that were spot on. The AI guide feels like talking to a real astrologer.",
  },
  {
    name: "Rahul",
    country: "India",
    flag: "🇮🇳",
    time: "1 week ago",
    review: "The birth chart analysis was incredibly detailed. Asked questions about my love line and got thoughtful, personal answers. This app feels magical and premium at the same time.",
  },
  {
    name: "Ananya",
    country: "India",
    flag: "🇮🇳",
    time: "5 days ago",
    review: "Going through a tough phase and this app gave me so much clarity. The reading explained why things weren't working out and what kind of energy I should seek next. Truly healing.",
  },
];

// Scrolling emails for social proof
const scrollingEmails = [
  "Kev***@protonmail.com",
  "Ali***@zoho.com",
  "Sar***@gmail.com",
  "Mik***@outlook.com",
  "Emm***@yahoo.com",
  "Dav***@icloud.com",
];

// Bundle pricing plans are now fetched dynamically via usePricing hook

export default function BundlePricingPage() {
  const router = useRouter();
  const { pricing } = usePricing();
  const bundlePlans = pricing.bundles.filter(b => b.active);
  
  const [selectedPlan, setSelectedPlan] = useState<string>("palm-birth");
  const [agreedToTerms, setAgreedToTerms] = useState(true);
  const [paymentError, setPaymentError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [palmImage, setPalmImage] = useState<string | null>(null);
  const [croppedPalmImage, setCroppedPalmImage] = useState<string | null>(null);
  const [readingStats, setReadingStats] = useState<{ label: string; color: string; value: number }[]>([]);
  const [compatibilityStats, setCompatibilityStats] = useState<{ label: string; color: string; value: number }[]>([]);
  const paymentSectionRef = useRef<HTMLDivElement>(null);
  const testimonialSectionRef = useRef<HTMLDivElement>(null);
  const birthChartSectionRef = useRef<HTMLDivElement>(null);
  const getFullReportRef = useRef<HTMLButtonElement>(null);
  const [showStickyCTA, setShowStickyCTA] = useState(false);
  
  const { userId } = useUserStore();

  useEffect(() => {
    const handlePageShow = () => setIsProcessing(false);
    window.addEventListener("pageshow", handlePageShow);
    
    // Set flow type in localStorage
    localStorage.setItem("astrorekha_onboarding_flow", "flow-b");
    
    // Route protection: Check if user has already completed payment
    const hasCompletedPayment = localStorage.getItem("astrorekha_payment_completed") === "true";
    const hasCompletedRegistration = localStorage.getItem("astrorekha_registration_completed") === "true";
    
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
    const savedImage = localStorage.getItem("astrorekha_palm_image");
    if (savedImage) {
      setPalmImage(savedImage);
    }
    setReadingStats(generateRandomStats());
    setCompatibilityStats(generateCompatibilityStats());
  }, []);

  // Sticky CTA visibility
  useEffect(() => {
    let isInContentSection = false;
    let isGetFullReportVisible = false;

    const sectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.target === testimonialSectionRef.current || entry.target === birthChartSectionRef.current) {
            isInContentSection = entry.isIntersecting;
          }
        });
        setShowStickyCTA(isInContentSection && !isGetFullReportVisible);
      },
      { threshold: 0.1 }
    );

    const buttonObserver = new IntersectionObserver(
      ([entry]) => {
        isGetFullReportVisible = entry.isIntersecting;
        setShowStickyCTA(isInContentSection && !isGetFullReportVisible);
      },
      { threshold: 0.5 }
    );

    if (testimonialSectionRef.current) sectionObserver.observe(testimonialSectionRef.current);
    if (birthChartSectionRef.current) sectionObserver.observe(birthChartSectionRef.current);
    if (getFullReportRef.current) buttonObserver.observe(getFullReportRef.current);

    return () => {
      sectionObserver.disconnect();
      buttonObserver.disconnect();
    };
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
    localStorage.setItem("astrorekha_selected_plan", selectedPlan);
    localStorage.setItem("astrorekha_onboarding_flow", "flow-b");
    
    // Track AddToCart
    pixelEvents.addToCart(plan.price, plan.name);

    // Track Brevo checkout_started for abandoned checkout automation (30-min email)
    const userEmail = localStorage.getItem("astrorekha_email");
    if (userEmail) {
      fetch("/api/track-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: userEmail,
          event: "checkout_started",
          properties: { plan: selectedPlan, price: plan.price, flow: "bundle" },
        }),
      }).catch(() => {});
    }

    try {
      const response = await fetch("/api/payu/initiate-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "bundle",
          bundleId: selectedPlan,
          userId: userId || generateUserId(),
          email: localStorage.getItem("astrorekha_email") || "",
          firstName: localStorage.getItem("astrorekha_name") || "Customer",
        }),
      });

      const data = await response.json();

      if (data.txnId) {
        pixelEvents.initiateCheckout(plan.price, [plan.name]);
        pixelEvents.addPaymentInfo(plan.price, plan.name);
        
        // Open PayU Bolt checkout
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
              // Verify payment on server
              const verifyRes = await fetch("/api/payu/verify-payment", {
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
              const verifyData = await verifyRes.json();
              if (verifyData.success) {
                localStorage.setItem("astrorekha_payment_completed", "true");
                localStorage.setItem("astrorekha_purchase_type", "one-time");
                localStorage.setItem("astrorekha_bundle_id", selectedPlan);
                pixelEvents.purchase(plan.price, selectedPlan, plan.name);
                router.push("/onboarding/bundle-upsell");
              } else {
                setPaymentError("Payment verification failed. Please contact support.");
                setIsProcessing(false);
              }
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
      className="flex flex-col bg-background"
    >
      {/* Section 1: Palm Reading Ready - Full Screen */}
      <div className="min-h-screen flex flex-col items-center justify-center px-6 py-8">
        {/* Header with Logo */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-1 mb-2"
        >
          <img src="/logo.png" alt="AstroRekha" className="w-20 h-20 object-contain" />
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
          Is Ready!
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
              <img
                src={croppedPalmImage}
                alt="Your palm"
                className="w-full h-full object-cover opacity-80"
              />
            ) : (
              <img
                src="/palm.png"
                alt="Your palm reading"
                className="w-[200px] h-[240px] object-contain opacity-80"
              />
            )}
          </div>

          {/* Prediction labels */}
          {predictionLabels.map((label, index) => (
            <motion.div
              key={label.text}
              initial={{ opacity: 0, scale: 0, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.6 + index * 0.2, type: "spring", stiffness: 200 }}
              className="absolute bg-card/90 backdrop-blur-sm border border-border rounded-lg px-3 py-1.5 shadow-lg"
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
      </div>

      {/* Section 2: Payment Section */}
      <div ref={paymentSectionRef} className="min-h-screen flex flex-col items-center px-6 pt-4 pb-8">
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
        <div className="w-full max-w-sm space-y-4 mb-6">
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
          <div className="w-full max-w-sm bg-destructive/10 text-destructive text-sm p-3 rounded-lg mb-4">
            {paymentError}
          </div>
        )}

        {/* CTA Button */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="w-full max-w-sm mb-6"
        >
          <Button
            ref={getFullReportRef}
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
            <span className="text-sm">Guaranteed safe checkout</span>
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
                    src="/elysia.png"
                    alt="Elysia"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "/logo.png";
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
            Elysia provides personalized palm and astrological readings to help you understand yourself better and navigate life&apos;s journey.
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
              <p className="text-xs text-muted-foreground">Let&apos;s uncover them now</p>
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
                <span className="text-[#EF6B6B] font-medium">Love</span> for you means passion and trust. We&apos;ve highlighted the signs that can match your loyalty and fire.
              </p>
            </div>
            <div className="flex gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500/30 to-pink-500/30 flex items-center justify-center flex-shrink-0">
                <span className="text-lg">💍</span>
              </div>
              <p className="text-sm text-muted-foreground">
                In <span className="text-[#8B5CF6] font-medium">marriage</span>, you value loyalty and deep commitment. We&apos;ve found the signs that can build...
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
            <span className="text-3xl font-bold text-emerald-400">4.8</span>
            <div>
              <p className="text-sm text-muted-foreground">rating on <span className="text-emerald-400 font-semibold">Trustpilot</span></p>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <div key={star} className="w-4 h-4 bg-emerald-500 flex items-center justify-center">
                    <span className="text-[10px] text-white">★</span>
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
              <h3 className="text-4xl font-bold text-blue-400 mb-2">3.4 million</h3>
              <p className="text-sm text-muted-foreground italic">accurate predictions have been delivered</p>
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
                        Verified user
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{testimonial.flag} {testimonial.country}</span>
                      <span>•</span>
                      <span>{testimonial.time}</span>
                    </div>
                    <div className="flex gap-0.5 mt-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <span key={star} className="text-amber-400 text-xs">★</span>
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
            <h3 className="text-xl font-bold text-center mb-6">Your birth chart analysis</h3>

            {/* Message bubble with Elysia */}
            <div className="relative bg-white rounded-2xl p-4 mb-4">
              <p className="text-sm text-slate-700 text-center">
                Your chart shows a <span className="text-cyan-500 font-medium">rare spark</span> — let&apos;s uncover how you can use this power!
              </p>
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white rotate-45" />
            </div>

            {/* Elysia avatar */}
            <div className="flex justify-center mb-6">
              <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-amber-500/50">
                <img
                  src="/elysia.png"
                  alt="Elysia"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/logo.png";
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
            <h4 className="text-lg font-bold text-center mb-4">Your core personality</h4>

            <div className="space-y-4 mb-4">
              <div className="flex gap-3">
                <span className="text-2xl text-cyan-400">☀️</span>
                <p className="text-sm text-muted-foreground">
                  Your <span className="text-cyan-400 font-medium">Sun sign</span> reveals you are naturally intuitive, emotionally intelligent, and deeply connected to those around you.
                </p>
              </div>
              <div className="flex gap-3">
                <span className="text-2xl text-cyan-400">🌙</span>
                <p className="text-sm text-muted-foreground">
                  Your <span className="text-cyan-400 font-medium">Moon sign</span> shows your inner world is rich with empathy and creativity. Others see you as nurturing and protective.
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
              { emoji: "💬", title: "Anytime Advisor Access", desc: "Chat with Elysia anytime" },
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
          className="w-full max-w-sm pb-24"
        >
          {/* Logo */}
          <div className="flex flex-col items-center mb-6">
            <img
              src="/logo.png"
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
      
      {/* Load PayU Bolt script eagerly for faster checkout */}
      <Script src="https://jssdk.payu.in/bolt/bolt.min.js" strategy="afterInteractive" />
    </motion.div>
  );
}
