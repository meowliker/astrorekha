"use client";

import { motion } from "framer-motion";
import { fadeUp, staggerContainer, staggerItem } from "@/lib/motion";
import { OnboardingHeader, ProgressBar } from "@/components/onboarding/OnboardingHeader";
import { useOnboardingStore, RelationshipStatus } from "@/lib/onboarding-store";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const relationshipOptions: { value: RelationshipStatus; label: string; emoji: string }[] = [
  { value: "in-relationship", label: "In a relationship", emoji: "💕" },
  { value: "just-broke-up", label: "Just broke up", emoji: "💔" },
  { value: "engaged", label: "Engaged", emoji: "🥰" },
  { value: "married", label: "Married", emoji: "💍" },
  { value: "looking-for-soulmate", label: "Looking for a soulmate", emoji: "🔍" },
  { value: "single", label: "Single", emoji: "😊" },
  { value: "complicated", label: "It's complicated", emoji: "🤔" },
];

export default function Step7Page() {
  const router = useRouter();
  const { relationshipStatus, setRelationshipStatus } = useOnboardingStore();

  const handleSelect = (status: RelationshipStatus) => {
    setRelationshipStatus(status);
    router.push("/onboarding/step-8");
  };

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="flex-1 flex flex-col min-h-screen"
    >
      <OnboardingHeader showBack currentStep={7} totalSteps={14} />
      <ProgressBar currentStep={7} totalSteps={14} />

      <div className="flex-1 flex flex-col px-6 pt-8">
        <motion.h1
          variants={staggerItem}
          className="text-xl md:text-2xl font-bold text-center mb-8"
        >
          To get started, tell us about your current{" "}
          <span className="text-primary">relationship status</span>
        </motion.h1>

        <motion.div variants={staggerItem} className="space-y-3">
          {relationshipOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => handleSelect(option.value)}
              className={cn(
                "w-full flex items-center gap-4 p-4 rounded-xl transition-all duration-200",
                "bg-card hover:bg-card/80 border border-border hover:border-primary/50",
                relationshipStatus === option.value && "border-primary bg-primary/10"
              )}
            >
              <span className="text-2xl">{option.emoji}</span>
              <span className="font-medium">{option.label}</span>
            </button>
          ))}
        </motion.div>
      </div>
    </motion.div>
  );
}
