"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Lock, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUserStore, featureNames, featurePrices, UnlockedFeatures } from "@/lib/user-store";
import { generateUserId } from "@/lib/user-profile";

// Map feature keys to report IDs for Stripe checkout
const featureToReportId: Record<keyof UnlockedFeatures, string> = {
  palmReading: "report-palm",
  prediction2026: "report-2026",
  birthChart: "report-birth-chart",
  compatibilityTest: "report-compatibility",
};

interface UpsellPopupProps {
  isOpen: boolean;
  onClose: () => void;
  feature: keyof UnlockedFeatures;
  onPurchase?: () => void;
}

export function UpsellPopup({ isOpen, onClose, feature, onPurchase }: UpsellPopupProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const handlePageShow = () => setIsProcessing(false);
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  const handlePurchase = async () => {
    setIsProcessing(true);
    setError("");

    try {
      const reportId = featureToReportId[feature];
      
      const response = await fetch("/api/stripe/create-coin-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "report",
          packageId: reportId,
          userId: generateUserId(),
          email: localStorage.getItem("palmcosmic_email") || "",
          cancelPath: "/reports?cancelled=true",
        }),
      });

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else if (data.error) {
        setError(data.error);
        setIsProcessing(false);
      } else {
        setError("Unable to start checkout. Please try again.");
        setIsProcessing(false);
      }
    } catch (err) {
      console.error("Checkout error:", err);
      setError("Something went wrong. Please try again.");
      setIsProcessing(false);
    }
  };

  const featureName = featureNames[feature];
  const price = featurePrices[feature];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-gradient-to-b from-[#1A1F2E] to-[#0A0E1A] rounded-3xl w-full max-w-sm p-6 border border-white/10"
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
            >
              <X className="w-4 h-4 text-white" />
            </button>

            {/* Icon */}
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/30 to-purple-500/30 flex items-center justify-center">
                <Lock className="w-10 h-10 text-primary" />
              </div>
            </div>

            {/* Title */}
            <h2 className="text-white text-xl font-bold text-center mb-2">
              Unlock {featureName}
            </h2>

            {/* Description */}
            <p className="text-white/60 text-center text-sm mb-6">
              Get your personalized {featureName.toLowerCase()} and discover deeper insights about your cosmic journey.
            </p>

            {/* Price */}
            <div className="bg-white/5 rounded-2xl p-4 mb-6 border border-white/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  <span className="text-white font-medium">{featureName}</span>
                </div>
                <div className="text-right">
                  <span className="text-white text-xl font-bold">${price.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                <p className="text-red-400 text-sm text-center">{error}</p>
              </div>
            )}

            {/* Purchase Button */}
            <Button
              onClick={handlePurchase}
              disabled={isProcessing}
              className="w-full h-14 text-lg font-semibold bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
              size="lg"
            >
              {isProcessing ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                `Get ${featureName}`
              )}
            </Button>

            {/* Cancel Link */}
            <button
              onClick={onClose}
              className="w-full mt-3 text-white/50 text-sm hover:text-white/70 transition-colors"
            >
              Maybe later
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Pack of 3 Upsell Popup
interface AllUpsellsPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onPurchase?: () => void;
}

export function AllUpsellsPopup({ isOpen, onClose, onPurchase }: AllUpsellsPopupProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");

  const handlePurchase = async () => {
    setIsProcessing(true);
    setError("");

    try {
      // Use the upsell checkout API with ultra-pack
      const response = await fetch("/api/stripe/create-upsell-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedOffers: ["ultra-pack"],
          userId: generateUserId(),
          email: localStorage.getItem("palmcosmic_email") || "",
          successPath: "/dashboard?upsell_success=true&offers=ultra-pack",
          cancelPath: "/reports?cancelled=true",
        }),
      });

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else if (data.error) {
        setError(data.error);
        setIsProcessing(false);
      } else {
        setError("Unable to start checkout. Please try again.");
        setIsProcessing(false);
      }
    } catch (err) {
      console.error("Checkout error:", err);
      setError("Something went wrong. Please try again.");
      setIsProcessing(false);
    }
  };

  const totalPrice = 14.99; // Discounted bundle price
  const originalPrice = 6.99 * 3; // Individual prices

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-gradient-to-b from-[#1A1F2E] to-[#0A0E1A] rounded-3xl w-full max-w-sm p-6 border border-primary/30"
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
            >
              <X className="w-4 h-4 text-white" />
            </button>

            {/* Badge */}
            <div className="flex justify-center mb-4">
              <span className="px-3 py-1 bg-gradient-to-r from-primary to-purple-600 text-white text-xs font-bold rounded-full">
                BEST VALUE
              </span>
            </div>

            {/* Icon */}
            <div className="flex justify-center mb-4">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/30 to-purple-500/30 flex items-center justify-center">
                <Sparkles className="w-10 h-10 text-primary" />
              </div>
            </div>

            {/* Title */}
            <h2 className="text-white text-xl font-bold text-center mb-2">
              Unlock Everything
            </h2>

            {/* Description */}
            <p className="text-white/60 text-center text-sm mb-6">
              Get all premium reports and unlock your complete cosmic profile.
            </p>

            {/* Features List */}
            <div className="space-y-2 mb-6">
              {(["prediction2026", "birthChart", "compatibilityTest"] as const).map((feature) => (
                <div key={feature} className="flex items-center gap-2 text-white/80 text-sm">
                  <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                    <Sparkles className="w-3 h-3 text-primary" />
                  </div>
                  <span>{featureNames[feature]}</span>
                </div>
              ))}
            </div>

            {/* Price */}
            <div className="bg-white/5 rounded-2xl p-4 mb-6 border border-primary/20">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-white/50 text-sm line-through">${originalPrice.toFixed(2)}</span>
                  <span className="ml-2 text-green-400 text-xs font-semibold">Save 28%</span>
                </div>
                <span className="text-white text-2xl font-bold">${totalPrice.toFixed(2)}</span>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                <p className="text-red-400 text-sm text-center">{error}</p>
              </div>
            )}

            {/* Purchase Button */}
            <Button
              onClick={handlePurchase}
              disabled={isProcessing}
              className="w-full h-14 text-lg font-semibold bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
              size="lg"
            >
              {isProcessing ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                "Unlock All Reports"
              )}
            </Button>

            {/* Cancel Link */}
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="w-full mt-3 text-white/50 text-sm hover:text-white/70 transition-colors"
            >
              Maybe later
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
