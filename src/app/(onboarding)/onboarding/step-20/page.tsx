"use client";

import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { fadeUp } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Check, Sparkles, Loader2 } from "lucide-react";

const progressSteps = [
  { label: "Order submitted", completed: true },
  { label: "Special offer", completed: true },
  { label: "Create account", completed: true },
  { label: "Access to the app", active: true },
];

// Bundle features based on what was purchased
const getBundleFeatures = (bundleId: string | null) => {
  const features = [];
  
  // Always included for all Flow B users
  features.push({ icon: "🔮", title: "Daily Horoscope", description: "Personalized predictions based on your ascendant sign" });
  features.push({ icon: "🖐️", title: "Palm Reading", description: "AI-powered palm analysis for life insights" });
  
  // Palm + Birth Chart and Full Bundle include birth chart
  if (bundleId === "palm-birth" || bundleId === "palm-birth-compat" || bundleId === "palm-birth-sketch") {
    features.push({ icon: "📊", title: "Birth Chart", description: "Complete astrological birth chart analysis" });
  }
  
  // Full Bundle includes compatibility
  if (bundleId === "palm-birth-compat") {
    features.push({ icon: "💕", title: "Compatibility Report", description: "Find your perfect cosmic match" });
  }
  if (bundleId === "palm-birth-sketch") {
    features.push({ icon: "🎨", title: "Soulmate Sketch", description: "One personalized AI soulmate portrait" });
  }
  if (bundleId === "palm-birth-compat" || bundleId === "palm-birth-sketch") {
    features.push({ icon: "💍", title: "Future Partner Report", description: "One-time partner-name + marriage insights report" });
  }
  
  // Bundle 3 (palm-birth-compat) gives 30 coins, others give 15
  const coinCount = bundleId === "palm-birth-compat" || bundleId === "palm-birth-sketch" ? 30 : 15;
  features.push({ icon: "💬", title: `${coinCount} AI Chat Coins`, description: "Ask Elysia anything about your destiny" });
  
  return features;
};

export default function Step20Page() {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [bundleId, setBundleId] = useState<string | null>(null);

  // Route protection: Check if user has completed registration
  useEffect(() => {
    const run = async () => {
      const hasCompletedPayment = localStorage.getItem("astrorekha_payment_completed") === "true";
      const hasCompletedRegistration = localStorage.getItem("astrorekha_registration_completed") === "true";
      const bundle = localStorage.getItem("astrorekha_bundle_id");
      const storedEmail = (localStorage.getItem("astrorekha_email") || "").trim();
      const storedUserId = (localStorage.getItem("astrorekha_user_id") || "").trim();

      localStorage.setItem("astrorekha_onboarding_flow", "flow-a");
      localStorage.setItem("astrorekha_layout_variant", "A");
      setBundleId(bundle);

      if (!hasCompletedRegistration) {
        if (hasCompletedPayment) {
          router.replace("/onboarding/step-19");
          return;
        }

        router.replace("/onboarding/bundle-pricing");
        return;
      }

      // Normal fast path.
      if (hasCompletedPayment) {
        setIsAuthorized(true);
        return;
      }

      // Recovery path for cases where payment succeeded but local flag is missing.
      if (storedEmail || storedUserId) {
        try {
          const query = new URLSearchParams();
          if (storedEmail) query.set("email", storedEmail);
          if (storedUserId) query.set("userId", storedUserId);

          const response = await fetch(`/api/user/payment-state?${query.toString()}`, {
            cache: "no-store",
          });
          if (response.ok) {
            const data = await response.json();
            if (data?.hasPaidBundlePayment || data?.hasPaidPayment) {
              localStorage.setItem("astrorekha_payment_completed", "true");
              if (data?.latestBundleId) {
                localStorage.setItem("astrorekha_bundle_id", data.latestBundleId);
                setBundleId(data.latestBundleId);
              }
              setIsAuthorized(true);
              return;
            }
          }
        } catch (error) {
          console.error("Failed to restore payment state on step-20:", error);
        }
      }

      router.replace("/onboarding/step-19");
    };

    run();
  }, [router]);

  const displayFeatures = getBundleFeatures(bundleId);

  const handleAccessApp = async () => {
    // Set access cookie via API
    try {
      await fetch("/api/session", { method: "POST" });
    } catch (err) {
      console.error("Failed to set session:", err);
    }
    router.push("/dashboard");
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

      <div className="flex-1 flex flex-col items-center px-6 py-4">
        {/* Success Icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
          className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center mb-6"
        >
          <Sparkles className="w-10 h-10 text-primary" />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-2xl md:text-3xl font-bold text-center mb-2"
        >
          You&apos;re All Set!
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-muted-foreground text-center text-sm mb-8 max-w-xs"
        >
          Your AstroRekha account is ready. Explore all the cosmic insights waiting for you.
        </motion.p>

        {/* Features */}
        <div className="w-full max-w-sm space-y-3 mb-6">
          {displayFeatures.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + index * 0.1 }}
              className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border"
            >
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-2xl">
                {feature.icon}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-sm">{feature.title}</h3>
                <p className="text-xs text-muted-foreground">{feature.description}</p>
              </div>
              <Check className="w-5 h-5 text-primary" />
            </motion.div>
          ))}
        </div>
      </div>

      {/* Access App button */}
      <div className="p-6">
        <Button
          onClick={handleAccessApp}
          className="w-full h-14 text-lg font-semibold"
          size="lg"
        >
          Access the App
        </Button>
      </div>
    </motion.div>
  );
}
