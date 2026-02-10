"use client";

import { motion } from "framer-motion";
import { fadeUp } from "@/lib/motion";
import { useRouter } from "next/navigation";
import { useOnboardingStore } from "@/lib/onboarding-store";
import { OnboardingHeader, ProgressBar } from "@/components/onboarding/OnboardingHeader";
import { Button } from "@/components/ui/button";
import { LocationInput } from "@/components/onboarding/LocationInput";
import { useHaptic } from "@/hooks/useHaptic";

export default function BirthplacePage() {
  const router = useRouter();
  const { birthPlace, setBirthPlace } = useOnboardingStore();
  const { triggerLight } = useHaptic();

  const handleContinue = () => {
    triggerLight();
    router.push("/onboarding/step-5");
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={fadeUp}
      className="flex-1 flex flex-col min-h-screen"
    >
      <OnboardingHeader showBack currentStep={4} totalSteps={14} />
      <ProgressBar currentStep={4} totalSteps={14} />

      <div className="flex-1 flex flex-col items-center px-6 pt-8">
        <h1 className="text-xl md:text-2xl font-bold text-center mb-2">
          Where were you born?
        </h1>

        <p className="text-muted-foreground text-center text-sm max-w-sm mb-8">
          The place is important to explore your core personality traits, needs, and desires
        </p>

        <div className="w-full max-w-md">
          <LocationInput
            placeholder="Your birthplace"
            value={birthPlace}
            onChange={setBirthPlace}
          />
        </div>
      </div>

      <div className="px-6 pb-24">
        <Button
          onClick={handleContinue}
          className="w-full h-14 text-lg font-semibold"
          size="lg"
          disabled={!birthPlace.trim()}
        >
          Continue
        </Button>
      </div>
    </motion.div>
  );
}
