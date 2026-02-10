"use client";

import { motion } from "framer-motion";
import { fadeUp } from "@/lib/motion";
import { useRouter } from "next/navigation";
import { useOnboardingStore } from "@/lib/onboarding-store";
import { OnboardingHeader, ProgressBar } from "@/components/onboarding/OnboardingHeader";
import { WheelPicker } from "@/components/onboarding/WheelPicker";
import { Button } from "@/components/ui/button";
import { useHaptic } from "@/hooks/useHaptic";

const hours = Array.from({ length: 12 }, (_, i) => String(i + 1));
const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));
const periods: ("AM" | "PM")[] = ["AM", "PM"];

export default function BirthTimePage() {
  const router = useRouter();
  const { birthHour, birthMinute, birthPeriod, setBirthTime, setKnowsBirthTime } = useOnboardingStore();
  const { triggerLight } = useHaptic();
  
  const handleContinue = () => {
    triggerLight();
    router.push("/onboarding/birthplace");
  };

  const handleDontRemember = () => {
    setKnowsBirthTime(false);
    router.push("/onboarding/birthplace");
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={fadeUp}
      className="flex-1 flex flex-col min-h-screen"
    >
      <OnboardingHeader showBack currentStep={3} totalSteps={14} />
      <ProgressBar currentStep={3} totalSteps={14} />

      <div className="flex-1 flex flex-col items-center px-6 pt-8">
        <h1 className="text-xl md:text-2xl font-bold text-center mb-2">
          Do you know your birth time?
        </h1>

        <p className="text-muted-foreground text-center text-sm max-w-sm mb-12">
          This helps us find out where planets were placed in the sky at the moment of your birth
        </p>

        <div className="flex gap-2 w-full max-w-sm justify-center mb-auto">
          <WheelPicker
            items={hours}
            value={birthHour}
            onChange={(hour) => setBirthTime(hour, birthMinute, birthPeriod)}
            className="w-20"
            infinite
          />
          <WheelPicker
            items={minutes}
            value={birthMinute}
            onChange={(minute) => setBirthTime(birthHour, minute, birthPeriod)}
            className="w-20"
            infinite
          />
          <WheelPicker
            items={periods}
            value={birthPeriod}
            onChange={(period) => setBirthTime(birthHour, birthMinute, period as "AM" | "PM")}
            className="w-20"
          />
        </div>
      </div>

      <div className="px-6 pb-24 space-y-3">
        <button
          onClick={handleDontRemember}
          className="w-full text-primary hover:text-primary/80 text-sm font-medium transition-colors"
        >
          I don&apos;t remember
        </button>
        
        <Button
          onClick={handleContinue}
          className="w-full h-14 text-lg font-semibold"
          size="lg"
        >
          Continue
        </Button>
      </div>
    </motion.div>
  );
}
