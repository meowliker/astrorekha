"use client";

import { motion } from "framer-motion";
import { Suspense, useEffect, useState, useRef, useMemo } from "react";
import { fadeUp } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Shield } from "lucide-react";
import Link from "next/link";
import { generateUserId } from "@/lib/user-profile";
import { pixelEvents } from "@/lib/pixel-events";
import { detectHandLandmarks } from "@/lib/palm-detection";
import { useOnboardingStore } from "@/lib/onboarding-store";
import { useUserStore } from "@/lib/user-store";

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

// Zodiac data
const zodiacSigns = [
  { name: "Aries", symbol: "♈", element: "Fire", dates: "Mar 21 - Apr 19" },
  { name: "Taurus", symbol: "♉", element: "Earth", dates: "Apr 20 - May 20" },
  { name: "Gemini", symbol: "♊", element: "Air", dates: "May 21 - Jun 20" },
  { name: "Cancer", symbol: "♋", element: "Water", dates: "Jun 21 - Jul 22" },
  { name: "Leo", symbol: "♌", element: "Fire", dates: "Jul 23 - Aug 22" },
  { name: "Virgo", symbol: "♍", element: "Earth", dates: "Aug 23 - Sep 22" },
  { name: "Libra", symbol: "♎", element: "Air", dates: "Sep 23 - Oct 22" },
  { name: "Scorpio", symbol: "♏", element: "Water", dates: "Oct 23 - Nov 21" },
  { name: "Sagittarius", symbol: "♐", element: "Fire", dates: "Nov 22 - Dec 21" },
  { name: "Capricorn", symbol: "♑", element: "Earth", dates: "Dec 22 - Jan 19" },
  { name: "Aquarius", symbol: "♒", element: "Air", dates: "Jan 20 - Feb 18" },
  { name: "Pisces", symbol: "♓", element: "Water", dates: "Feb 19 - Mar 20" },
];

function getZodiacFromBirthYear(birthYear: string | null): typeof zodiacSigns[0] {
  // Since we only have birth year, we'll use a simple calculation
  // In reality, you'd need birth month/day for accurate zodiac
  if (!birthYear) return zodiacSigns[0];
  const year = parseInt(birthYear);
  return zodiacSigns[year % 12];
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
    name: "James",
    country: "Australia",
    flag: "🇦🇺",
    time: "4 days ago",
    review: "Finally a palm reading app that actually works. Scanned my palm and got insights about my career path that were spot on. The AI guide feels like talking to a real psychic.",
  },
  {
    name: "Marco",
    country: "United States",
    flag: "🇺🇸",
    time: "1 week ago",
    review: "Elysia is such a wonderful guide. Asked her questions about my love line and she gave thoughtful, personal answers. This app feels magical and premium at the same time.",
  },
  {
    name: "Chloe",
    country: "New Zealand",
    flag: "🇳🇿",
    time: "5 days ago",
    review: "Going through a breakup and this app gave me so much clarity. The love reading explained why things didn't work out and what kind of energy I should seek next. Truly healing.",
  },
];

// Scrolling emails for social proof
const scrollingEmails = [
  "Kevin***@protonmail.com",
  "Alice***@zoho.com",
  "Sarah***@gmail.com",
  "Mike***@outlook.com",
  "Emma***@yahoo.com",
  "David***@icloud.com",
];

const pricingPlans = [
  {
    id: "1week",
    name: "1-Week Trial",
    trialPrice: "$1",
    perDayPrice: "$0.14",
    originalPrice: "$4.99",
    trialDays: 7,
    afterTrialPrice: "$19.99",
    afterTrialPeriod: "2-Week Plan",
  },
  {
    id: "2week",
    name: "2-Week Trial",
    trialPrice: "$5.49",
    perDayPrice: "$0.39",
    originalPrice: "$10.99",
    trialDays: 14,
    afterTrialPrice: "$19.99",
    afterTrialPeriod: "2-Week Plan",
    popular: true,
  },
  {
    id: "4week",
    name: "4-Week Trial",
    trialPrice: "$9.99",
    perDayPrice: "$0.36",
    originalPrice: "$19.99",
    trialDays: 28,
    afterTrialPrice: "$29.99",
    afterTrialPeriod: "1-Month Plan",
  },
];

export default function Step17Page() {
  return (
    <Suspense fallback={null}>
      <Step17Content />
    </Suspense>
  );
}

