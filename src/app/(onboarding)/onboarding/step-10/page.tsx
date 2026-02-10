"use client";

import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { OnboardingHeader, ProgressBar } from "@/components/onboarding/OnboardingHeader";
import { useOnboardingStore, ElementPreference } from "@/lib/onboarding-store";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const elementOptions: { value: ElementPreference; label: string; icon: string; color: string }[] = [
  { value: "earth", label: "Earth", icon: "≡", color: "#8B7355" },
  { value: "water", label: "Water", icon: "≈", color: "#5B9BD5" },
  { value: "fire", label: "Fire", icon: "🔥", color: "#EF6B6B" },
  { value: "air", label: "Air", icon: "◎", color: "#A8D8EA" },
];

export default function Step10Page() {
  const router = useRouter();
  const { elementPreference, setElementPreference } = useOnboardingStore();

  const handleSelect = (element: ElementPreference) => {
    setElementPreference(element);
    router.push("/onboarding/step-11");
  };

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="flex-1 flex flex-col min-h-screen"
    >
      <OnboardingHeader showBack currentStep={10} totalSteps={14} />
      <ProgressBar currentStep={10} totalSteps={14} />

      <div className="flex-1 flex flex-col px-6 pt-8">
        <motion.h1
          variants={staggerItem}
          className="text-xl md:text-2xl font-bold text-center mb-2"
        >
          Which <span className="text-primary">element of nature</span> do you like the best?
        </motion.h1>

        <motion.p
          variants={staggerItem}
          className="text-muted-foreground text-center text-sm mb-8"
        >
          The element of nature is important for better personalization
        </motion.p>

        <motion.div variants={staggerItem} className="space-y-3">
          {elementOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => handleSelect(option.value)}
              className={cn(
                "w-full flex items-center gap-4 p-4 rounded-xl transition-all duration-200",
                "bg-card hover:bg-card/80 border border-border hover:border-primary/50",
                elementPreference === option.value && "border-primary bg-primary/10"
              )}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-lg font-bold"
                style={{ backgroundColor: option.color }}
              >
                {option.icon}
              </div>
              <span className="font-medium">{option.label}</span>
            </button>
          ))}
        </motion.div>
      </div>
    </motion.div>
  );
}
