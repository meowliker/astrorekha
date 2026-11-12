"use client";
import {trackMarketingEvent} from "@/lib/us-main/events-client";

import { motion } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import { fadeUp } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { useOnboardingRouter as useRouter } from "@/components/us-main/Experience";
import { Shield } from "lucide-react";
import { useHaptic } from "@/hooks/useHaptic";
import { pixelEvents } from "@/lib/us-main/pixel-events";
import { track } from "@/lib/us-main/analytics";
import { generateUserId } from "@/lib/us-main/user-profile";
const normalizeInternationalPhone = (v: string) => { const n = v.replace(/[^+0-9]/g, ""); return /^\+?[0-9]{7,15}$/.test(n) ? n : ""; };

import { prepareUsEmail } from "@/lib/us-main/checkout-client";
import { useUserStore } from "@/lib/us-main/user-store";
import { useGoogleAdsExperience } from "@/components/us-main/Experience";

// Fixed stats to avoid hydration mismatch (server vs client random values)
const READING_STATS = [
  { label: "Love", color: "#EF6B6B", value: 85 },
  { label: "Health", color: "#4ECDC4", value: 91 },
  { label: "Wisdom", color: "#F5C542", value: 78 },
  { label: "Career", color: "#8B5CF6", value: 65 },
];

