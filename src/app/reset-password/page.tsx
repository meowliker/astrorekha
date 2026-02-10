"use client";

import { useState, useEffect, Suspense } from "react";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Lock, Eye, EyeOff, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { auth } from "@/lib/firebase";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oobCode = searchParams.get("oobCode");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [email, setEmail] = useState("");
  const [isValidCode, setIsValidCode] = useState<boolean | null>(null);

  useEffect(() => {
    // Verify the reset code is valid
    if (oobCode) {
      verifyPasswordResetCode(auth, oobCode)
        .then((email) => {
          setEmail(email);
          setIsValidCode(true);
        })
        .catch((error) => {
          console.error("Invalid reset code:", error);
          setIsValidCode(false);
          setError("This password reset link is invalid or has expired.");
        });
    } else {
      setIsValidCode(false);
      setError("No reset code provided. Please request a new password reset link.");
    }
  }, [oobCode]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!password || !confirmPassword) {
      setError("Please fill in all fields");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (!oobCode) {
      setError("Invalid reset link");
      return;
    }

    setIsLoading(true);

    try {
      await confirmPasswordReset(auth, oobCode, password);
      setSuccess(true);
    } catch (err: any) {
      console.error("Password reset error:", err);
      
      switch (err.code) {
        case "auth/expired-action-code":
          setError("This reset link has expired. Please request a new one.");
          break;
        case "auth/invalid-action-code":
          setError("This reset link is invalid. Please request a new one.");
          break;
        case "auth/weak-password":
          setError("Password is too weak. Please use a stronger password.");
          break;
        default:
          setError("Failed to reset password. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Loading state while verifying code
  if (isValidCode === null) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-4" />
          <p className="text-white/60">Verifying reset link...</p>
        </div>
      </div>
    );
  }

  // Invalid code state
  if (isValidCode === false) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-full max-w-md bg-[#0A0E1A] p-8 rounded-2xl border border-white/10 text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">❌</span>
          </div>
          <h1 className="text-white text-xl font-bold mb-2">Invalid Reset Link</h1>
          <p className="text-white/60 text-sm mb-6">{error}</p>
          <Button
            onClick={() => router.push("/login")}
            className="w-full h-12 bg-gradient-to-r from-primary to-purple-600"
          >
            Back to Login
          </Button>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-full max-w-md bg-[#0A0E1A] p-8 rounded-2xl border border-white/10 text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-400" />
          </div>
          <h1 className="text-white text-xl font-bold mb-2">Password Reset Successful!</h1>
          <p className="text-white/60 text-sm mb-6">
            Your password has been updated. You can now sign in with your new password.
          </p>
          <Button
            onClick={() => router.push("/login")}
            className="w-full h-12 bg-gradient-to-r from-primary to-purple-600"
          >
            Go to Login
          </Button>
        </div>
      </div>
    );
  }

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
        <div className="relative z-10 flex-1 flex flex-col px-6 justify-center">
          {/* Logo and Title */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center mb-10"
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
            <h1 className="text-2xl font-bold text-white">Reset Password</h1>
            <p className="text-white/50 text-sm mt-1">
              Create a new password for {email}
            </p>
          </motion.div>

          {/* Reset Form */}
          <motion.form
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            onSubmit={handleResetPassword}
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

            {/* New Password Field */}
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="New password"
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

            {/* Confirm Password Field */}
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
              <input
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="w-full bg-[#1A1F2E] border border-white/10 rounded-xl pl-12 pr-12 py-4 text-white placeholder:text-white/40 focus:outline-none focus:border-primary transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60"
              >
                {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-14 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-500 text-white font-semibold text-lg rounded-xl"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                "Reset Password"
              )}
            </Button>
          </motion.form>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto mb-4" />
            <p className="text-white/60">Loading...</p>
          </div>
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
