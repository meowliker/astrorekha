"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, Suspense } from "react";
import { fadeUp } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Check, Eye, EyeOff, ThumbsUp, Loader2 } from "lucide-react";
import { useOnboardingStore } from "@/lib/onboarding-store";
import { saveUserProfile } from "@/lib/user-profile";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { useHaptic } from "@/hooks/useHaptic";
import { pixelEvents } from "@/lib/pixel-events";
import { useSearchParams } from "next/navigation";

const progressSteps = [
  { label: "Order submitted", completed: true },
  { label: "Special offer", completed: true },
  { label: "Create account", active: true },
  { label: "Access to the app", completed: false },
];

const validatePassword = (password: string): { valid: boolean; message: string } => {
  if (password.length < 8) {
    return { valid: false, message: "Password must be at least 8 characters" };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: "Password must contain at least one uppercase letter" };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: "Password must contain at least one lowercase letter" };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: "Password must contain at least one number" };
  }
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return { valid: false, message: "Password must contain at least one special character" };
  }
  return { valid: true, message: "" };
};

function Step19Content() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);

  const onboardingData = useOnboardingStore();
  const searchParams = useSearchParams();

  // Route protection: Check if user has completed payment
  useEffect(() => {
    const hasCompletedPayment = localStorage.getItem("palmcosmic_payment_completed") === "true";
    const hasCompletedRegistration = localStorage.getItem("palmcosmic_registration_completed") === "true";
    
    // If user has completed registration, redirect to app
    if (hasCompletedRegistration) {
      router.replace("/home");
      return;
    }
    
    // Allow access only if payment is completed
    if (hasCompletedPayment) {
      setIsAuthorized(true);
    } else {
      // No valid payment - redirect to payment page
      router.replace("/onboarding/step-17");
      return;
    }
  }, [router]);

  // Get stored email from previous step
  useEffect(() => {
    const storedEmail = localStorage.getItem("palmcosmic_email");
    if (storedEmail) {
      setEmail(storedEmail);
    }
  }, []);

  // Track Purchase event for upsell purchases
  useEffect(() => {
    const upsellSuccess = searchParams.get("upsell_success");
    const offers = searchParams.get("offers");
    const sessionId = searchParams.get("session_id");
    
    if (upsellSuccess === "true" && offers && sessionId) {
      // Calculate upsell value based on offers
      const offerList = offers.split(",");
      const hasUltraPack = offerList.includes("ultra-pack");
      const upsellValue = hasUltraPack ? 9.99 : offerList.length * 6.99;
      
      // Track PURCHASE event for upsell - Critical for Meta ROAS tracking
      pixelEvents.purchase(upsellValue, `upsell-${offers}`, `Upsell: ${offers}`);
    }
  }, [searchParams]);

  const handleSignUp = async () => {
    if (!email || !password || password !== confirmPassword) {
      return;
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      setPasswordError(passwordValidation.message);
      return;
    }
    setPasswordError(null);

    setIsLoading(true);

    try {
      const anonId = localStorage.getItem("palmcosmic_anon_id") || localStorage.getItem("palmcosmic_user_id");

      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;

      localStorage.setItem("palmcosmic_user_id", uid);
      localStorage.setItem("palmcosmic_email", email);
      if (anonId) localStorage.setItem("palmcosmic_prev_anon_id", anonId);

      try {
        await fetch("/api/session", { method: "POST" });
      } catch (err) {
        console.error("Failed to set session:", err);
      }

      // IMPORTANT: Migrate data from anonymous user FIRST before creating new user doc
      // This preserves subscription data set by the Stripe webhook
      let migratedPlan: string | null = null;
      let migratedStatus: string = "none";
      let migratedCoins: number = 0;
      let migratedUnlocked: Record<string, boolean> = {};
      let migratedStripeCustomerId: string | null = null;
      let migratedStripeSubscriptionId: string | null = null;
      let migratedTrialEndsAt: string | null = null;

      if (anonId && anonId !== uid) {
        try {
          const anonUserSnap = await getDoc(doc(db, "users", anonId));
          if (anonUserSnap.exists()) {
            const anonData: any = anonUserSnap.data();
            migratedPlan = anonData.subscriptionPlan || null;
            migratedStatus = anonData.subscriptionStatus || "none";
            migratedCoins = anonData.coins || 0;
            migratedUnlocked = anonData.unlockedFeatures || {};
            migratedStripeCustomerId = anonData.stripeCustomerId || null;
            migratedStripeSubscriptionId = anonData.stripeSubscriptionId || null;
            migratedTrialEndsAt = anonData.trialEndsAt || null;
            
            console.log("Migrating from anon user:", anonId, "Plan:", migratedPlan, "Status:", migratedStatus);
          }
        } catch (err) {
          console.error("Failed to read anon user data:", err);
        }

        // Migrate other collections
        const migrateDoc = async (collectionName: string) => {
          try {
            const oldSnap = await getDoc(doc(db, collectionName, anonId));
            if (!oldSnap.exists()) return;
            await setDoc(doc(db, collectionName, uid), oldSnap.data(), { merge: true });
            console.log(`Migrated ${collectionName} from ${anonId} to ${uid}`);
          } catch (err) {
            console.error(`Failed to migrate ${collectionName}:`, err);
          }
        };

        await migrateDoc("user_profiles");
        await migrateDoc("palm_readings");
        await migrateDoc("chat_messages");
      }

      // Now create/update the user document with migrated data
      // Only set defaults if no migrated data exists
      // Auto-detect user's timezone for personalized email delivery
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";

      const userData: Record<string, any> = {
        email: email.toLowerCase(),
        timezone: userTimezone,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Preserve subscription data from migration (set by webhook on anon user)
      if (migratedPlan) userData.subscriptionPlan = migratedPlan;
      if (migratedStatus !== "none") userData.subscriptionStatus = migratedStatus;
      if (migratedCoins > 0) userData.coins = migratedCoins;
      if (Object.keys(migratedUnlocked).length > 0) userData.unlockedFeatures = migratedUnlocked;
      if (migratedStripeCustomerId) userData.stripeCustomerId = migratedStripeCustomerId;
      if (migratedStripeSubscriptionId) userData.stripeSubscriptionId = migratedStripeSubscriptionId;
      if (migratedTrialEndsAt) userData.trialEndsAt = migratedTrialEndsAt;

      await setDoc(doc(db, "users", uid), userData, { merge: true });
      
      console.log("User document created/updated:", uid, "with subscription:", migratedPlan, migratedStatus);

      const palmImage = localStorage.getItem("palmcosmic_palm_image");

      await saveUserProfile({
        userId: uid,
        email,
        gender: onboardingData.gender,
        birthMonth: onboardingData.birthMonth,
        birthDay: onboardingData.birthDay,
        birthYear: onboardingData.birthYear,
        birthHour: onboardingData.birthHour,
        birthMinute: onboardingData.birthMinute,
        birthPeriod: onboardingData.birthPeriod,
        birthPlace: onboardingData.birthPlace,
        knowsBirthTime: onboardingData.knowsBirthTime,
        relationshipStatus: onboardingData.relationshipStatus,
        goals: onboardingData.goals,
        colorPreference: onboardingData.colorPreference,
        elementPreference: onboardingData.elementPreference,
        sunSign: onboardingData.sunSign,
        moonSign: onboardingData.moonSign,
        ascendantSign: onboardingData.ascendantSign,
        palmImage: palmImage || null,
        createdAt: new Date().toISOString(),
      });

      setShowSuccess(true);
      pixelEvents.completeRegistration(email); // Track registration completion
    } catch (err) {
      console.error("Sign up failed:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const { triggerLight } = useHaptic();
  const handleContinue = () => {
    triggerLight();
    // Mark registration as completed
    localStorage.setItem("palmcosmic_registration_completed", "true");
    router.push("/onboarding/step-20");
  };

  // Show loading while checking authorization
  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={fadeUp}
      className="flex-1 flex flex-col min-h-screen bg-background relative"
    >
      {/* Progress indicator */}
      <div className="px-6 pt-6 pb-4">
        <div className="w-full max-w-md mx-auto">
          <div className="flex items-start">
            {progressSteps.map((step, index) => (
              <div key={step.label} className="flex items-center flex-1 last:flex-none">
                {/* Circle and label column */}
                <div className="flex flex-col items-center">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                      step.completed
                        ? "bg-primary text-primary-foreground"
                        : step.active
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {step.completed ? <Check className="w-4 h-4" /> : index + 1}
                  </div>
                  <span
                    className={`text-[10px] text-center mt-1 w-14 ${
                      step.active ? "text-primary font-medium" : "text-muted-foreground"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {/* Connector line */}
                {index < progressSteps.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-1 mt-3.5 ${
                      step.completed ? "bg-primary" : "bg-muted"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center px-6 py-4">
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-2xl md:text-3xl font-bold text-center mb-2"
        >
          Finish registration
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="text-muted-foreground text-center text-sm mb-8"
        >
          Create an account to access your PalmCosmic account
        </motion.p>

        {/* Form */}
        <div className="w-full max-w-sm space-y-4">
          {/* Email */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-12 px-4 bg-transparent border-b border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
            />
          </motion.div>

          {/* Password */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="relative"
          >
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Create password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-12 px-4 pr-12 bg-transparent border-b border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
            </button>
          </motion.div>

          {/* Confirm Password */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="relative"
          >
            <input
              type={showConfirmPassword ? "text" : "password"}
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full h-12 px-4 pr-12 bg-transparent border-b border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showConfirmPassword ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
            </button>
          </motion.div>

          {/* Password requirements hint */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-xs text-muted-foreground"
          >
            Password must be 8+ characters with uppercase, lowercase, number, and special character.
          </motion.p>

          {passwordError && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs text-red-400"
            >
              {passwordError}
            </motion.p>
          )}
        </div>
      </div>

      {/* Sign up button */}
      <div className="px-6 pb-24">
        <Button
          onClick={handleSignUp}
          disabled={!email || !password || password !== confirmPassword || isLoading}
          className="w-full h-14 text-lg font-semibold"
          size="lg"
        >
          {isLoading ? "Creating account..." : "Sign up with Email"}
        </Button>
      </div>

      {/* Success Modal */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-end"
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50" />

            {/* Modal */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative w-full bg-gradient-to-b from-card to-background rounded-t-3xl p-8 pb-12"
            >
              {/* Decorative stars */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                {[...Array(20)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute w-1 h-1 bg-white/30 rounded-full"
                    style={{
                      left: `${Math.random() * 100}%`,
                      top: `${Math.random() * 100}%`,
                    }}
                    animate={{
                      opacity: [0.3, 1, 0.3],
                      scale: [1, 1.5, 1],
                    }}
                    transition={{
                      duration: 2 + Math.random() * 2,
                      repeat: Infinity,
                      delay: Math.random() * 2,
                    }}
                  />
                ))}
              </div>

              <div className="flex flex-col items-center relative z-10">
                {/* Thumbs up icon */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                  className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center mb-6"
                >
                  <ThumbsUp className="w-10 h-10 text-primary" strokeWidth={1.5} />
                </motion.div>

                <motion.h2
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-2xl font-bold mb-4"
                >
                  Congratulations
                </motion.h2>

                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="text-muted-foreground text-center mb-8 max-w-xs"
                >
                  You have successfully registered for PalmCosmic. You can now access the app.
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="w-full"
                >
                  <Button
                    onClick={handleContinue}
                    className="w-full h-14 text-lg font-semibold"
                    size="lg"
                  >
                    Get My Prediction
                  </Button>
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function Step19Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <Step19Content />
    </Suspense>
  );
}
