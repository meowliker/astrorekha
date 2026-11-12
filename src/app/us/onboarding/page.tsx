"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { useOnboardingRouter as useRouter } from "@/components/us-main/Experience";
import { useOnboardingStore, Gender } from "@/lib/us-main/onboarding-store";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Menu } from "lucide-react";
import { OnboardingSidebar } from "@/components/us-main/Sidebar";
import { useGoogleAdsExperience, useOnboardingAssets } from "@/components/us-main/Experience";
import { pixelEvents } from "@/lib/us-main/pixel-events";
import { track } from "@/lib/us-main/analytics";

const genderOptions: { value: Gender; label: string; icon: string }[] = [
  { value: "female", label: "Female", icon: "♀" },
  { value: "male", label: "Male", icon: "♂" },
  { value: "non-binary", label: "Non-binary", icon: "⚥" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const googleAds = useGoogleAdsExperience();
  const assets = useOnboardingAssets();
  const { gender, setGender } = useOnboardingStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Route protection: Check user status and redirect accordingly
  useEffect(() => {
    if (googleAds) {
      try {
        localStorage.setItem("astrorekha_us_main_onboarding_flow", "flow-a");
        localStorage.setItem("astrorekha_us_main_layout_variant", "A");
      } catch { /* Public questions remain available if storage is blocked. */ }
      return;
    }
    const hasCompletedPayment = localStorage.getItem("astrorekha_us_main_payment_completed") === "true";
    const hasCompletedRegistration = localStorage.getItem("astrorekha_us_main_registration_completed") === "true";
    localStorage.setItem("astrorekha_us_main_onboarding_flow", "flow-a");
    localStorage.setItem("astrorekha_us_main_layout_variant", "A");

    if (hasCompletedRegistration) {
      router.replace("/dashboard");
      return;
    } else if (hasCompletedPayment) {
      router.replace("/us/onboarding/bundle-upsell");
      return;
    }
  }, [router, googleAds]);

  const handleGenderSelect = (selectedGender: Gender) => {
    track("quiz_start", { quiz_id: "onboarding" });
    setGender(selectedGender);
    pixelEvents.lead(); // Track lead when user starts onboarding
    router.push("/us/onboarding/birthday");
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
            src={assets.logo}
            alt="AstroRekha"
            width={48}
            height={48}
            unoptimized
            className="rounded-xl"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
          <span className="text-xl font-semibold">AstroRekha</span>
        </motion.div>

        <motion.h1
          variants={staggerItem}
          className="text-2xl md:text-3xl font-bold text-center mb-2"
        >
          {googleAds ? <>Personalized palm reading<br />with AI-generated insights</> : <>Personalized palm reading with<br />powerful predictions</>}
        </motion.h1>

        <motion.p
          variants={staggerItem}
          className="text-muted-foreground text-center text-sm max-w-sm mb-12"
        >
          {googleAds ? "Answer a few questions and add your palm photo. Explore digital readings for personal reflection, then choose a paid bundle." : "Complete a 1-minute quiz to get a personalized prediction. The result is not guaranteed and may vary from case to case."}
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
