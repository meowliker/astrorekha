"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { fadeUp } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { Check, Eye, EyeOff, ThumbsUp } from "lucide-react";

const progressSteps = [
  { label: "Order submitted", completed: true },
  { label: "Special offer", completed: true },
  { label: "Create account", active: true },
  { label: "Access to the app", completed: false },
];

const getPasswordRuleState = (password: string) => {
  const rules = {
    minLength: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
  };
  const valid = Object.values(rules).every(Boolean);
  return { valid, rules };
};

const getPasswordValidationMessage = (password: string): string => {
  const { rules } = getPasswordRuleState(password);
  if (!rules.minLength) return "Password must be at least 8 characters.";
  if (!rules.uppercase) return "Add at least one uppercase letter (A-Z).";
  if (!rules.lowercase) return "Add at least one lowercase letter (a-z).";
  if (!rules.number) return "Add at least one number (0-9).";
  if (!rules.special) return "Add at least one special character (!@#$...).";
  return "";
};

export default function RegistrationPreviewPage() {
  const [email, setEmail] = useState("test@example.com");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const passwordRuleState = getPasswordRuleState(password);
  const confirmPasswordMismatch =
    confirmPassword.length > 0 && password.length > 0 && password !== confirmPassword;

  const handleSignUp = async () => {
    if (!email.trim()) {
      setPasswordError("Please enter your email.");
      return;
    }

    if (!password) {
      setPasswordError("Please create a password.");
      return;
    }

    if (!confirmPassword) {
      setPasswordError("Please confirm your password.");
      return;
    }

    if (password !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    if (!passwordRuleState.valid) {
      setPasswordError(getPasswordValidationMessage(password));
      return;
    }

    setPasswordError(null);
    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 600));
    setIsLoading(false);
    setShowSuccess(true);
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={fadeUp}
      className="flex-1 flex flex-col min-h-screen bg-background relative"
    >
      <div className="px-6 pt-6 pb-4">
        <div className="w-full max-w-md mx-auto">
          <div className="flex items-start">
            {progressSteps.map((step, index) => (
              <div key={step.label} className="flex items-center flex-1 last:flex-none">
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

        <div className="w-full max-w-sm space-y-4">
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

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-xs text-muted-foreground"
          >
            Password must be 8+ characters with uppercase, lowercase, number, and special character.
          </motion.p>

          <div className="space-y-1 text-xs text-muted-foreground">
            <p className={passwordRuleState.rules.minLength ? "text-emerald-400" : ""}>
              {passwordRuleState.rules.minLength ? "✓" : "•"} Minimum 8 characters
            </p>
            <p className={passwordRuleState.rules.uppercase ? "text-emerald-400" : ""}>
              {passwordRuleState.rules.uppercase ? "✓" : "•"} One uppercase letter
            </p>
            <p className={passwordRuleState.rules.lowercase ? "text-emerald-400" : ""}>
              {passwordRuleState.rules.lowercase ? "✓" : "•"} One lowercase letter
            </p>
            <p className={passwordRuleState.rules.number ? "text-emerald-400" : ""}>
              {passwordRuleState.rules.number ? "✓" : "•"} One number
            </p>
            <p className={passwordRuleState.rules.special ? "text-emerald-400" : ""}>
              {passwordRuleState.rules.special ? "✓" : "•"} One special character
            </p>
            {confirmPasswordMismatch ? <p className="text-red-400">✗ Passwords do not match</p> : null}
          </div>

          {passwordError && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-red-400">
              {passwordError}
            </motion.p>
          )}
        </div>
      </div>

      <div className="px-6 pb-24">
        <div className="mx-auto w-full max-w-sm">
          <Button
            onClick={handleSignUp}
            disabled={!email || !password || !confirmPassword || isLoading}
            className="w-full h-14 text-lg font-semibold"
            size="lg"
          >
            {isLoading ? "Creating account..." : "Sign up with Email"}
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-end"
          >
            <div className="absolute inset-0 bg-black/50" />

            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative w-full bg-gradient-to-b from-card to-background rounded-t-3xl p-8 pb-12"
            >
              <div className="flex flex-col items-center relative z-10">
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
                  <Button onClick={() => setShowSuccess(false)} className="w-full h-14 text-lg font-semibold" size="lg">
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
