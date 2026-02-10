"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, Mail, Lock, Eye, EyeOff, Loader2, X, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { 
  signInWithEmailAndPassword, 
  signInWithCustomToken,
  sendPasswordResetEmail
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useUserStore } from "@/lib/user-store";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  
  // OTP Modal states
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpEmail, setOtpEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [otpCode, setOtpCode] = useState(["" , "", "", "", "", ""]);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Forgot Password states
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState("");
  const [forgotSuccess, setForgotSuccess] = useState(false);

  // User not found state
  const [showUserNotFound, setShowUserNotFound] = useState(false);
  const [notFoundEmail, setNotFoundEmail] = useState("");

  const { setSubscriptionPlan, setCoins, setFirebaseUserId } = useUserStore();

  const handleEmailPasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    if (!email || !password) {
      setError("Please enter both email and password");
      return;
    }

    setIsLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Save user info to localStorage
      localStorage.setItem("palmcosmic_user_id", user.uid);
      localStorage.setItem("palmcosmic_email", user.email || "");
      localStorage.setItem("palmcosmic_password", password); // For delete account verification
      
      // Set access cookie via API
      try {
        await fetch("/api/session", { method: "POST", credentials: "include" });
      } catch (err) {
        console.error("Failed to set session:", err);
      }

      // Hydrate store from Firestore and detect flow
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
          const data: any = snap.data();
          if (Object.prototype.hasOwnProperty.call(data, "subscriptionPlan")) {
            setSubscriptionPlan(data.subscriptionPlan ?? null);
          }
          if (typeof data.coins === "number") {
            setCoins(data.coins);
          }
          setFirebaseUserId(user.uid);
          
          // Detect and store user's flow type
          const userFlow = data.onboardingFlow || (data.purchaseType === "one-time" ? "flow-b" : "flow-a");
          localStorage.setItem("palmcosmic_onboarding_flow", userFlow);
          
          // Store purchase type for dashboard restrictions
          if (data.purchaseType) {
            localStorage.setItem("palmcosmic_purchase_type", data.purchaseType);
          }
        }
      } catch (err) {
        console.error("Failed to hydrate user after login:", err);
      }
      
      // Redirect to dashboard
      router.push("/reports");
    } catch (err: any) {
      console.error("Login error:", err);
      
      // Handle specific Firebase errors
      switch (err.code) {
        case "auth/unauthorized-domain":
          setError("Login is misconfigured (unauthorized domain). Please contact support.");
          break;
        case "auth/user-not-found":
          setError("No account found with this email. Please sign up first.");
          break;
        case "auth/wrong-password":
          setError("Incorrect password. Please try again.");
          break;
        case "auth/invalid-email":
          setError("Invalid email address.");
          break;
        case "auth/too-many-requests":
          setError("Too many failed attempts. Please try again later.");
          break;
        default:
          setError("Login failed. Please check your credentials.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendOtp = async () => {
    setOtpError("");
    
    if (!otpEmail) {
      setOtpError("Please enter your email address");
      return;
    }

    setOtpLoading(true);

    try {
      const response = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: otpEmail }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error === "USER_NOT_FOUND") {
          setNotFoundEmail(otpEmail);
          setShowOtpModal(false);
          setShowUserNotFound(true);
          return;
        }
        throw new Error(data.message || data.error || "Failed to send OTP");
      }

      setOtpSent(true);
      setOtpCode(["", "", "", "", "", ""]);
    } catch (err: any) {
      console.error("OTP send error:", err);
      setOtpError(err.message || "Failed to send OTP. Please try again.");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) {
      value = value.slice(-1);
    }
    
    const newOtp = [...otpCode];
    newOtp[index] = value;
    setOtpCode(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }

    // Auto-verify when all digits entered
    if (newOtp.every(digit => digit !== "") && newOtp.join("").length === 6) {
      handleVerifyOtp(newOtp.join(""));
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otpCode[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyOtp = async (code: string) => {
    setOtpError("");
    setOtpVerifying(true);

    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: otpEmail, otp: code }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Invalid OTP");
      }

      if (data.customToken) {
        try {
          await signInWithCustomToken(auth, data.customToken);
        } catch (err) {
          console.error("Failed to sign in with custom token:", err);
        }
      }

      // Login successful
      localStorage.setItem("palmcosmic_user_id", data.user.id);
      localStorage.setItem("palmcosmic_email", data.user.email);
      
      // Update user store
      if (Object.prototype.hasOwnProperty.call(data.user, "subscriptionPlan")) {
        setSubscriptionPlan(data.user.subscriptionPlan ?? null);
      }
      if (typeof data.user.coins === "number") {
        setCoins(data.user.coins);
      }
      setFirebaseUserId(data.user.id);
      
      // Detect and store user's flow type from OTP login
      const userFlow = data.user.onboardingFlow || (data.user.purchaseType === "one-time" ? "flow-b" : "flow-a");
      localStorage.setItem("palmcosmic_onboarding_flow", userFlow);
      
      // Store purchase type for dashboard restrictions
      if (data.user.purchaseType) {
        localStorage.setItem("palmcosmic_purchase_type", data.user.purchaseType);
      }

      // Set session
      try {
        await fetch("/api/session", { method: "POST", credentials: "include" });
      } catch (err) {
        console.error("Failed to set session:", err);
      }

      router.push("/reports");
    } catch (err: any) {
      console.error("OTP verify error:", err);
      setOtpError(err.message || "Invalid OTP. Please try again.");
      setOtpCode(["", "", "", "", "", ""]);
      otpInputRefs.current[0]?.focus();
    } finally {
      setOtpVerifying(false);
    }
  };

  const handleForgotPassword = async () => {
    setForgotError("");
    
    if (!forgotEmail) {
      setForgotError("Please enter your email address");
      return;
    }

    setForgotLoading(true);

    try {
      // Send password reset email using custom API
      const response = await fetch("/api/auth/send-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error === "USER_NOT_FOUND") {
          setNotFoundEmail(forgotEmail);
          setShowForgotPassword(false);
          setShowUserNotFound(true);
          return;
        }
        throw new Error(data.message || data.error || "Failed to send reset email");
      }

      setForgotSuccess(true);
    } catch (err: any) {
      console.error("Forgot password error:", err);
      setForgotError(err.message || "Failed to send reset email. Please try again.");
    } finally {
      setForgotLoading(false);
    }
  };

  const resetOtpModal = () => {
    setShowOtpModal(false);
    setOtpSent(false);
    setOtpEmail("");
    setOtpError("");
    setOtpCode(["", "", "", "", "", ""]);
  };

  const resetForgotModal = () => {
    setShowForgotPassword(false);
    setForgotEmail("");
    setForgotError("");
    setForgotSuccess(false);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <div className="w-full max-w-md h-screen bg-[#0A0E1A] overflow-hidden shadow-2xl shadow-black/50 flex flex-col relative">
        {/* Starry background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(80)].map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full bg-white animate-pulse"
              style={{
                width: `${Math.random() * 2 + 1}px`,
                height: `${Math.random() * 2 + 1}px`,
                top: `${Math.random() * 100}%`,
                left: `${Math.random() * 100}%`,
                opacity: Math.random() * 0.7 + 0.3,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${Math.random() * 2 + 2}s`,
              }}
            />
          ))}
        </div>

        {/* Content */}
        <div className="relative z-10 flex-1 flex flex-col px-6">
        {/* Back Button */}
        <motion.button
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={() => router.push("/welcome")}
          className="pt-6 pb-2 text-white/70 hover:text-white transition-colors self-start"
        >
          <ArrowLeft className="w-6 h-6" />
        </motion.button>

        {/* Logo and Title */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center mb-10 pt-8"
        >
          <div className="relative mb-4">
            <div className="absolute inset-0 blur-xl bg-primary/20 rounded-full scale-150" />
            <div className="relative w-20 h-20 rounded-2xl overflow-hidden border border-primary/30">
              <Image
                src="/logo.png"
                alt="PalmCosmic"
                width={80}
                height={80}
                className="object-cover w-full h-full"
              />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white">Welcome Back</h1>
          <p className="text-white/50 text-sm mt-1">Sign in to continue your journey</p>
        </motion.div>

        {/* Login Form */}
        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          onSubmit={handleEmailPasswordLogin}
          className="space-y-4"
        >
          {/* Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl"
            >
              <p className="text-red-400 text-sm text-center">{error}</p>
            </motion.div>
          )}

          {/* Email Field */}
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              className="w-full bg-[#1A1F2E] border border-white/10 rounded-xl pl-12 pr-4 py-4 text-white placeholder:text-white/40 focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          {/* Password Field */}
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full bg-[#1A1F2E] border border-white/10 rounded-xl pl-12 pr-12 py-4 text-white placeholder:text-white/40 focus:outline-none focus:border-primary transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          {/* Login Button */}
          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-14 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-500 text-white font-semibold text-lg rounded-xl"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              "Login"
            )}
          </Button>

          {/* Forgot Password Link */}
          <div className="text-center">
            <button
              type="button"
              onClick={() => setShowForgotPassword(true)}
              className="text-white/50 hover:text-white/70 text-sm transition-colors"
            >
              Forgot password?
            </button>
          </div>
        </motion.form>

        {/* OTP Sign In Link */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-6 text-center"
        >
          <button
            onClick={() => setShowOtpModal(true)}
            className="text-primary hover:text-primary/80 text-sm font-medium transition-colors"
          >
            Sign in with a code
          </button>
        </motion.div>

        {/* Sign Up Link */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-8 text-center"
        >
          <p className="text-white/50 text-sm">
            Don&apos;t have an account?{" "}
            <button
              onClick={() => router.push("/welcome")}
              className="text-primary hover:text-primary/80 font-medium transition-colors"
            >
              Sign up
            </button>
          </p>
        </motion.div>
        </div>
      </div>

      {/* OTP Modal */}
      <AnimatePresence>
        {showOtpModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={resetOtpModal}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#1A1F2E] rounded-2xl w-full max-w-sm p-6 border border-white/10 relative"
            >
              {/* Close Button */}
              <button
                onClick={resetOtpModal}
                className="absolute top-4 right-4 text-white/50 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>

              {!otpSent ? (
                <>
                  <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
                    <KeyRound className="w-7 h-7 text-primary" />
                  </div>
                  <h2 className="text-white text-xl font-bold text-center mb-2">
                    Sign in with Code
                  </h2>
                  <p className="text-white/60 text-center text-sm mb-6">
                    We&apos;ll send a 6-digit code to your email
                  </p>

                  {otpError && (
                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                      <p className="text-red-400 text-sm text-center">{otpError}</p>
                    </div>
                  )}

                  <div className="relative mb-4">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                    <input
                      type="email"
                      value={otpEmail}
                      onChange={(e) => setOtpEmail(e.target.value)}
                      placeholder="Enter your email"
                      className="w-full bg-[#0A0E1A] border border-white/20 rounded-xl pl-12 pr-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-primary"
                    />
                  </div>

                  <Button
                    onClick={handleSendOtp}
                    disabled={otpLoading}
                    className="w-full h-12 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-500 text-white font-semibold"
                  >
                    {otpLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      "Send Code"
                    )}
                  </Button>
                </>
              ) : (
                <>
                  <div className="text-center">
                    <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
                      <Mail className="w-7 h-7 text-primary" />
                    </div>
                    <h2 className="text-white text-xl font-bold mb-2">
                      Enter Verification Code
                    </h2>
                    <p className="text-white/60 text-sm mb-2">
                      We&apos;ve sent a 6-digit code to
                    </p>
                    <p className="text-primary font-medium mb-6">{otpEmail}</p>

                    {otpError && (
                      <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                        <p className="text-red-400 text-sm text-center">{otpError}</p>
                      </div>
                    )}

                    {/* OTP Input Fields */}
                    <div className="flex justify-center gap-2 mb-6">
                      {otpCode.map((digit, index) => (
                        <input
                          key={index}
                          ref={(el) => { otpInputRefs.current[index] = el; }}
                          type="text"
                          inputMode="numeric"
                          maxLength={1}
                          value={digit}
                          onChange={(e) => handleOtpChange(index, e.target.value.replace(/\D/g, ""))}
                          onKeyDown={(e) => handleOtpKeyDown(index, e)}
                          disabled={otpVerifying}
                          className="w-11 h-14 bg-[#0A0E1A] border-2 border-white/20 rounded-xl text-white text-center text-xl font-bold focus:outline-none focus:border-primary transition-colors disabled:opacity-50"
                        />
                      ))}
                    </div>

                    {otpVerifying && (
                      <div className="flex items-center justify-center gap-2 mb-4">
                        <Loader2 className="w-4 h-4 text-primary animate-spin" />
                        <span className="text-white/60 text-sm">Verifying...</span>
                      </div>
                    )}

                    <p className="text-white/40 text-xs mb-4">
                      Code expires in 10 minutes
                    </p>

                    <button
                      onClick={() => {
                        setOtpSent(false);
                        setOtpCode(["", "", "", "", "", ""]);
                      }}
                      className="text-primary hover:text-primary/80 text-sm font-medium"
                    >
                      Didn&apos;t receive code? Send again
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Forgot Password Modal */}
      <AnimatePresence>
        {showForgotPassword && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={resetForgotModal}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#1A1F2E] rounded-2xl w-full max-w-sm p-6 border border-white/10 relative"
            >
              {/* Close Button */}
              <button
                onClick={resetForgotModal}
                className="absolute top-4 right-4 text-white/50 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>

              {!forgotSuccess ? (
                <>
                  <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
                    <Lock className="w-7 h-7 text-primary" />
                  </div>
                  <h2 className="text-white text-xl font-bold text-center mb-2">
                    Forgot Password?
                  </h2>
                  <p className="text-white/60 text-center text-sm mb-6">
                    Enter your email and we&apos;ll send you a reset link
                  </p>

                  {forgotError && (
                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                      <p className="text-red-400 text-sm text-center">{forgotError}</p>
                    </div>
                  )}

                  <div className="relative mb-4">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                    <input
                      type="email"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="Enter your email"
                      className="w-full bg-[#0A0E1A] border border-white/20 rounded-xl pl-12 pr-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-primary"
                    />
                  </div>

                  <Button
                    onClick={handleForgotPassword}
                    disabled={forgotLoading}
                    className="w-full h-12 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-500 text-white font-semibold"
                  >
                    {forgotLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      "Send Reset Link"
                    )}
                  </Button>
                </>
              ) : (
                <>
                  <div className="text-center">
                    <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                      <Mail className="w-7 h-7 text-green-400" />
                    </div>
                    <h2 className="text-white text-xl font-bold mb-2">
                      Check Your Email
                    </h2>
                    <p className="text-white/60 text-sm mb-2">
                      We&apos;ve sent a password reset link to
                    </p>
                    <p className="text-primary font-medium mb-6">{forgotEmail}</p>
                    <p className="text-white/40 text-xs">
                      Click the link in the email to reset your password.
                    </p>
                  </div>

                  <Button
                    onClick={resetForgotModal}
                    variant="outline"
                    className="w-full h-12 mt-6 border-white/20 text-white hover:bg-white/10"
                  >
                    Close
                  </Button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* User Not Found Modal */}
      <AnimatePresence>
        {showUserNotFound && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowUserNotFound(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#1A1F2E] rounded-2xl w-full max-w-sm p-6 border border-white/10 relative"
            >
              {/* Close Button */}
              <button
                onClick={() => setShowUserNotFound(false)}
                className="absolute top-4 right-4 text-white/50 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl">😕</span>
                </div>
                <h2 className="text-white text-xl font-bold mb-2">
                  User Not Found
                </h2>
                <p className="text-white/60 text-sm mb-2">
                  No account exists with the email
                </p>
                <p className="text-primary font-medium mb-6">{notFoundEmail}</p>
              </div>

              <div className="space-y-3">
                <Button
                  onClick={() => {
                    setShowUserNotFound(false);
                    router.push("/welcome");
                  }}
                  className="w-full h-12 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-500 text-white font-semibold"
                >
                  Create New Account
                </Button>
                <Button
                  onClick={() => {
                    setShowUserNotFound(false);
                    setNotFoundEmail("");
                  }}
                  variant="outline"
                  className="w-full h-12 border-white/20 text-white hover:bg-white/10"
                >
                  Login with Other Account
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
