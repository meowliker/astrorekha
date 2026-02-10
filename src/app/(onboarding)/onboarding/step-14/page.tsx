"use client";

import { motion } from "framer-motion";
import { fadeUp } from "@/lib/motion";
import { OnboardingHeader, ProgressBar } from "@/components/onboarding/OnboardingHeader";
import { ForecastSphere } from "@/components/onboarding/ForecastSphere";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function Step14Page() {
  const router = useRouter();

  const handleBack = () => {
    router.push("/onboarding/step-13");
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={fadeUp}
      className="flex-1 flex flex-col min-h-screen"
    >
      <OnboardingHeader showBack currentStep={14} totalSteps={14} onBack={handleBack} />
      <ProgressBar currentStep={14} totalSteps={14} />

      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-8">
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xl md:text-2xl font-bold text-center mb-6"
        >
          Forecast accuracy
        </motion.h1>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-8"
        >
          <ForecastSphere targetPercentage={100} startPercentage={68} duration={2.5} size={180} />
        </motion.div>

        {/* Speech bubble */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.5 }}
          className="relative bg-card border border-border rounded-2xl px-6 py-4 max-w-sm mb-2"
        >
          <p className="text-center text-sm">
            Maximum accuracy reached! Let&apos;s reveal your powerful prediction!
          </p>
          {/* Speech bubble pointer */}
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-card border-r border-b border-border rotate-45" />
        </motion.div>

        {/* Avatar */}
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1.8 }}
          className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/30 to-purple-500/30 flex items-center justify-center text-lg mt-2"
        >
          🔮
        </motion.div>
      </div>

      <div className="p-6">
        <Link href="/onboarding/step-15">
          <Button className="w-full h-14 text-lg font-semibold" size="lg">
            Get the Results!
          </Button>
        </Link>
      </div>
    </motion.div>
  );
}
