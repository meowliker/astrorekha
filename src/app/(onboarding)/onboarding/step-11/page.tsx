"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { fadeUp, staggerContainer, staggerItem } from "@/lib/motion";
import { OnboardingHeader, ProgressBar } from "@/components/onboarding/OnboardingHeader";
import { Button } from "@/components/ui/button";
import { useOnboardingStore } from "@/lib/onboarding-store";
import { useRouter } from "next/navigation";
import { useHaptic } from "@/hooks/useHaptic";

interface SignData {
  name: string;
  symbol: string;
  element: string;
  description: string;
}

const goalLabels: Record<string, string> = {
  "family-harmony": "Family harmony",
  "career": "Career",
  "health": "Health",
  "getting-married": "Getting married",
  "traveling": "Traveling",
  "education": "Education",
  "friends": "Friends",
  "children": "Children",
};

const relationshipLabels: Record<string, string> = {
  "in-relationship": "In a relationship",
  "just-broke-up": "Just broke up",
  "engaged": "Engaged",
  "married": "Married",
  "looking-for-soulmate": "Looking for soulmate",
  "single": "Single",
  "complicated": "It's complicated",
};

export default function Step11Page() {
  const router = useRouter();
  const [phase, setPhase] = useState(0);
  const [sunSign, setSunSign] = useState<SignData>({ name: "...", symbol: "✦", element: "", description: "" });
  const [moonSign, setMoonSign] = useState<SignData>({ name: "...", symbol: "✦", element: "", description: "" });
  const [ascendant, setAscendant] = useState<SignData>({ name: "...", symbol: "✦", element: "", description: "" });
  const [modality, setModality] = useState("Cardinal");
  const [polarity, setPolarity] = useState("Feminine");
  
  const {
    gender,
    birthMonth,
    birthDay,
    birthYear,
    birthPlace,
    birthHour,
    birthMinute,
    birthPeriod,
    relationshipStatus,
    goals,
    elementPreference,
  } = useOnboardingStore();

  const genderLabel = gender === "male" ? "Man" : gender === "female" ? "Woman" : "Person";
  const elementLabel = elementPreference ? elementPreference.charAt(0).toUpperCase() + elementPreference.slice(1) : "Water";

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1800),
      setTimeout(() => setPhase(3), 5000),
      setTimeout(() => setPhase(4), 6200),
      setTimeout(() => setPhase(5), 7200),
    ];

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
          if (data.modality) setModality(data.modality);
          if (data.polarity) setPolarity(data.polarity);
        }
      } catch (error) {
        console.error("Failed to fetch signs:", error);
      }
    };

    fetchSigns();

    return () => timers.forEach(clearTimeout);
  }, [birthMonth, birthDay, birthYear, birthHour, birthMinute, birthPeriod, birthPlace]);

  const { triggerLight } = useHaptic();
  const handleContinue = () => {
    triggerLight();
    router.push("/onboarding/step-12");
  };

  const formattedBirthDate = `${birthMonth.slice(0, 3)} ${birthDay}, ${birthYear}`;
  const formattedGoals = goals.map((g) => goalLabels[g] || g).join(", ");
  const formattedStatus = relationshipStatus ? relationshipLabels[relationshipStatus] : "Not specified";

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={fadeUp}
      className="flex-1 flex flex-col min-h-screen"
    >
      <OnboardingHeader showBack currentStep={11} totalSteps={14} />
      <ProgressBar currentStep={11} totalSteps={14} />

      <div className="flex-1 flex flex-col items-center px-6 pt-4 overflow-y-auto">
        <AnimatePresence>
          {phase >= 4 && (
            <motion.div
              initial={{ opacity: 0, y: -30, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="relative bg-card border border-border rounded-2xl px-6 py-4 mb-4 max-w-sm"
            >
              <p className="text-center text-sm">
                Your chart shows a <span className="text-primary font-medium">rare spark</span> — let&apos;s uncover how you can use this power!
              </p>
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-card border-r border-b border-border rotate-45" />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {phase >= 4 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.2, ease: "backOut" }}
              className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center mb-4"
            >
              <span className="text-xl">🔮</span>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="w-full max-w-sm bg-gradient-to-b from-card to-card/80 border border-border rounded-3xl p-6 relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/5 via-transparent to-teal-500/5 pointer-events-none" />
          
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: phase >= 1 ? 1 : 0 }}
            className="text-center mb-4 relative z-10"
          >
            <h2 className="text-xl font-bold mb-1">You</h2>
            <p className="text-sm text-muted-foreground">
              {genderLabel} • {sunSign.name} • {elementLabel}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: phase >= 1 ? 1 : 0, scale: phase >= 1 ? 1 : 0.8 }}
            transition={{ delay: 0.3 }}
            className="flex items-center justify-center gap-6 mb-6 relative z-10"
          >
            <div className="text-center">
              <span className="text-2xl">{sunSign.symbol}</span>
              <p className="text-sm font-medium mt-1">{modality}</p>
              <p className="text-xs text-muted-foreground">Modality</p>
            </div>

            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-slate-800 to-slate-900 border-2 border-foreground/20 flex items-center justify-center">
              <span className="text-4xl">{sunSign.symbol}</span>
            </div>

            <div className="text-center">
              <span className="text-2xl">{polarity === "Masculine" ? "♂" : "♀"}</span>
              <p className="text-sm font-medium mt-1">{polarity}</p>
              <p className="text-xs text-muted-foreground">Polarity</p>
            </div>
          </motion.div>

          <AnimatePresence mode="wait">
            {phase >= 2 && phase < 3 && (
              <motion.div
                key="details"
                initial={{ opacity: 0, height: 0, y: 20 }}
                animate={{ opacity: 1, height: "auto", y: 0 }}
                exit={{ opacity: 0, height: 0, y: -10 }}
                transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
                className="bg-secondary/50 rounded-xl p-4 mb-4 relative z-10 overflow-hidden"
              >
                <motion.h3 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3, duration: 0.5 }}
                  className="text-sm font-semibold text-center mb-3"
                >
                  Your Details
                </motion.h3>
                
                <div className="space-y-3 text-sm">
                  <motion.div 
                    initial={{ opacity: 0, x: -15 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5, duration: 0.6, ease: "easeOut" }}
                    className="flex justify-between"
                  >
                    <span className="text-muted-foreground font-medium">Birth</span>
                    <span>{formattedBirthDate}</span>
                  </motion.div>
                  
                  <motion.div
                    initial={{ opacity: 0, x: -15 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.8, duration: 0.6, ease: "easeOut" }}
                    className="flex justify-between"
                  >
                    <span className="text-muted-foreground font-medium">Place</span>
                    <span className="text-right max-w-[180px] truncate">{birthPlace || "Not specified"}</span>
                  </motion.div>
                  
                  <motion.div
                    initial={{ opacity: 0, x: -15 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 1.1, duration: 0.6, ease: "easeOut" }}
                    className="flex justify-between"
                  >
                    <span className="text-muted-foreground font-medium">Status</span>
                    <span>{formattedStatus}</span>
                  </motion.div>
                  
                  <motion.div
                    initial={{ opacity: 0, x: -15 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 1.4, duration: 0.6, ease: "easeOut" }}
                    className="flex justify-between"
                  >
                    <span className="text-muted-foreground font-medium">Goals</span>
                    <span className="text-right max-w-[180px]">{formattedGoals || "Not specified"}</span>
                  </motion.div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {phase >= 3 && (
              <motion.div
                key="signs"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="flex justify-center gap-8 relative z-10 py-4"
              >
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1, duration: 0.4 }}
                  className="flex flex-col items-center"
                >
                  <span className="text-xl">{moonSign.symbol}</span>
                  <span className="text-xs font-medium">{moonSign.name}</span>
                  <span className="text-xs text-muted-foreground">Moon Sign</span>
                </motion.div>
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25, duration: 0.4 }}
                  className="flex flex-col items-center"
                >
                  <span className="text-xl">{sunSign.symbol}</span>
                  <span className="text-xs font-medium">{sunSign.name}</span>
                  <span className="text-xs text-muted-foreground">Sun Sign</span>
                </motion.div>
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4, duration: 0.4 }}
                  className="flex flex-col items-center"
                >
                  <span className="text-xl">{ascendant.symbol}</span>
                  <span className="text-xs font-medium">{ascendant.name}</span>
                  <span className="text-xs text-muted-foreground">Ascendant</span>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      <AnimatePresence>
        {phase >= 5 && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="px-6 pb-24"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.3, delay: 0.2 }}
            >
              <Button
                onClick={handleContinue}
                className="w-full h-14 text-lg font-semibold"
                size="lg"
              >
                Continue
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
