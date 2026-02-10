"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X, CreditCard } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface TrialStatusBannerProps {
  className?: string;
}

export function TrialStatusBanner({ className = "" }: TrialStatusBannerProps) {
  const router = useRouter();
  const [showBanner, setShowBanner] = useState(false);
  const [bannerType, setBannerType] = useState<"trial_ended" | "payment_failed" | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    checkSubscriptionStatus();
  }, []);

  const checkSubscriptionStatus = async () => {
    try {
      // Check if there's a subscription status in localStorage or from URL params
      const urlParams = new URLSearchParams(window.location.search);
      const paymentStatus = urlParams.get("payment_status");
      const trialEnded = urlParams.get("trial_ended");

      if (paymentStatus === "failed") {
        setBannerType("payment_failed");
        setShowBanner(true);
        return;
      }

      if (trialEnded === "true") {
        setBannerType("trial_ended");
        setShowBanner(true);
        return;
      }

      // Check subscription status from localStorage
      const subscriptionStatus = localStorage.getItem("palmcosmic_subscription_status");
      const trialEndDate = localStorage.getItem("palmcosmic_trial_end_date");

      if (subscriptionStatus === "payment_failed") {
        setBannerType("payment_failed");
        setShowBanner(true);
        return;
      }

      // Check if trial has ended
      if (trialEndDate) {
        const endDate = new Date(trialEndDate);
        if (new Date() > endDate) {
          // Trial has ended, check if payment was successful
          const paymentCompleted = localStorage.getItem("palmcosmic_payment_completed");
          if (paymentCompleted !== "true") {
            setBannerType("trial_ended");
            setShowBanner(true);
          }
        }
      }
    } catch (error) {
      console.error("Error checking subscription status:", error);
    }
  };

  const handleCompletePayment = () => {
    router.push("/manage-subscription");
  };

  const handleDismiss = () => {
    setDismissed(true);
    // Don't permanently dismiss - just hide for this session
    setTimeout(() => setDismissed(false), 60000); // Show again after 1 minute
  };

  if (!showBanner || dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className={`fixed top-0 left-0 right-0 z-50 ${className}`}
      >
        <div className={`mx-auto max-w-md ${
          bannerType === "payment_failed" 
            ? "bg-red-500" 
            : "bg-orange-500"
        }`}>
          <div className="px-4 py-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-white flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-white font-medium text-sm">
                  {bannerType === "payment_failed" 
                    ? "Payment Failed" 
                    : "Trial Ended"}
                </p>
                <p className="text-white/90 text-xs mt-0.5">
                  {bannerType === "payment_failed"
                    ? "Your payment could not be processed. Please update your payment method to continue using the app."
                    : "Your free trial has ended. Complete your payment to continue enjoying all features."}
                </p>
                <Button
                  onClick={handleCompletePayment}
                  size="sm"
                  className="mt-2 bg-white text-black hover:bg-white/90 h-8 text-xs"
                >
                  <CreditCard className="w-3 h-3 mr-1" />
                  {bannerType === "payment_failed" ? "Update Payment" : "Complete Payment"}
                </Button>
              </div>
              <button
                onClick={handleDismiss}
                className="text-white/80 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
