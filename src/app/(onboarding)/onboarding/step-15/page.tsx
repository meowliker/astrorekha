"use client";

import { motion } from "framer-motion";
import { useState, useEffect, useMemo } from "react";
import { fadeUp } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Shield } from "lucide-react";
import { useHaptic } from "@/hooks/useHaptic";
import { pixelEvents } from "@/lib/pixel-events";
import { useOnboardingStore } from "@/lib/onboarding-store";
import { db } from "@/lib/firebase";
import { doc, setDoc, collection, query, where, getDocs } from "firebase/firestore";
import { generateUserId } from "@/lib/user-profile";

// Generate random stats with some variation for authenticity
function generateRandomStats() {
  const baseStats = [
    { label: "Love", color: "#EF6B6B", min: 72, max: 95 },
    { label: "Health", color: "#4ECDC4", min: 68, max: 92 },
    { label: "Wisdom", color: "#F5C542", min: 65, max: 88 },
    { label: "Career", color: "#8B5CF6", min: 58, max: 85 },
  ];
  return baseStats.map((stat) => ({
    label: stat.label,
    color: stat.color,
    value: Math.floor(Math.random() * (stat.max - stat.min + 1)) + stat.min,
  }));
}

export default function Step15Page() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [palmImage, setPalmImage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);

  // Get user data from onboarding store
  const { gender, birthYear, relationshipStatus, goals } = useOnboardingStore();

  // Generate random stats once on mount
  const readingStats = useMemo(() => generateRandomStats(), []);

  // Load captured palm image from localStorage and track ViewContent
  useEffect(() => {
    const savedImage = localStorage.getItem("palmcosmic_palm_image");
    if (savedImage) {
      setPalmImage(savedImage);
    }
    // Track ViewContent when user sees their palm reading report
    pixelEvents.viewContent("Palm Reading Report", "report");
  }, []);

  const isValidEmail = (value: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  };

  const { triggerLight } = useHaptic();
  
  // Check if email already has an active subscription or bundle purchase
  const checkExistingSubscription = async (emailToCheck: string): Promise<boolean> => {
    try {
      // Check in users collection for existing subscription OR bundle purchase
      const usersQuery = query(
        collection(db, "users"),
        where("email", "==", emailToCheck)
      );
      const usersSnapshot = await getDocs(usersQuery);
      
      for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data();
        // Check if user has an active subscription
        if (userData.subscriptionStatus === "active" || userData.isSubscribed === true) {
          return true;
        }
        // Check if user has purchased a bundle (Flow B)
        if (userData.bundlePurchased || userData.purchaseType === "one-time") {
          return true;
        }
      }
      
      // Also check payments collection for completed subscription OR bundle payments
      const paymentsQuery = query(
        collection(db, "payments"),
        where("customerEmail", "==", emailToCheck)
      );
      const paymentsSnapshot = await getDocs(paymentsQuery);
      
      if (!paymentsSnapshot.empty) {
        // Check if any payment has active/succeeded status
        for (const paymentDoc of paymentsSnapshot.docs) {
          const paymentData = paymentDoc.data();
          const paymentType = paymentData.type;
          const isSuccessful = paymentData.paymentStatus === "paid" || paymentData.status === "succeeded";
          
          // Block if subscription or bundle payment is successful
          if (isSuccessful && (paymentType === "subscription" || paymentType === "bundle_payment")) {
            return true;
          }
        }
      }
      
      return false;
    } catch (err) {
      console.error("Error checking subscription:", err);
      return false;
    }
  };

  const handleContinue = async () => {
    triggerLight();
    const trimmed = email.trim();

    // Email is required
    if (trimmed.length === 0) {
      setEmailError("Please enter your email address to continue.");
      return;
    }

    // Validate email format
    if (!isValidEmail(trimmed)) {
      setEmailError("Please enter a valid email address.");
      return;
    }

    setEmailError(null);

    // Store email and save to Firebase
    {
      // Check if email already has an active subscription
      setIsCheckingEmail(true);
      const hasSubscription = await checkExistingSubscription(trimmed);
      setIsCheckingEmail(false);
      
      if (hasSubscription) {
        setEmailError("This email is already registered with an active subscription. Please use a different email or log in to your existing account.");
        return;
      }
      
      localStorage.setItem("palmcosmic_email", trimmed);
      // Track AddToWishlist when user provides email
      pixelEvents.addToWishlist("Personalized Palm Reading Report");
      
      // Save lead data to Firebase
      setIsSaving(true);
      try {
        const userId = generateUserId();
        const currentYear = new Date().getFullYear();
        const age = birthYear ? currentYear - parseInt(birthYear) : null;
        
        await setDoc(doc(db, "leads", `lead_${Date.now()}_${userId.slice(-6)}`), {
          email: trimmed,
          gender: gender || "not specified",
          age: age,
          relationshipStatus: relationshipStatus || "not specified",
          goals: goals || [],
          subscriptionStatus: "no",
          userId: userId,
          createdAt: new Date().toISOString(),
          source: "onboarding_step_15",
        });
        
        // Also update the user document with email
        await setDoc(doc(db, "users", userId), {
          email: trimmed,
          gender: gender || null,
          age: age,
          relationshipStatus: relationshipStatus || null,
          goals: goals || [],
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      } catch (err) {
        console.error("Failed to save lead data:", err);
      } finally {
        setIsSaving(false);
      }
    }
    router.push("/onboarding/step-17");
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={fadeUp}
      className="flex-1 flex flex-col min-h-screen bg-background"
    >
      <div className="flex-1 flex flex-col items-center px-6 py-8 overflow-y-auto">
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xl md:text-2xl font-bold text-center mb-6"
          style={{ fontFamily: "var(--font-philosopher, serif)" }}
        >
          Your palm reading report is ready
        </motion.h1>

        {/* Overview Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="w-full max-w-sm bg-card border border-border rounded-2xl p-4 mb-6"
        >
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
            OVERVIEW
          </h2>

          <div className="flex gap-4 mb-4">
            {/* Palm image - use captured photo if available */}
            <div className="w-24 h-28 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
              {palmImage ? (
                <img
                  src={palmImage}
                  alt="Your palm"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                  Palm
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="flex-1 space-y-3">
              {readingStats.map((stat, index) => (
                <div key={stat.label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{stat.label}</span>
                    <span className="text-muted-foreground">{stat.value}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: stat.color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${stat.value}%` }}
                      transition={{ delay: 0.5 + index * 0.15, duration: 0.8 }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Reading descriptions */}
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Your <span className="text-[#EF6B6B] font-medium">Heart Line</span> shows that you are very passionate and freely express your thoughts and feelings.
            </p>
            <p>
              Your <span className="text-[#4ECDC4] font-medium">Life Line</span> means positive changes or recovery from illness in your future and overall completion of your life goals.
            </p>
          </div>
        </motion.div>

        {/* Email signup section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="w-full max-w-sm"
        >
          <h2 className="text-lg font-semibold text-center mb-4">
            Sign up to understand yourself better with PalmCosmic
          </h2>

          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (emailError) setEmailError(null);
            }}
            className="w-full h-12 px-4 bg-white/10 border border-primary/30 rounded-lg text-white placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 mb-2"
          />

          {emailError && (
            <p className="text-red-400 text-sm mb-4 text-center">{emailError}</p>
          )}

          <div className="flex items-start gap-2 text-xs text-muted-foreground mb-6">
            <Shield className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
            <p>
              Your personal data is safe with us. We&apos;ll use your email for updates, receipts, and subscription details.
            </p>
          </div>
        </motion.div>
      </div>

      <div className="px-6 pb-24">
        <Button
          onClick={handleContinue}
          className="w-full h-14 text-lg font-semibold"
          size="lg"
          disabled={isCheckingEmail || isSaving}
        >
          {isCheckingEmail ? "Checking..." : isSaving ? "Saving..." : "Continue"}
        </Button>
      </div>
    </motion.div>
  );
}