function Step17Content() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedPlan, setSelectedPlan] = useState<string>("2week");
  const [agreedToTerms, setAgreedToTerms] = useState(true);
  const [paymentError, setPaymentError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [palmImage, setPalmImage] = useState<string | null>(null);
  const [croppedPalmImage, setCroppedPalmImage] = useState<string | null>(null);
  const paymentSectionRef = useRef<HTMLDivElement>(null);
  const testimonialSectionRef = useRef<HTMLDivElement>(null);
  const [showStickyCTA, setShowStickyCTA] = useState(false);
  const [readingStats, setReadingStats] = useState<Array<{label: string; color: string; value: number}>>([]);
  const [compatibilityStats, setCompatibilityStats] = useState<Array<{label: string; color: string; value: number}>>([]);
  const checkoutStartedRef = useRef(false);
  const [isRestoringSession, setIsRestoringSession] = useState(false);
  
  // Get user data from onboarding store
  const { gender, birthYear, birthMonth, birthDay, sunSign, moonSign, ascendantSign, setGender, setBirthDate, setBirthTime, setBirthPlace, setKnowsBirthTime, setRelationshipStatus, setGoals, setColorPreference, setElementPreference, setSigns } = useOnboardingStore();
  const { firebaseUserId, setFirebaseUserId } = useUserStore();
  
  // Refs for sticky CTA visibility
  const birthChartSectionRef = useRef<HTMLDivElement>(null);
  const getFullReportRef = useRef<HTMLButtonElement>(null);
  
  // Default zodiac sign for SSR fallback
  const defaultZodiac = { name: "Aries", symbol: "♈", element: "Fire", description: "" };
  
  // Use stored zodiac signs or fallback to calculated one
  const zodiacSign = useMemo(() => {
    if (sunSign) return sunSign;
    const calculated = getZodiacFromBirthYear(birthYear);
    return calculated || defaultZodiac;
  }, [sunSign, birthYear]);
  
  const userMoonSign = useMemo(() => {
    if (moonSign) return moonSign;
    return zodiacSign || defaultZodiac;
  }, [moonSign, zodiacSign]);
  
  const userAscendantSign = useMemo(() => {
    if (ascendantSign) return ascendantSign;
    return zodiacSign || defaultZodiac;
  }, [ascendantSign, zodiacSign]);

  useEffect(() => {
    const handlePageShow = () => setIsProcessing(false);
    window.addEventListener("pageshow", handlePageShow);

    // Session restoration: If ?email= param is present and no local user data,
    // fetch from Firestore so the user can checkout from a different browser/device
    const emailParam = searchParams.get("email");
    const hasLocalUser = !!localStorage.getItem("palmcosmic_user_id") || !!localStorage.getItem("palmcosmic_email");

    if (emailParam && !hasLocalUser) {
      setIsRestoringSession(true);
      fetch(`/api/user/restore-session?email=${encodeURIComponent(emailParam)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.userId) {
            // Restore localStorage identifiers
            localStorage.setItem("palmcosmic_user_id", data.userId);
            localStorage.setItem("palmcosmic_email", data.email);

            // Restore onboarding store
            const o = data.onboarding;
            if (o.gender) setGender(o.gender);
            if (o.birthMonth) setBirthDate(o.birthMonth, o.birthDay, o.birthYear);
            if (o.birthHour) setBirthTime(o.birthHour, o.birthMinute, o.birthPeriod);
            if (o.birthPlace) setBirthPlace(o.birthPlace);
            if (o.knowsBirthTime !== undefined) setKnowsBirthTime(o.knowsBirthTime);
            if (o.relationshipStatus) setRelationshipStatus(o.relationshipStatus);
            if (o.goals?.length) setGoals(o.goals);
            if (o.colorPreference) setColorPreference(o.colorPreference);
            if (o.elementPreference) setElementPreference(o.elementPreference);
            if (o.sunSign && o.moonSign && o.ascendantSign) {
              setSigns(o.sunSign, o.moonSign, o.ascendantSign);
            }

            // Restore user store
            setFirebaseUserId(data.userId);

            console.log("[restore-session] Session restored for:", data.email);
          }
        })
        .catch((err) => console.error("[restore-session] Failed:", err))
        .finally(() => setIsRestoringSession(false));
    }
    
    // Route protection: Check if user has already completed payment
    const hasCompletedPayment = localStorage.getItem("palmcosmic_payment_completed") === "true";
    const hasCompletedRegistration = localStorage.getItem("palmcosmic_registration_completed") === "true";
    
    if (hasCompletedRegistration) {
      // User has completed registration - redirect to app
      router.replace("/home");
      return;
    } else if (hasCompletedPayment) {
      // User has paid but not registered - redirect to upsell page
      router.replace("/onboarding/step-18");
      return;
    }
    
    // Flow B users should go to bundle-pricing, not subscription pricing
    const onboardingFlow = localStorage.getItem("palmcosmic_onboarding_flow");
    if (onboardingFlow === "flow-b") {
      router.replace("/onboarding/bundle-pricing");
      return;
    }
    
    // A/B Test: Check if user should see variant B
    const checkABTest = async () => {
      try {
        // Check if user already has an assigned variant
        const existingVariant = localStorage.getItem("palmcosmic_ab_variant");
        if (existingVariant === "B") {
          router.replace("/onboarding/a-step-17");
          return;
        }
        
        // Get or create visitor ID
        let visitorId = localStorage.getItem("palmcosmic_visitor_id");
        if (!visitorId) {
          visitorId = generateUserId();
          localStorage.setItem("palmcosmic_visitor_id", visitorId);
        }
        
        // Get A/B test assignment
        const response = await fetch(`/api/ab-test?testId=pricing-test-1&visitorId=${visitorId}`);
        const data = await response.json();
        
        if (data.variant === "B") {
          localStorage.setItem("palmcosmic_ab_variant", "B");
          router.replace("/onboarding/a-step-17");
          return;
        } else {
          localStorage.setItem("palmcosmic_ab_variant", "A");
        }
        
        // Track impression for variant A (only once per session to avoid duplicate counts)
        const impressionKey = "palmcosmic_ab_impression_A";
        if (!sessionStorage.getItem(impressionKey)) {
          sessionStorage.setItem(impressionKey, "true");
          fetch("/api/ab-test/event", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              testId: "pricing-test-1",
              variant: "A",
              eventType: "impression",
              visitorId,
            }),
          }).catch(() => {});
        }
      } catch (err) {
        console.error("A/B test check failed:", err);
        // Default to variant A on error
        localStorage.setItem("palmcosmic_ab_variant", "A");
      }
    };
    
    checkABTest();
    
    // Track ViewContent when user sees pricing page
    pixelEvents.viewContent("Subscription Plans", "pricing");
    
    // Load palm image from localStorage
    const savedImage = localStorage.getItem("palmcosmic_palm_image");
    if (savedImage) {
      setPalmImage(savedImage);
    }
    
    // Generate stats on client-side only to prevent hydration errors
    setReadingStats(generateRandomStats());
    setCompatibilityStats(generateCompatibilityStats());
    
    // Track bounce when user leaves page without starting checkout
    const trackBounce = () => {
      if (!checkoutStartedRef.current) {
        const bounceKey = "palmcosmic_ab_bounce_A";
        if (!sessionStorage.getItem(bounceKey)) {
          sessionStorage.setItem(bounceKey, "true");
          // Use sendBeacon for reliable tracking on page unload
          const data = JSON.stringify({
            testId: "pricing-test-1",
            variant: "A",
            eventType: "bounce",
            visitorId: localStorage.getItem("palmcosmic_visitor_id") || generateUserId(),
          });
          navigator.sendBeacon("/api/ab-test/event", new Blob([data], { type: "application/json" }));
        }
      }
    };
    
    window.addEventListener("beforeunload", trackBounce);
    
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("beforeunload", trackBounce);
    };
  }, [router]);

  // Intersection observer for testimonial and birth chart sections sticky CTA
  useEffect(() => {
    let isInTestimonialOrBirthChart = false;
    let isGetFullReportVisible = false;

    const sectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.target === testimonialSectionRef.current || entry.target === birthChartSectionRef.current) {
            isInTestimonialOrBirthChart = entry.isIntersecting;
          }
        });
        setShowStickyCTA(isInTestimonialOrBirthChart && !isGetFullReportVisible);
      },
      { threshold: 0.1 }
    );

    const buttonObserver = new IntersectionObserver(
      ([entry]) => {
        isGetFullReportVisible = entry.isIntersecting;
        setShowStickyCTA(isInTestimonialOrBirthChart && !isGetFullReportVisible);
      },
      { threshold: 0.5 }
    );

    if (testimonialSectionRef.current) {
      sectionObserver.observe(testimonialSectionRef.current);
    }
    if (birthChartSectionRef.current) {
      sectionObserver.observe(birthChartSectionRef.current);
    }
    if (getFullReportRef.current) {
      buttonObserver.observe(getFullReportRef.current);
    }

    return () => {
      sectionObserver.disconnect();
      buttonObserver.disconnect();
    };
  }, []);

  // Crop palm image to focus on hand
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

        let minX = 1;
        let minY = 1;
        let maxX = 0;
        let maxY = 0;
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

  const handleStartTrial = async () => {
    setPaymentError("");
    setIsProcessing(true);
    
    // Track trial initiation
    const plan = selectedPlan || "2week";
    const planPrice = plan === "1week" ? 1 : plan === "2week" ? 5.49 : 9.99;
    const planName = `${plan} Trial`;
    
    // Save selected plan to localStorage for Purchase tracking on success page
    localStorage.setItem("palmcosmic_selected_plan", plan);
    
    // Mark checkout as started to prevent bounce tracking
    checkoutStartedRef.current = true;
    
    // Track A/B test checkout_started event
    fetch("/api/ab-test/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        testId: "pricing-test-1",
        variant: "A",
        eventType: "checkout_started",
        visitorId: localStorage.getItem("palmcosmic_visitor_id") || generateUserId(),
        metadata: { plan, price: planPrice },
      }),
    }).catch(() => {});

    // Track Brevo checkout_started for abandoned checkout automation (30-min email)
    const userEmail = localStorage.getItem("palmcosmic_email");
    if (userEmail) {
      fetch("/api/track-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: userEmail,
          event: "checkout_started",
          properties: { plan, price: planPrice, variant: "A" },
        }),
      }).catch(() => {});
    }
    
    // Track AddToCart when user clicks "Start Trial"
    pixelEvents.addToCart(planPrice, planName);
    pixelEvents.startTrial(planPrice);

    try {
      // Create Stripe checkout session
      const response = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: selectedPlan,
          userId: firebaseUserId || generateUserId(),
          email: localStorage.getItem("palmcosmic_email") || "",
          abVariant: "A", // Track A/B test variant
        }),
      });

      const data = await response.json();

      if (data.url) {
        // Track InitiateCheckout before redirecting to Stripe
        pixelEvents.initiateCheckout(planPrice, [planName]);
        // Track AddPaymentInfo - user is entering payment flow
        pixelEvents.addPaymentInfo(planPrice, planName);
        // Redirect to Stripe Checkout
        window.location.href = data.url;
      } else if (data.error) {
        // Show error message on the paywall
        setPaymentError(data.error);
        setIsProcessing(false);
      } else {
        // No URL returned - show generic error
        setPaymentError("Unable to start checkout. Please try again.");
        setIsProcessing(false);
      }
    } catch (error) {
      console.error("Checkout error:", error);
      setPaymentError("Something went wrong. Please try again.");
      setIsProcessing(false);
    }
  };

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
          <img src="/logo.png" alt="PalmCosmic" className="w-20 h-20 object-contain" />
          <span className="text-sm text-muted-foreground">PalmCosmic</span>
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

      {/* Section 2: Payment Section - Full Screen with peek of palm section */}
      <div ref={paymentSectionRef} className="min-h-screen flex flex-col items-center px-6 pt-4 pb-8">
        {/* Complete Your Purchase heading */}
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-xl font-bold text-center mb-6"
        >
          Complete Your Purchase
        </motion.h2>

        {/* Pricing plans */}
        <div className="w-full max-w-sm space-y-3 mb-6">
          {pricingPlans.map((plan, index) => (
            <motion.button
              key={plan.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + index * 0.1 }}
              onClick={() => setSelectedPlan(plan.id)}
              className={`w-full p-4 rounded-xl border-2 transition-all relative ${
                selectedPlan === plan.id
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card hover:border-primary/50"
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-4 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">
                  Most popular
                </span>
              )}
              {(plan as any).bestValue && (
                <span className="absolute -top-3 left-4 bg-green-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
                  Best value
                </span>
              )}

              <div className="flex items-center justify-between">
                <div className="text-left">
                  <h3 className="font-semibold text-base">{plan.name}</h3>
                  <p className="text-xs mt-1">
                    <span className="text-primary font-semibold">{plan.trialPrice}</span>
                    {" "}
                    <span className="text-muted-foreground line-through">{plan.originalPrice}</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    then {plan.afterTrialPeriod} {plan.afterTrialPrice}
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-2xl font-bold">{plan.trialPrice}</span>
                  <p className="text-xs text-muted-foreground uppercase">
                    {plan.trialDays === 7 ? "1-WEEK" : plan.trialDays === 14 ? "2-WEEK" : plan.trialDays === 28 ? "4-WEEK" : ""} trial
                  </p>
                </div>
              </div>
            </motion.button>
          ))}
        </div>

        {/* Start Trial button */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="w-full max-w-sm mb-4"
        >
{/* Payment Error Message */}
          {paymentError && (
            <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
              <p className="text-red-400 text-sm text-center">{paymentError}</p>
            </div>
          )}

          <Button
            onClick={handleStartTrial}
            disabled={!agreedToTerms || isProcessing}
            className="w-full h-14 text-lg font-semibold"
            size="lg"
          >
            {isProcessing ? "Processing..." : selectedPlan === "yearly" ? "Subscribe Now" : "Start Trial and Continue"}
          </Button>
        </motion.div>

        {/* Terms checkbox */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="w-full max-w-sm mb-4"
        >
          <label className="flex items-start gap-3 cursor-pointer">
            <button
              onClick={() => setAgreedToTerms(!agreedToTerms)}
              className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
                agreedToTerms
                  ? "bg-primary border-primary"
                  : "border-muted-foreground"
              }`}
            >
              {agreedToTerms && <Check className="w-3 h-3 text-primary-foreground" />}
            </button>
            <span className="text-xs text-muted-foreground leading-relaxed">
              I confirm that I have read and agree to the{" "}
              <a href="/Terms/terms-of-service.html" target="_blank" className="text-primary underline">Terms of Service</a>,{" "}
              <a href="/Terms/billing-terms.html" target="_blank" className="text-primary underline">Billing Terms</a> and{" "}
              <a href="/Terms/money-back-policy.html" target="_blank" className="text-primary underline">Money-back Policy</a>.
              {selectedPlan === "yearly" 
                ? " Subscribe for $49.99/year. You'll be charged $49.99 yearly until canceled."
                : ` Start your ${selectedPlan === "1week" ? "7-day" : selectedPlan === "2week" ? "14-day" : "28-day"} trial for ${selectedPlan === "1week" ? "$1" : selectedPlan === "2week" ? "$5.49" : "$9.99"}. After the trial, you'll be charged ${selectedPlan === "4week" ? "$29.99 every month" : "$19.99 every 2 weeks"} until canceled.`}
              {" "}By completing your purchase, you consent to us securely storing your payment details for future charges. No refunds for partial periods. You can cancel subscription anytime via account settings or by contacting support at weatpalmcosmic@gmail.com.
            </span>
          </label>
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
            <div className="w-10 h-6 bg-[#003087] rounded flex items-center justify-center">
              <span className="text-white text-[8px] font-bold">PayPal</span>
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
            <p className="text-primary cursor-pointer">More data in the full report</p>
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
          {/* Elysia image with gradient ring only */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              {/* Gradient glow behind */}
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

        {/* Zodiac Card Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.0 }}
          className="w-full max-w-sm mb-8"
        >
          {/* "This card was made for you" header with arrow */}
          <div className="relative bg-white rounded-2xl p-4 mb-2">
            <h4 className="text-lg font-semibold text-slate-900 text-center mb-1">This card was made for you</h4>
            <p className="text-xs text-slate-500 text-center">Explore your astrological self</p>
            {/* Arrow pointing down to card */}
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white rotate-45" />
          </div>

          {/* Zodiac Card */}
          <div className="bg-gradient-to-b from-slate-800 to-slate-900 rounded-2xl p-6 border border-slate-700">
            <h4 className="text-lg font-bold text-center mb-1">You</h4>
            <p className="text-sm text-muted-foreground text-center mb-6">
              {zodiacSign.name} • {zodiacSign.element}
            </p>

            {/* Zodiac symbol in center with glow effect */}
            <div className="flex justify-center mb-8">
              <div className="relative">
                {/* Glow effect behind */}
                <div className="absolute inset-0 rounded-full bg-purple-500/30 blur-xl scale-150" />
                <div className="relative w-28 h-28 rounded-full bg-gradient-to-b from-slate-600/50 to-slate-700/50 border border-slate-500/50 flex items-center justify-center">
                  <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shadow-lg">
                    <span className="text-4xl text-white">{zodiacSign.symbol}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modality and Polarity */}
            <div className="flex justify-between mb-8 px-4">
              <div className="text-center">
                <div className="w-12 h-12 mx-auto rounded-xl bg-gradient-to-br from-purple-500/80 to-purple-700/80 flex items-center justify-center mb-2">
                  <span className="text-xl text-white">♈</span>
                </div>
                <p className="text-sm font-medium">Cardinal</p>
                <p className="text-xs text-muted-foreground">Modality</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 mx-auto rounded-xl bg-gradient-to-br from-amber-500/80 to-amber-600/80 flex items-center justify-center mb-2">
                  <span className="text-xl text-white">{gender === "female" ? "♀" : "♂"}</span>
                </div>
                <p className="text-sm font-medium">{gender === "female" ? "Feminine" : "Masculine"}</p>
                <p className="text-xs text-muted-foreground">Polarity</p>
              </div>
            </div>

            {/* Moon, Sun, Ascendant */}
            <div className="flex justify-between px-2">
              <div className="text-center">
                <div className="w-10 h-10 mx-auto rounded-lg bg-gradient-to-br from-purple-500/70 to-purple-700/70 flex items-center justify-center mb-2">
                  <span className="text-lg text-white">{userMoonSign.symbol}</span>
                </div>
                <p className="text-sm font-medium">{userMoonSign.name}</p>
                <p className="text-xs text-muted-foreground">Moon Sign</p>
              </div>
              <div className="text-center">
                <div className="w-10 h-10 mx-auto rounded-lg bg-gradient-to-br from-purple-500/70 to-purple-700/70 flex items-center justify-center mb-2">
                  <span className="text-lg text-white">{zodiacSign.symbol}</span>
                </div>
                <p className="text-sm font-medium">{zodiacSign.name}</p>
                <p className="text-xs text-muted-foreground">Sun Sign</p>
              </div>
              <div className="text-center">
                <div className="w-10 h-10 mx-auto rounded-lg bg-gradient-to-br from-purple-500/70 to-purple-700/70 flex items-center justify-center mb-2">
                  <span className="text-lg text-white">{userAscendantSign.symbol}</span>
                </div>
                <p className="text-sm font-medium">{userAscendantSign.name}</p>
                <p className="text-xs text-muted-foreground">Ascendant</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Compatibility Report Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.1 }}
          className="w-full max-w-sm bg-gradient-to-b from-slate-800/80 to-slate-900/90 rounded-3xl p-6 mb-8"
        >
          <h3 className="text-xl font-bold text-center mb-6">Your compatibility profile</h3>

          <div className="flex gap-4 mb-6">
            {/* Zodiac image with percentage */}
            <div className="relative flex-shrink-0">
              <div className="w-24 h-24 rounded-full bg-gradient-to-b from-slate-700 to-slate-800 border border-slate-600 flex items-center justify-center overflow-hidden">
                <span className="text-4xl">{zodiacSign.symbol}</span>
              </div>
              {/* Percentage badge */}
              <div className="absolute -top-1 -right-1 w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center">
                <span className="text-xs font-bold text-white">{compatibilityStats[0]?.value || 85}%</span>
              </div>
              <p className="text-sm text-center mt-2">{zodiacSign.name}</p>
            </div>

            {/* Compatibility bars */}
            <div className="flex-1 space-y-3">
              {compatibilityStats.map((stat, index) => (
                <div key={stat.label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{stat.label}</span>
                    <span className="text-muted-foreground">{stat.value}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: stat.color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${stat.value}%` }}
                      transition={{ delay: 1.3 + index * 0.15, duration: 0.8 }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Best matches message */}
          <div className="bg-card/50 rounded-xl p-4 mb-4">
            <p className="text-sm text-center">
              We know which zodiac signs are <span className="text-primary font-semibold">your best matches</span> for love, marriage, and friendship
            </p>
            <div className="flex items-center gap-2 justify-center mt-2">
              <div className="w-8 h-8 rounded-full overflow-hidden">
                <img
                  src="/elysia.png"
                  alt="Elysia"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/logo.png";
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">Let&apos;s uncover them now</p>
            </div>
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
            {/* Dotted world map effect */}
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

            {/* Zodiac Wheel Placeholder */}
            <div className="flex justify-center mb-6">
              <div className="relative w-48 h-48">
                {/* Outer glow */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-b from-cyan-500/20 to-transparent blur-xl" />
                {/* Wheel background */}
                <div className="relative w-full h-full rounded-full bg-gradient-to-b from-slate-700 to-slate-800 border border-slate-600 flex items-center justify-center">
                  {/* Inner circle with zodiac symbols */}
                  <div className="w-36 h-36 rounded-full bg-slate-900/80 border border-slate-600 flex items-center justify-center">
                    <div className="text-center">
                      <span className="text-3xl">{zodiacSign.symbol}</span>
                      <p className="text-xs text-muted-foreground mt-1">{zodiacSign.name}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Moon, Sun, Ascendant */}
            <div className="flex justify-between px-4 mb-8">
              <div className="text-center">
                <span className="text-2xl text-cyan-400">{userMoonSign.symbol}</span>
                <p className="text-sm font-medium mt-1">{userMoonSign.name}</p>
                <p className="text-xs text-muted-foreground">Moon Sign</p>
              </div>
              <div className="text-center">
                <span className="text-2xl text-cyan-400">{zodiacSign.symbol}</span>
                <p className="text-sm font-medium mt-1">{zodiacSign.name}</p>
                <p className="text-xs text-muted-foreground">Sun Sign</p>
              </div>
              <div className="text-center">
                <span className="text-2xl text-cyan-400">{userAscendantSign.symbol}</span>
                <p className="text-sm font-medium mt-1">{userAscendantSign.name}</p>
                <p className="text-xs text-muted-foreground">Ascendant</p>
              </div>
            </div>

            {/* Your core personality */}
            <h4 className="text-lg font-bold text-center mb-4">Your core personality</h4>

            <div className="space-y-4 mb-4">
              <div className="flex gap-3">
                <span className="text-2xl text-cyan-400">{zodiacSign.symbol}</span>
                <p className="text-sm text-muted-foreground">
                  Your <span className="text-cyan-400 font-medium">Sun is in {zodiacSign.name}</span>, meaning you are naturally intuitive, emotionally intelligent, and deeply connected to those around you.
                </p>
              </div>
              <div className="flex gap-3">
                <span className="text-2xl text-cyan-400">{userAscendantSign.symbol}</span>
                <p className="text-sm text-muted-foreground">
                  With <span className="text-cyan-400 font-medium">{userAscendantSign.name} as your ascendant</span>, you present yourself with warmth and sensitivity. Others see you as nurturing and protective.
                </p>
              </div>
            </div>

            <p onClick={scrollToPayment} className="text-primary text-sm text-center mb-4 cursor-pointer hover:underline">More data in the full report</p>

            <Button
              ref={getFullReportRef}
              onClick={scrollToPayment}
              className="w-full h-12 text-base font-semibold bg-blue-500 hover:bg-blue-600"
              size="lg"
            >
              Get Full Report
            </Button>
          </motion.div>
        </div>

        {/* What you'll find in PalmCosmic */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.7 }}
          className="w-full max-w-sm bg-gradient-to-b from-slate-800/80 to-slate-900/90 rounded-3xl p-6 mb-8"
        >
          <h3 className="text-xl font-bold text-center mb-6">What you&apos;ll find in the PalmCosmic app</h3>

          <div className="space-y-4">
            {[
              { emoji: "👋", title: "Palm Reading", desc: "Dive deeper into your personality" },
              { emoji: "✨", title: "Zodiac Matches", desc: "Get love matches, lucky places & more" },
              { emoji: "🪐", title: "Your Birth Chart", desc: "Examine your chart and daily transits" },
              { emoji: "💬", title: "Anytime Advisor Access", desc: "Chat with Elysia anytime" },
              { emoji: "🔮", title: "Personal Horoscopes", desc: "Find out what the day or year holds" },
            ].map((feature, index) => (
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
            Try PalmCosmic
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
              alt="PalmCosmic"
              className="w-12 h-12 mb-2"
            />
            <p className="text-sm font-medium">PalmCosmic</p>
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
    </motion.div>
  );
}
