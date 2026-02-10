"use client";

import { motion } from "framer-motion";
import { fadeUp } from "@/lib/motion";
import { useRouter } from "next/navigation";
import { useOnboardingStore } from "@/lib/onboarding-store";
import { OnboardingHeader, ProgressBar } from "@/components/onboarding/OnboardingHeader";
import { WheelPicker } from "@/components/onboarding/WheelPicker";
import { Button } from "@/components/ui/button";
import { useHaptic } from "@/hooks/useHaptic";

const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const days = Array.from({ length: 31 }, (_, i) => String(i + 1));
const years = Array.from({ length: 100 }, (_, i) => String(2010 - i));

export default function BirthdayPage() {
  const router = useRouter();
  const { birthMonth, birthDay, birthYear, setBirthDate } = useOnboardingStore();
  const { triggerLight } = useHaptic();

  const handleContinue = () => {
    triggerLight();
    router.push("/onboarding/birth-time");
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={fadeUp}
      className="flex-1 flex flex-col min-h-screen"
    >
      <OnboardingHeader showBack currentStep={2} totalSteps={14} />
      <ProgressBar currentStep={2} totalSteps={14} />

      <div className="flex-1 flex flex-col items-center px-6 pt-8">
        <h1 className="text-xl md:text-2xl font-bold text-center mb-2">
          When&apos;s your birthday?
        </h1>

        <p className="text-muted-foreground text-center text-sm max-w-sm mb-12">
          It&apos;s also important to know your date of birth for making complete and accurate predictions
        </p>

        <div className="flex gap-2 w-full max-w-md justify-center mb-auto">
          <WheelPicker
            items={months}
            value={birthMonth}
            onChange={(month) => setBirthDate(month, birthDay, birthYear)}
            className="flex-1"
            infinite
          />
          <WheelPicker
            items={days}
            value={birthDay}
            onChange={(day) => setBirthDate(birthMonth, day, birthYear)}
            className="w-20"
            infinite
          />
          <WheelPicker
            items={years}
            value={birthYear}
            onChange={(year) => setBirthDate(birthMonth, birthDay, year)}
            className="w-24"
          />
        </div>
      </div>

      <div className="px-6 pb-24">
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
