"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { useRouter } from "next/navigation";
import { useOnboardingStore, Gender } from "@/lib/onboarding-store";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Menu } from "lucide-react";
import { OnboardingSidebar } from "@/components/OnboardingSidebar";
import { pixelEvents } from "@/lib/pixel-events";

const genderOptions: { value: Gender; label: string; icon: string }[] = [
  { value: "female", label: "Female", icon: "♀" },
  { value: "male", label: "Male", icon: "♂" },
  { value: "non-binary", label: "Non-binary", icon: "⚥" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { gender, setGender } = useOnboardingStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Route protection: Check user status and redirect accordingly
  useEffect(() => {
    const hasCompletedPayment = localStorage.getItem("palmcosmic_payment_completed") === "true";
    const hasCompletedRegistration = localStorage.getItem("palmcosmic_registration_completed") === "true";
    
    if (hasCompletedRegistration) {
      router.replace("/home");
      return;
    } else if (hasCompletedPayment) {
      router.replace("/onboarding/step-18");
      return;
    }
  }, [router]);

  const handleGenderSelect = (selectedGender: Gender) => {
    setGender(selectedGender);
    pixelEvents.lead(); // Track lead when user starts onboarding
    router.push("/onboarding/birthday");
  };

  return (
    <>
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="flex-1 flex flex-col min-h-screen"
    >
      <header className="flex items-center justify-end px-4 py-4">
        <button 
          onClick={() => setSidebarOpen(true)}
          className="p-2 -mr-2 text-foreground/70 hover:text-foreground transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
      </header>

      <div className="flex-1 flex flex-col items-center px-6">
        <motion.div variants={staggerItem} className="flex flex-col items-center gap-2 mb-6">
          <Image
            src="/logo.png"
            alt="PalmCosmic"
            width={48}
            height={48}
            className="rounded-xl"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
          <span className="text-xl font-semibold">PalmCosmic</span>
        </motion.div>

        <motion.h1
          variants={staggerItem}
          className="text-2xl md:text-3xl font-bold text-center mb-2"
        >
          Personalized palm reading with
          <br />
          powerful predictions
        </motion.h1>

        <motion.p
          variants={staggerItem}
          className="text-muted-foreground text-center text-sm max-w-sm mb-12"
        >
          Complete a 1-minute quiz to get a personalized prediction. The result
          is not guaranteed and may vary from case to case.
        </motion.p>

        <motion.p
          variants={staggerItem}
          className="text-muted-foreground text-sm mb-6"
        >
          Select your gender to start
        </motion.p>

        <motion.div
          variants={staggerItem}
          className="flex gap-4 w-full max-w-md justify-center"
        >
          {genderOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => handleGenderSelect(option.value)}
              className={cn(
                "flex flex-col items-center justify-center gap-3 p-6 rounded-2xl transition-all duration-200",
                "bg-card hover:bg-card/80 border border-border hover:border-primary/50",
                "min-w-[100px] md:min-w-[120px]",
                gender === option.value && "border-primary bg-primary/10"
              )}
            >
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                <span className="text-2xl text-primary">{option.icon}</span>
              </div>
              <span className="text-sm font-medium">{option.label}</span>
            </button>
          ))}
        </motion.div>
      </div>
    </motion.div>
    <OnboardingSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    </>
  );
}