export default function Step15Page() {
  const router = useRouter();
  const googleAds = useGoogleAdsExperience();
  const submittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const [palmImage, setPalmImage] = useState<string | null>(null);

  // Use fixed stats to avoid hydration mismatch
  const readingStats = READING_STATS;

  // Load captured palm image from localStorage and track ViewContent
  useEffect(() => {
    const savedImage = localStorage.getItem("astrorekha_us_main_palm_image");
    if (savedImage) {
      setPalmImage(savedImage);
    }
    // Track ViewContent when user sees their palm reading report
    pixelEvents.viewContent("Palm Reading Report", "report");
  }, []);

  const isValidEmail = (value: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  };

  const { triggerLight } = useHaptic();

  const checkPaymentStateByEmail = async (emailToCheck: string): Promise<{
    hasPaidBundlePayment: boolean;
    hasRegisteredAccount: boolean;
    latestBundleId: string | null;
  }> => {
    try {
      const response = await fetch(
        `/api/us/main/payment-state?email=${encodeURIComponent(emailToCheck)}`,
        {
        cache: "no-store",
        }
      );

      if (!response.ok) {
        return {
          hasPaidBundlePayment: false,
          hasRegisteredAccount: false,
          latestBundleId: null,
        };
      }

      const data = await response.json();
      return {
        hasPaidBundlePayment: !!data?.hasPaidBundlePayment,
        hasRegisteredAccount: !!data?.hasRegisteredAccount,
        latestBundleId: data?.latestBundleId || null,
      };
    } catch (err) {
      console.error("Error checking payment state:", err);
      return {
        hasPaidBundlePayment: false,
        hasRegisteredAccount: false,
        latestBundleId: null,
      };
    }
  };

  const handleContinue = async () => {
    triggerLight();
    const trimmed = email.trim().toLowerCase();
    const trimmedWhatsapp = whatsappNumber.trim();
    const normalizedWhatsapp = trimmedWhatsapp ? normalizeInternationalPhone(trimmedWhatsapp) : "";

    // Email is required
    if (trimmed.length === 0) {
      setEmailError("Please enter your email address to continue.");
      return;
    }

    // Validate email format
    if (!isValidEmail(trimmed)) {
      setEmailError("Please enter a valid email address.");
      return;
    }

    if (trimmedWhatsapp && !normalizedWhatsapp) {
      setWhatsappError("Please enter a valid phone number including country code.");
      return;
    }

    setEmailError(null);
    setWhatsappError(null);

    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      if (await prepareUsEmail(trimmed)) useUserStore.getState().resetUserState();
      useUserStore.getState().setUserId(generateUserId());
    } catch (error) {
      setEmailError(error instanceof Error ? error.message : "Unable to start checkout. Please try again.");
      submittingRef.current = false;
      setIsSubmitting(false);
      return;
    }

    localStorage.setItem("astrorekha_us_main_whatsapp_number", normalizedWhatsapp);
    localStorage.setItem("astrorekha_us_main_whatsapp_opt_in", "true");
    localStorage.setItem("astrorekha_us_main_whatsapp_opt_in_at", new Date().toISOString());
    try { pixelEvents.addToWishlist("Personalized Palm Reading Report"); } catch { /* Optional analytics. */ }

    void trackMarketingEvent({eventName:'email_submitted'});

    // Recovery path: if user already paid earlier, skip repurchase flow.
    const paymentState = await checkPaymentStateByEmail(trimmed);
    if (paymentState.hasPaidBundlePayment) {
      localStorage.setItem("astrorekha_us_main_payment_completed", "true");
      if (paymentState.latestBundleId) {
        localStorage.setItem("astrorekha_us_main_bundle_id", paymentState.latestBundleId);
      }

      if (paymentState.hasRegisteredAccount) {
        router.push(`/login?email=${encodeURIComponent(trimmed)}`);
      } else {
        router.push("/us/onboarding/step-19");
      }
      return;
    }

    // Navigate to paywall immediately (skip legacy redirect spinner step).
    localStorage.setItem("astrorekha_us_main_onboarding_flow", "flow-a");
    localStorage.setItem("astrorekha_us_main_layout_variant", "A");
    try { track("quiz_complete", { quiz_id: "onboarding" }); } catch { /* Optional analytics. */ }
    router.push("/us/onboarding/bundle-pricing");


  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={fadeUp}
      className="flex-1 flex flex-col min-h-screen bg-background"
    >
      <div className="flex-1 flex flex-col items-center px-5 pt-5 pb-3 overflow-y-auto">
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xl md:text-2xl font-bold text-center mb-4 leading-tight"
          style={{ fontFamily: "var(--font-philosopher, serif)" }}
        >
          {googleAds ? "Your palm photo is ready" : "Your palm reading report is ready"}
        </motion.h1>

        {/* Overview Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="w-full max-w-sm bg-card border border-border rounded-2xl p-4 mb-5"
        >
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            OVERVIEW
          </h2>

          <div className="flex gap-3 mb-4">
            {/* Palm image - use captured photo if available */}
            <div className="w-20 h-24 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
              {palmImage ? (
                <img
                  src={palmImage}
                  alt="Your palm"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                  Palm
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="flex-1 space-y-2.5">
              {googleAds ? <div className="space-y-2 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Your reading can explore</p>
                <p>Relationships and emotions</p><p>Personal strengths</p><p>Life patterns and career interests</p>
              </div> : readingStats.map((stat, index) => (
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
                      transition={{ delay: 0.5 + index * 0.15, duration: 0.8 }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Reading descriptions */}
          <div className="space-y-2.5 text-sm leading-relaxed text-muted-foreground">
            <p>
              {googleAds ? <>Your <span className="text-[#EF6B6B] font-medium">Heart Line</span> is explored through traditional palmistry themes around emotions and relationships.</> : <>Your <span className="text-[#EF6B6B] font-medium">Heart Line</span> shows that you are very passionate and freely express your thoughts and feelings.</>}
            </p>
            <p>
              {googleAds ? <>Your <span className="text-[#4ECDC4] font-medium">Life Line</span> is interpreted for personal reflection. The reading does not diagnose health conditions or predict recovery.</> : <>Your <span className="text-[#4ECDC4] font-medium">Life Line</span> means positive changes or recovery from illness in your future and overall completion of your life goals.</>}
            </p>
          </div>
        </motion.div>

        {/* Email signup section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="w-full max-w-sm"
        >
          <h2 className="text-base font-semibold text-center mb-3 leading-snug">
            {googleAds ? "Add your contact details to view reading bundles" : "Sign up to understand yourself better with AstroRekha"}
          </h2>

          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (emailError) setEmailError(null);
            }}
            className="w-full h-12 px-4 bg-white/10 border border-primary/30 rounded-lg text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 mb-2"
          />

          {emailError && (
            <p className="text-red-400 text-sm mb-4 text-center">{emailError}</p>
          )}

          <div className="flex h-12 overflow-hidden rounded-lg border border-primary/30 bg-white/10 focus-within:ring-2 focus-within:ring-primary/50 mb-2">
            <div className="flex items-center px-3 border-r border-primary/20 text-sm text-muted-foreground">
              Phone
            </div>
            <input
              type="tel"
              inputMode="tel"
              placeholder="+1 202 555 0123 (optional)"
              value={whatsappNumber}
              onChange={(e) => {
                setWhatsappNumber(e.target.value.replace(/[^+\d\s-]/g, ""));
                if (whatsappError) setWhatsappError(null);
              }}
              className="min-w-0 flex-1 px-4 bg-transparent text-white placeholder:text-muted-foreground focus:outline-none"
            />
          </div>

          {whatsappError && (
            <p className="text-red-400 text-sm mb-4 text-center">{whatsappError}</p>
          )}

          <div className="flex items-start gap-2 text-xs text-muted-foreground mb-2">
            <Shield className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
            <p>
              Your personal data is safe with us. We&apos;ll use your email and phone number for order confirmation, invoices, and report updates.
            </p>
          </div>
        </motion.div>
      </div>

      <div className="onboarding-cta">
        <Button
          onClick={handleContinue}
          disabled={isSubmitting}
          className="w-full h-14 text-lg font-semibold"
          size="lg"
        >
          Continue
        </Button>
      </div>
    </motion.div>
  );
}
