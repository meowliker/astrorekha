"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, Suspense } from "react";
import { fadeUp } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Check, Eye, EyeOff, ThumbsUp, Loader2 } from "lucide-react";
import { useOnboardingStore } from "@/lib/onboarding-store";
import { saveUserProfile, calculateZodiacSign, generateUserId } from "@/lib/user-profile";
import { supabase } from "@/lib/supabase";
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
    const hasCompletedPayment = localStorage.getItem("astrorekha_payment_completed") === "true";
    const hasCompletedRegistration = localStorage.getItem("astrorekha_registration_completed") === "true";
    
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
    const storedEmail = localStorage.getItem("astrorekha_email");
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
      const anonId = localStorage.getItem("astrorekha_anon_id") || localStorage.getItem("astrorekha_user_id");

      // Register via API (handles password hashing + anon user migration)
      const registerResponse = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, anonId }),
      });

      const registerData = await registerResponse.json();

      if (!registerResponse.ok) {
        throw new Error(registerData.message || "Registration failed");
      }

      const uid = registerData.user.id;

      localStorage.setItem("astrorekha_user_id", uid);
      localStorage.setItem("astrorekha_email", email);
      if (anonId) localStorage.setItem("astrorekha_prev_anon_id", anonId);

      // Show success immediately - do background tasks after
      setShowSuccess(true);
      pixelEvents.completeRegistration(email);
      console.log("User registered:", uid);

      // Background tasks (non-blocking)
      const palmImage = localStorage.getItem("astrorekha_palm_image");
      
      // Fire and forget - don't wait for these
      fetch("/api/session", { method: "POST" }).catch(() => {});
      
      const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
      supabase.from("users").update({ timezone: userTimezone }).eq("id", uid);
      
      saveUserProfile({
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
      }).catch((err) => console.error("Profile save error:", err));

      // Pre-generate palm reading in background (so it's instant on dashboard)
      const bundleId = localStorage.getItem("astrorekha_bundle_id");
      const birthDate = `${onboardingData.birthYear}-${onboardingData.birthMonth}-${onboardingData.birthDay}`;
      const zodiacSign = calculateZodiacSign(onboardingData.birthMonth, onboardingData.birthDay);

      if (palmImage) {
        fetch("/api/palm-reading", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageData: palmImage, birthDate, zodiacSign }),
        })
          .then((res) => res.json())
          .then(async (result) => {
            if (result.success && result.reading) {
              await supabase.from("palm_readings").upsert(
                {
                  id: uid,
                  reading: result.reading,
                  palm_image_url: palmImage,
                  created_at: new Date().toISOString(),
                  birth_date: birthDate,
                  zodiac_sign: zodiacSign,
                },
                { onConflict: "id" }
              );
              console.log("Palm reading pre-generated successfully");
            }
          })
          .catch((err) => console.error("Background palm analysis error:", err));
      }

      // Pre-generate birth chart if user bought a bundle that includes it
      if (bundleId === "palm-birth" || bundleId === "palm-birth-compat") {
        const birthTime = onboardingData.knowsBirthTime
          ? (() => {
              let hour = parseInt(onboardingData.birthHour) || 12;
              const minute = onboardingData.birthMinute || "00";
              if (onboardingData.birthPeriod === "PM" && hour !== 12) hour += 12;
              if (onboardingData.birthPeriod === "AM" && hour === 12) hour = 0;
              return `${String(hour).padStart(2, "0")}:${minute}`;
            })()
          : "12:00";

        // Get geo coordinates first, then generate chart
        (async () => {
          try {
            let latitude = 28.6139, longitude = 77.209, timezone = 5.5;
            if (onboardingData.birthPlace) {
              const geoRes = await fetch("/api/astrology/geo", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ place_name: onboardingData.birthPlace }),
              });
              if (geoRes.ok) {
                const geoData = await geoRes.json();
                if (geoData.success && geoData.data) {
                  latitude = geoData.data.latitude;
                  longitude = geoData.data.longitude;
                  timezone = geoData.data.timezone;
                }
              }
            }
            const chartRes = await fetch("/api/astrology/birth-chart", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ birthDate, birthTime, latitude, longitude, timezone, chartType: "vedic" }),
            });
            const chartResult = await chartRes.json();
            if (chartResult.success && chartResult.data) {
              const cacheKey = `chart_${birthDate}_${birthTime}_${onboardingData.birthPlace || "unknown"}`.replace(/[^a-zA-Z0-9_]/g, "_") + "_vedic";
              await supabase.from("birth_charts").upsert(
                { id: cacheKey, data: { ...chartResult.data, cachedAt: new Date().toISOString() }, cached_at: new Date().toISOString() },
                { onConflict: "id" }
              );
              console.log("Birth chart pre-generated successfully");
            }
          } catch (err) {
            console.error("Background birth chart generation error:", err);
          }
        })();
      }
    } catch (err: any) {
      console.error("Sign up failed:", err);
      setPasswordError(err.message || "Registration failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const { triggerLight } = useHaptic();
  const handleContinue = () => {
    triggerLight();
    // Mark registration as completed
    localStorage.setItem("astrorekha_registration_completed", "true");
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
          Create an account to access your AstroRekha account
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
                  You have successfully registered for AstroRekha. You can now access the app.
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
