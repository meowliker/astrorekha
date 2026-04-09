"use client";

import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { fadeUp, staggerContainer, staggerItem } from "@/lib/motion";
import { OnboardingHeader, ProgressBar } from "@/components/onboarding/OnboardingHeader";
import { Button } from "@/components/ui/button";
import { ForecastSphere } from "@/components/onboarding/ForecastSphere";
import { useRouter } from "next/navigation";
import { useHaptic } from "@/hooks/useHaptic";
import { generateUserId } from "@/lib/user-profile";

export default function Step6Page() {
  const router = useRouter();
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowButton(true);
    }, 3500);
    return () => clearTimeout(timer);
  }, []);
  const { triggerLight } = useHaptic();

  const handleContinue = async () => {
    triggerLight();

    const onboardingFlow = localStorage.getItem("astrorekha_onboarding_flow");
    if (onboardingFlow !== "flow-b") {
      router.push("/onboarding/step-7");
      return;
    }

    const existingVariant = localStorage.getItem("astrorekha_layout_variant");
    if (existingVariant === "B") {
      router.push("/onboarding/step-7");
      return;
    }
    if (existingVariant === "A") {
      router.push("/onboarding/step-7");
      return;
    }

    try {
      const userId = localStorage.getItem("astrorekha_user_id") || generateUserId();
      const visitorId =
        localStorage.getItem("astrorekha_ab_visitor_id") ||
        userId;
      localStorage.setItem("astrorekha_ab_visitor_id", visitorId);

      const cfgRes = await fetch("/api/ab-test/layout-config", { cache: "no-store" });
      const cfgJson = await cfgRes.json().catch(() => ({}));
      const testId = cfgJson?.config?.testId || "onboarding-layout-qa";
      const enabled = cfgJson?.config?.enabled !== false;
      localStorage.setItem("astrorekha_ab_test_id", testId);

      if (!enabled) {
        localStorage.setItem("astrorekha_layout_variant", "A");
        router.push("/onboarding/step-7");
        return;
      }

      const variantParams = new URLSearchParams({
        testId,
        visitorId,
        userId,
      });
      const variantRes = await fetch(`/api/ab-test?${variantParams.toString()}`, { cache: "no-store" });
      const variantJson = await variantRes.json().catch(() => ({}));
      const variant = variantJson?.variant === "B" ? "B" : "A";
      const resolvedTestId = variantJson?.testId || testId;
      localStorage.setItem("astrorekha_ab_test_id", resolvedTestId);

      localStorage.setItem("astrorekha_layout_variant", variant);
      if (variant === "B") {
        router.push("/onboarding/step-7");
        return;
      }
    } catch (error) {
      console.error("Failed to assign onboarding layout variant at step-6:", error);
    }

    router.push("/onboarding/step-7");
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={fadeUp}
      className="flex-1 flex flex-col min-h-screen"
    >
      <OnboardingHeader showBack currentStep={6} totalSteps={14} />
      <ProgressBar currentStep={6} totalSteps={14} />

      <div className="flex-1 flex flex-col items-center px-6 pt-8">
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xl md:text-2xl font-bold text-center mb-8"
        >
          Forecast accuracy
        </motion.h1>

        <div className="mb-8">
          <ForecastSphere targetPercentage={34} duration={3} size={180} />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2 }}
          className="relative bg-card border border-border rounded-2xl px-6 py-4 max-w-sm"
        >
          <p className="text-center text-sm">
            The cosmic energy is building up! Share a bit more to reveal what&apos;s driving you
          </p>
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-card border-r border-b border-border rotate-45" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.5 }}
          className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center mt-4"
        >
          <span className="text-xl">🔮</span>
        </motion.div>
      </div>

      {showButton && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="px-6 pb-24"
        >
          <Button
            onClick={handleContinue}
            className="w-full h-14 text-lg font-semibold"
            size="lg"
          >
            Continue
          </Button>
        </motion.div>
      )}
    </motion.div>
  );
}
