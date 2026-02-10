"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { fadeUp, staggerContainer, staggerItem } from "@/lib/motion";
import { OnboardingHeader, ProgressBar } from "@/components/onboarding/OnboardingHeader";
import { Button } from "@/components/ui/button";
import { ZodiacWheel } from "@/components/onboarding/ZodiacWheel";
import { useOnboardingStore } from "@/lib/onboarding-store";
import { useRouter } from "next/navigation";
import { Sparkles, Circle, Flame, Moon } from "lucide-react";
import { useHaptic } from "@/hooks/useHaptic";

const insightTags = [
  { icon: "✨", label: "Your challenges" },
  { icon: "🌍", label: "Your approach to life" },
  { icon: "🦋", label: "Your transformations" },
  { icon: "🌙", label: "Your intuition and dreams" },
];

interface SignData {
  name: string;
  symbol: string;
  element: string;
  description: string;
}

export default function Step5Page() {
  const router = useRouter();
  const [phase, setPhase] = useState<"loading" | "results">("loading");
  const [visibleTags, setVisibleTags] = useState(0);
  const [sunSign, setSunSign] = useState<SignData>({ name: "...", symbol: "✦", element: "", description: "" });
  const [moonSign, setMoonSign] = useState<SignData>({ name: "...", symbol: "✦", element: "", description: "" });
  const [ascendant, setAscendant] = useState<SignData>({ name: "...", symbol: "✦", element: "", description: "" });
  
  const { birthMonth, birthDay, birthYear, birthHour, birthMinute, birthPeriod, birthPlace, setSigns } = useOnboardingStore();

  useEffect(() => {
    const tagInterval = setInterval(() => {
      setVisibleTags((prev) => {
        if (prev >= insightTags.length) {
          clearInterval(tagInterval);
          return prev;
        }
        return prev + 1;
      });
    }, 800);

    // Fetch AI-calculated signs
    const fetchSigns = async () => {
      try {
        const response = await fetch("/api/astrology/signs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            birthMonth,
            birthDay,
            birthYear,
            birthHour,
            birthMinute,
            birthPeriod,
            birthPlace,
          }),
        });
        const data = await response.json();
        if (data.success) {
          setSunSign(data.sunSign);
          setMoonSign(data.moonSign);
          setAscendant(data.ascendant);
          // Save to store for use across the app
          setSigns(data.sunSign, data.moonSign, data.ascendant);
        }
      } catch (error) {
        console.error("Failed to fetch signs:", error);
      }
    };

    fetchSigns();

    const phaseTimer = setTimeout(() => {
      setPhase("results");
    }, 4500);

    return () => {
      clearInterval(tagInterval);
      clearTimeout(phaseTimer);
    };
  }, [birthMonth, birthDay, birthYear, birthHour, birthMinute, birthPeriod, birthPlace]);

  const { triggerLight } = useHaptic();
  
  const handleContinue = () => {
    triggerLight();
    router.push("/onboarding/step-6");
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={fadeUp}
      className="flex-1 flex flex-col min-h-screen"
    >
      <OnboardingHeader showBack currentStep={5} totalSteps={14} />
      <ProgressBar currentStep={5} totalSteps={14} />

      <AnimatePresence mode="wait">
        {phase === "loading" ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col items-center px-6 pt-8"
          >
            <h1 className="text-xl md:text-2xl font-bold text-center mb-8">
              Mapping your birth chart...
            </h1>

            <div className="relative mb-8">
              <ZodiacWheel isAnimating size={180} />
            </div>

            <div className="flex flex-col items-center gap-3">
              {insightTags.map((tag, index) => (
                <motion.div
                  key={tag.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{
                    opacity: index < visibleTags ? 1 : 0,
                    y: index < visibleTags ? 0 : 10,
                  }}
                  transition={{ duration: 0.4 }}
                  className="px-4 py-2 rounded-full bg-card border border-border text-sm"
                >
                  <span className="mr-2">{tag.icon}</span>
                  {tag.label}
                </motion.div>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="results"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="flex-1 flex flex-col items-center px-6 pt-4"
          >
            <motion.div
              variants={staggerItem}
              className="relative bg-card border border-border rounded-2xl px-6 py-4 mb-4 max-w-sm"
            >
              <p className="text-center text-sm">
                Your chart shows a <span className="text-primary font-medium">rare spark</span> — let&apos;s discover your best match
              </p>
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-card border-r border-b border-border rotate-45" />
            </motion.div>

            <motion.div
              variants={staggerItem}
              className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center mb-4"
            >
              <span className="text-2xl">🔮</span>
            </motion.div>

            <motion.div variants={staggerItem} className="mb-6">
              <ZodiacWheel isAnimating={false} size={160} />
            </motion.div>

            <motion.div
              variants={staggerItem}
              className="flex justify-center gap-8 w-full max-w-sm mb-8"
            >
              <div className="flex flex-col items-center">
                <span className="text-2xl mb-1">{moonSign.symbol}</span>
                <span className="font-medium text-sm">{moonSign.name}</span>
                <span className="text-xs text-muted-foreground">Moon Sign</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-2xl mb-1">{sunSign.symbol}</span>
                <span className="font-medium text-sm">{sunSign.name}</span>
                <span className="text-xs text-muted-foreground">Sun Sign</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-2xl mb-1">{ascendant.symbol}</span>
                <span className="font-medium text-sm">{ascendant.name}</span>
                <span className="text-xs text-muted-foreground">Ascendant</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {phase === "results" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
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
