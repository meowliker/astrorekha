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

// Flow A (subscription) features
const subscriptionFeatures = [
  { icon: "🔮", title: "Daily Horoscope", description: "Personalized predictions based on your ascendant sign" },
  { icon: "🖐️", title: "Palm Reading", description: "AI-powered palm analysis for life insights" },
  { icon: "📊", title: "Birth Chart", description: "Complete astrological birth chart analysis" },
  { icon: "💫", title: "2026 Predictions", description: "Your yearly and monthly cosmic forecast" },
];

// Flow B bundle features based on what was purchased
const getBundleFeatures = (bundleId: string | null) => {
  const features = [];
  
  // Always included for all Flow B users
  features.push({ icon: "🔮", title: "Daily Horoscope", description: "Personalized predictions based on your ascendant sign" });
  features.push({ icon: "🖐️", title: "Palm Reading", description: "AI-powered palm analysis for life insights" });
  
  // Palm + Birth Chart and Full Bundle include birth chart
  if (bundleId === "bundle-palm-birth" || bundleId === "bundle-full") {
    features.push({ icon: "📊", title: "Birth Chart", description: "Complete astrological birth chart analysis" });
  }
  
  // Full Bundle includes compatibility
  if (bundleId === "bundle-full") {
    features.push({ icon: "💕", title: "Compatibility Report", description: "Find your perfect cosmic match" });
  }
  
  // All bundles include AI chat coins
  features.push({ icon: "💬", title: "15 AI Chat Coins", description: "Ask Elysia anything about your destiny" });
  
  return features;
};

export default function Step20Page() {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isFlowB, setIsFlowB] = useState(false);
  const [bundleId, setBundleId] = useState<string | null>(null);

  // Route protection: Check if user has completed registration
  useEffect(() => {
    const hasCompletedPayment = localStorage.getItem("palmcosmic_payment_completed") === "true";
    const hasCompletedRegistration = localStorage.getItem("palmcosmic_registration_completed") === "true";
    const flow = localStorage.getItem("palmcosmic_onboarding_flow");
    const bundle = localStorage.getItem("palmcosmic_bundle_id");
    
    setIsFlowB(flow === "flow-b");
    setBundleId(bundle);
    
    // Must have completed both payment and registration to access this page
    if (hasCompletedPayment && hasCompletedRegistration) {
      setIsAuthorized(true);
    } else if (hasCompletedPayment && !hasCompletedRegistration) {
      // Paid but not registered - redirect to registration
      router.replace("/onboarding/step-19");
      return;
    } else {
      // No payment - redirect to payment page
      const onboardingFlow = localStorage.getItem("palmcosmic_onboarding_flow");
      if (onboardingFlow === "flow-b") {
        router.replace("/onboarding/bundle-pricing");
      } else {
        router.replace("/onboarding/step-17");
      }
      return;
    }
  }, [router]);

  // Get features based on flow
  const displayFeatures = isFlowB ? getBundleFeatures(bundleId) : subscriptionFeatures;

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
          You're All Set!
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-muted-foreground text-center text-sm mb-8 max-w-xs"
        >
          Your PalmCosmic account is ready. Explore all the cosmic insights waiting for you.
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
