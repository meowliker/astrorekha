"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { fadeUp, staggerContainer, staggerItem } from "@/lib/motion";
import { OnboardingHeader, ProgressBar } from "@/components/onboarding/OnboardingHeader";
import { Button } from "@/components/ui/button";
import { useOnboardingStore } from "@/lib/onboarding-store";
import { useRouter } from "next/navigation";
import { useHaptic } from "@/hooks/useHaptic";
import { SKETCH_QUESTION_BANK, type SketchQuestionId } from "@/lib/layout-b-funnel";

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
  const [isLayoutB, setIsLayoutB] = useState(false);
  const [flowBAnswers, setFlowBAnswers] = useState<Record<string, unknown>>({});
  
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
    sunSign: storeSunSign,
    moonSign: storeMoonSign,
    ascendantSign: storeAscendant,
    modality: storeModality,
    polarity: storePolarity,
    calculateLocalSigns,
    fetchAccurateSigns,
    signsFromApi,
  } = useOnboardingStore();
  
  // Use store values directly, with fallbacks
  const sunSign = storeSunSign || { name: "...", symbol: "✦", element: "", description: "" };
  const moonSign = storeMoonSign || { name: "...", symbol: "✦", element: "", description: "" };
  const ascendant = storeAscendant || { name: "...", symbol: "✦", element: "", description: "" };
  const modality = storeModality || "Cardinal";
  const polarity = storePolarity || "Feminine";

  const genderLabel = gender === "male" ? "Man" : gender === "female" ? "Woman" : "Person";
  const elementLabel = elementPreference ? elementPreference.charAt(0).toUpperCase() + elementPreference.slice(1) : "Water";

  // Ensure signs are calculated (should already be done from step-5)
  useEffect(() => {
    // If signs aren't loaded yet, calculate them instantly
    if (!storeSunSign) {
      calculateLocalSigns();
    }
    // If not from API yet, fetch in background
    if (!signsFromApi) {
      fetchAccurateSigns();
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onboardingFlow = localStorage.getItem("astrorekha_onboarding_flow");
    const layoutVariant = localStorage.getItem("astrorekha_layout_variant");
    const bFlow = onboardingFlow === "flow-b" && layoutVariant === "B";
    setIsLayoutB(bFlow);
    if (!bFlow) return;

    try {
      const saved = localStorage.getItem("astrorekha_soulmate_answers");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object") {
          setFlowBAnswers(parsed as Record<string, unknown>);
        }
      }
    } catch {
      // ignore malformed local data
    }

    const userId = localStorage.getItem("astrorekha_user_id");
    if (!userId) return;
    fetch(`/api/soulmate-sketch/status?userId=${encodeURIComponent(userId)}`, {
      cache: "no-store",
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        if (!json?.question_answers || typeof json.question_answers !== "object") return;
        const nonEmptyAnswers = Object.fromEntries(
          Object.entries(json.question_answers as Record<string, unknown>).filter(
            ([, value]) => normalizeAnswerValues(value).length > 0
          )
        );
        setFlowBAnswers((prev) => ({ ...prev, ...nonEmptyAnswers }));
      })
      .catch(() => {
        // ignore status fetch issues during onboarding
      });
  }, []);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 800),
      setTimeout(() => setPhase(2), 2500),
      setTimeout(() => setPhase(3), 5500),
      setTimeout(() => setPhase(4), 7500),
      setTimeout(() => setPhase(5), 9000),
    ];

    return () => timers.forEach(clearTimeout);
  }, []);

  const { triggerLight } = useHaptic();
  const handleContinue = () => {
    triggerLight();
    router.push("/onboarding/step-12");
  };

  const formattedBirthDate = `${birthMonth.slice(0, 3)} ${birthDay}, ${birthYear}`;
  const formattedGoals = goals.map((g) => goalLabels[g] || g).join(", ");
  const formattedStatus = relationshipStatus ? relationshipLabels[relationshipStatus] : "Not specified";

  const normalizeAnswerValues = (rawValue: unknown): string[] => {
    if (rawValue === null || rawValue === undefined) return [];
    if (Array.isArray(rawValue)) {
      return rawValue.map((item) => String(item).trim()).filter(Boolean);
    }
    if (typeof rawValue === "string") {
      const trimmed = rawValue.trim();
      if (!trimmed) return [];
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            return parsed.map((item) => String(item).trim()).filter(Boolean);
          }
        } catch {
          // fall through to comma split
        }
      }
      return trimmed
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
    const asText = String(rawValue).trim();
    return asText ? [asText] : [];
  };

  const getRawFlowBAnswer = (...keys: string[]) => {
    for (const key of keys) {
      if (!(key in flowBAnswers)) continue;
      const value = flowBAnswers[key];
      if (normalizeAnswerValues(value).length > 0) {
        return value;
      }
    }
    return undefined;
  };

  const getFlowBAnswerLabel = (id: SketchQuestionId, rawValue: unknown) => {
    const question = SKETCH_QUESTION_BANK.find((q) => q.id === id);
    if (!question) return "";
    const values = normalizeAnswerValues(rawValue);
    if (values.length === 0) return "";

    const labels = values.map((value) => {
      const option = question.options.find((opt) => opt.value === value);
      return option?.label || value.replaceAll("_", " ");
    });
    return labels.join(", ");
  };

  const attractedRaw = getRawFlowBAnswer(
    "attracted_to",
    "attractedTo",
    "attracted",
    "gender_preference",
    "genderPreference",
    "target_gender"
  );
  const ageRaw = getRawFlowBAnswer("age_group", "ageGroup");
  const vibeRaw = getRawFlowBAnswer("vibe", "relationship_feel", "relationshipFeel");
  const futureRaw = getRawFlowBAnswer("future_goal", "futureGoal", "future");
  const mainWorryRaw = getRawFlowBAnswer(
    "main_worry",
    "mainWorry",
    "relationship_worries",
    "relationshipWorries",
    "sketch_prefs",
    "sketchPrefs"
  );
  const appearanceRaw = getRawFlowBAnswer("appearance");

  const flowBAttractedTo = getFlowBAnswerLabel("attracted_to", attractedRaw);
  const flowBAge = getFlowBAnswerLabel("age_group", ageRaw);
  const flowBVibe = getFlowBAnswerLabel("vibe", vibeRaw);
  const flowBFutureGoal = getFlowBAnswerLabel("future_goal", futureRaw);
  const flowBMainWorry = getFlowBAnswerLabel("main_worry", mainWorryRaw);

  const detailLabel3 = isLayoutB ? "Attracted To" : "Status";
  const detailValue3 = isLayoutB
    ? flowBAttractedTo ||
      getFlowBAnswerLabel("appearance", appearanceRaw) ||
      "Not specified"
    : formattedStatus;

  const detailLabel4 = isLayoutB ? "Relationship Worries" : "Goals";
  const detailValue4 = isLayoutB
    ? flowBMainWorry || [flowBAge, flowBVibe].filter(Boolean).join(" • ") || "Not specified"
    : formattedGoals || "Not specified";

  const detailLabel5 = "Future";
  const detailValue5 = flowBFutureGoal || "Not specified";

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
                    <span className="text-muted-foreground font-medium">{detailLabel3}</span>
                    <span>{detailValue3}</span>
                  </motion.div>
                  
                  <motion.div
                    initial={{ opacity: 0, x: -15 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 1.4, duration: 0.6, ease: "easeOut" }}
                    className="flex justify-between"
                  >
                    <span className="text-muted-foreground font-medium">{detailLabel4}</span>
                    <span className="text-right max-w-[180px]">{detailValue4}</span>
                  </motion.div>

                  {isLayoutB ? (
                    <motion.div
                      initial={{ opacity: 0, x: -15 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 1.7, duration: 0.6, ease: "easeOut" }}
                      className="flex justify-between"
                    >
                      <span className="text-muted-foreground font-medium">{detailLabel5}</span>
                      <span className="text-right max-w-[180px]">{detailValue5}</span>
                    </motion.div>
                  ) : null}
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
