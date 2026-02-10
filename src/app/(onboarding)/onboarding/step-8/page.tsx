"use client";

import { motion } from "framer-motion";
import { fadeUp, staggerContainer, staggerItem } from "@/lib/motion";
import { OnboardingHeader, ProgressBar } from "@/components/onboarding/OnboardingHeader";
import { Button } from "@/components/ui/button";
import { useOnboardingStore } from "@/lib/onboarding-store";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useHaptic } from "@/hooks/useHaptic";

const goalOptions = [
  { id: "family-harmony", label: "Family harmony", emoji: "👨‍👩‍👧" },
  { id: "career", label: "Career", emoji: "🏆" },
  { id: "health", label: "Health", emoji: "🍎" },
  { id: "getting-married", label: "Getting married", emoji: "💒" },
  { id: "traveling", label: "Traveling the world", emoji: "🌍" },
  { id: "education", label: "Education", emoji: "🎓" },
  { id: "friends", label: "Friends", emoji: "👥" },
  { id: "children", label: "Children", emoji: "👶" },
];

const MAX_SELECTIONS = 3;

export default function Step8Page() {
  const router = useRouter();
  const { goals, setGoals } = useOnboardingStore();
  const { triggerLight } = useHaptic();

  const toggleGoal = (goalId: string) => {
    if (goals.includes(goalId)) {
      setGoals(goals.filter((g) => g !== goalId));
    } else if (goals.length < MAX_SELECTIONS) {
      setGoals([...goals, goalId]);
    }
  };

  const handleContinue = () => {
    triggerLight();
    router.push("/onboarding/step-9");
  };

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="flex-1 flex flex-col min-h-screen"
    >
      <OnboardingHeader showBack currentStep={8} totalSteps={14} />
      <ProgressBar currentStep={8} totalSteps={14} />

      <div className="flex-1 flex flex-col px-6 pt-8">
        <motion.h1
          variants={staggerItem}
          className="text-xl md:text-2xl font-bold text-center mb-2"
        >
          What are your <span className="text-primary">goals</span> for the future?
        </motion.h1>

        <motion.p
          variants={staggerItem}
          className="text-muted-foreground text-center text-sm mb-6"
        >
          Selected: {goals.length}/{MAX_SELECTIONS}
        </motion.p>

        <motion.div
          variants={staggerItem}
          className="flex flex-wrap justify-center gap-3"
        >
          {goalOptions.map((option) => {
            const isSelected = goals.includes(option.id);
            const isDisabled = !isSelected && goals.length >= MAX_SELECTIONS;

            return (
              <button
                key={option.id}
                onClick={() => toggleGoal(option.id)}
                disabled={isDisabled}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-200",
                  "border text-sm font-medium",
                  isSelected
                    ? "bg-primary/20 border-primary text-foreground"
                    : "bg-card border-border text-foreground hover:border-primary/50",
                  isDisabled && "opacity-50 cursor-not-allowed"
                )}
              >
                <span>{option.emoji}</span>
                <span>{option.label}</span>
              </button>
            );
          })}
        </motion.div>
      </div>

      <div className="px-6 pb-24">
        <Button
          onClick={handleContinue}
          className="w-full h-14 text-lg font-semibold"
          size="lg"
          disabled={goals.length === 0}
        >
          Continue
        </Button>
      </div>
    </motion.div>
  );
}
