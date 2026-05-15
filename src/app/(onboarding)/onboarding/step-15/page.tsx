"use client";

import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { fadeUp } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Shield } from "lucide-react";
import { useHaptic } from "@/hooks/useHaptic";
import { pixelEvents } from "@/lib/pixel-events";
import { useOnboardingStore } from "@/lib/onboarding-store";
import { supabase } from "@/lib/supabase";
import { generateUserId } from "@/lib/user-profile";

// Fixed stats to avoid hydration mismatch (server vs client random values)
const READING_STATS = [
  { label: "Love", color: "#EF6B6B", value: 85 },
  { label: "Health", color: "#4ECDC4", value: 91 },
  { label: "Wisdom", color: "#F5C542", value: 78 },
  { label: "Career", color: "#8B5CF6", value: 65 },
];

export default function Step15Page() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const [palmImage, setPalmImage] = useState<string | null>(null);

  // Get user data from onboarding store
  const { gender, birthYear, relationshipStatus, goals } = useOnboardingStore();

  // Use fixed stats to avoid hydration mismatch
  const readingStats = READING_STATS;

  // Load captured palm image from localStorage and track ViewContent
  useEffect(() => {
    const savedImage = localStorage.getItem("astrorekha_palm_image");
    if (savedImage) {
      setPalmImage(savedImage);
    }
    // Track ViewContent when user sees their palm reading report
    pixelEvents.viewContent("Palm Reading Report", "report");
  }, []);

  const isValidEmail = (value: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  };

  const normalizeIndianWhatsappNumber = (value: string) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length === 10) return `+91${digits}`;
    if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
    return "";
  };

  const { triggerLight } = useHaptic();
  
  const checkPaymentStateByEmail = async (emailToCheck: string): Promise<{
    hasPaidBundlePayment: boolean;
    hasRegisteredAccount: boolean;
    latestBundleId: string | null;
  }> => {
    try {
      const userId = generateUserId();
      const response = await fetch(
        `/api/user/payment-state?email=${encodeURIComponent(emailToCheck)}&userId=${encodeURIComponent(userId)}`,
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
    const trimmed = email.trim();
    const trimmedWhatsapp = whatsappNumber.trim();
    const normalizedWhatsapp = trimmedWhatsapp ? normalizeIndianWhatsappNumber(trimmedWhatsapp) : "";

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
      setWhatsappError("Please enter a valid 10-digit WhatsApp number.");
      return;
    }

    if (normalizedWhatsapp && !whatsappOptIn) {
      setWhatsappError("Please allow WhatsApp updates to save this number.");
      return;
    }

    setEmailError(null);
    setWhatsappError(null);

    // Store email first so restore/login paths can use it.
    localStorage.setItem("astrorekha_email", trimmed);
    localStorage.setItem("astrorekha_checkout_email", trimmed);
    if (normalizedWhatsapp && whatsappOptIn) {
      localStorage.setItem("astrorekha_whatsapp_number", normalizedWhatsapp);
      localStorage.setItem("astrorekha_whatsapp_opt_in", "true");
      localStorage.setItem("astrorekha_whatsapp_opt_in_at", new Date().toISOString());
    } else {
      localStorage.removeItem("astrorekha_whatsapp_number");
      localStorage.removeItem("astrorekha_whatsapp_opt_in");
      localStorage.removeItem("astrorekha_whatsapp_opt_in_at");
    }
    pixelEvents.addToWishlist("Personalized Palm Reading Report");

    // Recovery path: if user already paid earlier, skip repurchase flow.
    const paymentState = await checkPaymentStateByEmail(trimmed);
    if (paymentState.hasPaidBundlePayment) {
      localStorage.setItem("astrorekha_payment_completed", "true");
      if (paymentState.latestBundleId) {
        localStorage.setItem("astrorekha_bundle_id", paymentState.latestBundleId);
      }

      if (paymentState.hasRegisteredAccount) {
        router.push(`/login?email=${encodeURIComponent(trimmed)}`);
      } else {
        router.push("/onboarding/step-19");
      }
      return;
    }
    
    // Navigate to paywall immediately (skip legacy redirect spinner step).
    localStorage.setItem("astrorekha_onboarding_flow", "flow-a");
    localStorage.setItem("astrorekha_layout_variant", "A");
    router.push("/onboarding/bundle-pricing");
    
    // Save lead data in background (non-blocking)
    const userId = generateUserId();
    const currentYear = new Date().getFullYear();
    const age = birthYear ? currentYear - parseInt(birthYear) : null;
    const leadId = `lead_${Date.now()}_${userId.slice(-6)}`;
    const whatsappOptInAt = normalizedWhatsapp && whatsappOptIn ? new Date().toISOString() : null;
    
    (async () => {
      try {
        const leadPayload: Record<string, unknown> = {
          id: leadId,
          email: trimmed,
          gender: gender || "not specified",
          age: age,
          relationship_status: relationshipStatus || "not specified",
          goals: goals || [],
          subscription_status: "no",
          user_id: userId,
          created_at: new Date().toISOString(),
          source: "onboarding_step_15",
        };

        if (normalizedWhatsapp && whatsappOptIn) {
          leadPayload.whatsapp_number = normalizedWhatsapp;
          leadPayload.whatsapp_opt_in = true;
          leadPayload.whatsapp_opt_in_at = whatsappOptInAt;
          leadPayload.whatsapp_opt_in_source = "onboarding_step_15";
        }

        const { error: leadError } = await supabase.from("leads").insert(leadPayload);
        if (leadError && normalizedWhatsapp && whatsappOptIn) {
          const fallbackLeadPayload = { ...leadPayload };
          delete fallbackLeadPayload.whatsapp_number;
          delete fallbackLeadPayload.whatsapp_opt_in;
          delete fallbackLeadPayload.whatsapp_opt_in_at;
          delete fallbackLeadPayload.whatsapp_opt_in_source;
          await supabase.from("leads").insert(fallbackLeadPayload);
        }
        
        await supabase.from("users").upsert({
          id: userId,
          email: trimmed,
          gender: gender || null,
          age: age,
          relationship_status: relationshipStatus || null,
          goals: goals || [],
          updated_at: new Date().toISOString(),
        }, { onConflict: "id" });

        if (normalizedWhatsapp && whatsappOptIn) {
          await supabase
            .from("users")
            .update({
              whatsapp_number: normalizedWhatsapp,
              whatsapp_opt_in: true,
              whatsapp_opt_in_at: whatsappOptInAt,
              whatsapp_opt_in_source: "onboarding_step_15",
            })
            .eq("id", userId);
        }
      } catch (err) {
        console.error("Failed to save lead data:", err);
      }
    })();
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={fadeUp}
      className="flex-1 flex flex-col min-h-screen bg-background"
    >
      <div className="flex-1 flex flex-col items-center px-6 py-8 overflow-y-auto">
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xl md:text-2xl font-bold text-center mb-6"
          style={{ fontFamily: "var(--font-philosopher, serif)" }}
        >
          Your palm reading report is ready
        </motion.h1>

        {/* Overview Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="w-full max-w-sm bg-card border border-border rounded-2xl p-4 mb-6"
        >
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            OVERVIEW
          </h2>

          <div className="flex gap-4 mb-4">
            {/* Palm image - use captured photo if available */}
            <div className="w-24 h-28 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
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
            <div className="flex-1 space-y-3">
              {readingStats.map((stat, index) => (
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
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Your <span className="text-[#EF6B6B] font-medium">Heart Line</span> shows that you are very passionate and freely express your thoughts and feelings.
            </p>
            <p>
              Your <span className="text-[#4ECDC4] font-medium">Life Line</span> means positive changes or recovery from illness in your future and overall completion of your life goals.
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
          <h2 className="text-lg font-semibold text-center mb-4">
            Sign up to understand yourself better with AstroRekha
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

          <div className="flex h-12 overflow-hidden rounded-lg border border-primary/30 bg-white/10 focus-within:ring-2 focus-within:ring-primary/50 mb-3">
            <div className="flex items-center px-3 border-r border-primary/20 text-sm text-muted-foreground">
              +91
            </div>
            <input
              type="tel"
              inputMode="numeric"
              placeholder="WhatsApp number"
              value={whatsappNumber}
              onChange={(e) => {
                setWhatsappNumber(e.target.value.replace(/[^\d\s-]/g, ""));
                if (whatsappError) setWhatsappError(null);
              }}
              className="min-w-0 flex-1 px-4 bg-transparent text-white placeholder:text-muted-foreground focus:outline-none"
            />
          </div>

          <label className="flex items-start gap-3 text-xs text-muted-foreground mb-3">
            <input
              type="checkbox"
              checked={whatsappOptIn}
              onChange={(e) => {
                setWhatsappOptIn(e.target.checked);
                if (whatsappError) setWhatsappError(null);
              }}
              className="mt-0.5 h-4 w-4 rounded border-primary/40 accent-primary"
            />
            <span>
              Send me my reading updates, reminders, and offers from AstroRekha on WhatsApp. I can opt out anytime.
            </span>
          </label>

          {whatsappError && (
            <p className="text-red-400 text-sm mb-4 text-center">{whatsappError}</p>
          )}

          <div className="flex items-start gap-2 text-xs text-muted-foreground mb-6">
            <Shield className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
            <p>
              Your personal data is safe with us. We&apos;ll use your email for updates, receipts, and subscription details.
            </p>
          </div>
        </motion.div>
      </div>

      <div className="onboarding-cta bg-background">
        <Button
          onClick={handleContinue}
          className="w-full h-14 text-lg font-semibold"
          size="lg"
        >
          Continue
        </Button>
      </div>
    </motion.div>
  );
}
