"use client";

import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { fadeUp } from "@/lib/motion";
import { OnboardingHeader, ProgressBar } from "@/components/onboarding/OnboardingHeader";
import { Button } from "@/components/ui/button";
import { ForecastSphere } from "@/components/onboarding/ForecastSphere";
import { useRouter } from "next/navigation";
import { useHaptic } from "@/hooks/useHaptic";

export default function Step12Page() {
  const router = useRouter();
  const [showContent, setShowContent] = useState(false);
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    const timer1 = setTimeout(() => setShowContent(true), 3000);
    const timer2 = setTimeout(() => setShowButton(true), 4000);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  const { triggerLight } = useHaptic();
  const handleContinue = () => {
    triggerLight();
    router.push("/onboarding/step-13");
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={fadeUp}
      className="flex-1 flex flex-col min-h-screen"
    >
      <OnboardingHeader showBack currentStep={12} totalSteps={14} />
      <ProgressBar currentStep={12} totalSteps={14} />

      <div className="flex-1 flex flex-col items-center px-6 pt-8">
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xl md:text-2xl font-bold text-center mb-8"
        >
          Forecast accuracy
        </motion.h1>

        <div className="mb-8">
          <ForecastSphere targetPercentage={67} startPercentage={34} duration={2.5} size={180} />
        </div>

        {showContent && (
          <>
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="relative bg-card border border-border rounded-2xl px-6 py-4 max-w-sm"
            >
              <p className="text-center text-sm">
                You&apos;re close to a big reveal! Confirm one last thing — and see your full story
              </p>
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-card border-r border-b border-border rotate-45" />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.2, ease: "backOut" }}
              className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center mt-4"
            >
              <span className="text-xl">🔮</span>
            </motion.div>
          </>
        )}
      </div>

      {showButton && (
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
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
