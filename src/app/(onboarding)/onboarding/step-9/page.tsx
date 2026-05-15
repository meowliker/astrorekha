"use client";

import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { OnboardingHeader, ProgressBar } from "@/components/onboarding/OnboardingHeader";
import { useOnboardingStore, ColorPreference } from "@/lib/onboarding-store";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const colorOptions: { value: ColorPreference; label: string; color: string }[] = [
  { value: "red", label: "Red", color: "#EF6B6B" },
  { value: "yellow", label: "Yellow", color: "#F5C542" },
  { value: "blue", label: "Blue", color: "#5B9BD5" },
  { value: "orange", label: "Orange", color: "#F5A442" },
  { value: "green", label: "Green", color: "#4ECDC4" },
  { value: "violet", label: "Violet", color: "#B57EDC" },
];

export default function Step9Page() {
  const router = useRouter();
  const { colorPreference, setColorPreference } = useOnboardingStore();

  const handleSelect = (color: ColorPreference) => {
    setColorPreference(color);
    router.push("/onboarding/step-10");
  };

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="flex-1 flex flex-col min-h-screen"
    >
      <OnboardingHeader showBack currentStep={9} totalSteps={14} />
      <ProgressBar currentStep={9} totalSteps={14} />

      <div className="flex-1 flex flex-col px-6 pt-8">
        <motion.h1
          variants={staggerItem}
          className="text-xl md:text-2xl font-bold text-center mb-2"
        >
          Which of the following <span className="text-primary">colors</span> do you prefer?
        </motion.h1>

        <motion.p
          variants={staggerItem}
          className="text-muted-foreground text-center text-sm mb-8"
        >
          The color is important for better personalization
        </motion.p>

        <motion.div variants={staggerItem} className="space-y-3">
          {colorOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => handleSelect(option.value)}
              className={cn(
                "w-full flex items-center gap-4 p-4 rounded-xl transition-all duration-200",
                "bg-card hover:bg-card/80 border border-border hover:border-primary/50",
                colorPreference === option.value && "border-primary bg-primary/10"
              )}
            >
              <div
                className="w-8 h-8 rounded-full"
                style={{ backgroundColor: option.color }}
              />
              <span className="font-medium">{option.label}</span>
            </button>
          ))}
        </motion.div>
      </div>
    </motion.div>
  );
}
