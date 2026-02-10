"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, FileText, Mail, LogOut, CreditCard, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUserStore } from "@/lib/user-store";

const subscriptionBenefits = [
  { icon: "🔮", text: "Personal Horoscopes" },
  { icon: "💕", text: "Compatibility Report" },
  { icon: "🚀", text: "Discounted Coin Prices" },
  { icon: "🌙", text: "Your Birth Chart" },
  { icon: "🖐️", text: "Palm Readings" },
];

// Bundle benefits based on what was purchased
const getBundleBenefits = (bundleId: string | null, unlockedFeatures?: { birthChart?: boolean; compatibilityTest?: boolean; prediction2026?: boolean }) => {
  const benefits = [];
  
  // Always included for all users
  benefits.push({ icon: "🔮", text: "Daily Horoscope" });
  benefits.push({ icon: "🖐️", text: "Palm Reading Report" });
  
  // Show based on what was purchased (check both bundleId and unlockedFeatures)
  if (bundleId === "bundle-palm-birth" || bundleId === "bundle-full" || unlockedFeatures?.birthChart) {
    benefits.push({ icon: "🌙", text: "Birth Chart Analysis" });
  }
  if (bundleId === "bundle-full" || unlockedFeatures?.compatibilityTest) {
    benefits.push({ icon: "💕", text: "Compatibility Report" });
  }
  if (unlockedFeatures?.prediction2026) {
    benefits.push({ icon: "💫", text: "2026 Predictions" });
  }
  
  // All bundles include coins
  benefits.push({ icon: "💬", text: "15 AI Chat Coins" });
  
  return benefits;
};

export default function SettingsPage() {
  const router = useRouter();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isFlowB, setIsFlowB] = useState(false);
  const [bundleId, setBundleId] = useState<string | null>(null);
  const { subscriptionPlan, resetUserState, unlockedFeatures } = useUserStore();

  const userEmail = typeof window !== "undefined" 
    ? localStorage.getItem("palmcosmic_email") || "user@example.com"
    : "user@example.com";

  useEffect(() => {
    if (typeof window !== "undefined") {
      const flow = localStorage.getItem("palmcosmic_onboarding_flow");
      const purchaseType = localStorage.getItem("palmcosmic_purchase_type");
      const bundle = localStorage.getItem("palmcosmic_bundle_id");
      setIsFlowB(flow === "flow-b" || purchaseType === "one-time");
      setBundleId(bundle);
    }
  }, []);

  const displayBenefits = isFlowB ? getBundleBenefits(bundleId, unlockedFeatures) : subscriptionBenefits;

  const handleLogout = () => {
    // Clear local storage
    if (typeof window !== "undefined") {
      localStorage.clear();
    }
    // Reset stores
    resetUserState();
    // Redirect to welcome screen
    router.push("/welcome");
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <div className="w-full max-w-md h-screen bg-[#0A0E1A] overflow-hidden shadow-2xl shadow-black/50 flex flex-col relative">
        {/* Starry background effect */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(30)].map((_, i) => (
            <div
              key={i}
              className="absolute w-0.5 h-0.5 bg-white/20 rounded-full"
              style={{
                top: `${Math.random() * 100}%`,
                left: `${Math.random() * 100}%`,
              }}
            />
          ))}
        </div>

        {/* Header */}
        <div className="sticky top-0 z-40 bg-[#0A0E1A]/95 backdrop-blur-sm">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={() => router.push("/profile")}
              className="w-10 h-10 flex items-center justify-center"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <h1 className="text-white text-xl font-semibold">Settings</h1>
            <div className="w-10" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto relative z-10">
          <div className="px-4 py-4 space-y-4">
            {/* Benefits Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#1A1F2E] rounded-2xl p-5 border border-white/10"
            >
              <h2 className="text-primary text-xl font-bold mb-4">
                {isFlowB ? "Your Purchase Benefits" : "Your Subscription Benefits"}
              </h2>
              <div className="space-y-3">
                {displayBenefits.map((benefit, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{benefit.icon}</span>
                      <span className="text-white">{benefit.text}</span>
                    </div>
                    <Check className="w-5 h-5 text-primary" />
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Links Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-[#1A1F2E] rounded-2xl border border-white/10 overflow-hidden"
            >
              <button
                onClick={() => window.open("/Terms/privacy-policy.html", "_blank")}
                className="w-full p-4 flex items-center gap-3 hover:bg-white/5 transition-colors border-b border-white/10"
              >
                <FileText className="w-5 h-5 text-white/50" />
                <span className="text-white flex-1 text-left">Privacy Policy</span>
                <ChevronRight className="w-5 h-5 text-white/30" />
              </button>
              <button
                onClick={() => window.open("/Terms/terms-of-service.html", "_blank")}
                className="w-full p-4 flex items-center gap-3 hover:bg-white/5 transition-colors border-b border-white/10"
              >
                <FileText className="w-5 h-5 text-white/50" />
                <span className="text-white flex-1 text-left">Terms of Service</span>
                <ChevronRight className="w-5 h-5 text-white/30" />
              </button>
              <button
                onClick={() => window.open("/Terms/contact-us.html", "_blank")}
                className="w-full p-4 flex items-center gap-3 hover:bg-white/5 transition-colors"
              >
                <Mail className="w-5 h-5 text-white/50" />
                <span className="text-white flex-1 text-left">Contact Us</span>
                <ChevronRight className="w-5 h-5 text-white/30" />
              </button>
            </motion.div>

            {/* Logout Button */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <button
                onClick={() => setShowLogoutConfirm(true)}
                className="w-full bg-[#1A2235] rounded-2xl p-4 border border-red-500/20 hover:bg-red-500/10 transition-colors"
              >
                <div className="flex flex-col items-center">
                  <span className="text-red-400 font-medium">Log out</span>
                  <span className="text-white/40 text-sm">{userEmail}</span>
                </div>
              </button>
            </motion.div>

            {/* Manage Subscription Button - Only show for subscription users (Flow A) */}
            {!isFlowB && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <button
                  onClick={() => router.push("/manage-subscription")}
                  className="w-full bg-[#1A1F2E] rounded-2xl p-4 border border-primary/30 hover:bg-[#252A3A] transition-colors"
                >
                  <div className="flex items-center justify-center gap-2">
                    <CreditCard className="w-5 h-5 text-primary" />
                    <span className="text-white font-medium">Manage Subscription</span>
                  </div>
                </button>
              </motion.div>
            )}
          </div>
        </div>

        {/* Logout Confirmation Modal */}
        <AnimatePresence>
          {showLogoutConfirm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
              onClick={() => setShowLogoutConfirm(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-[#1A1F2E] rounded-2xl w-full max-w-sm p-6 border border-white/10"
              >
                <div className="flex justify-center mb-4">
                  <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
                    <LogOut className="w-8 h-8 text-red-400" />
                  </div>
                </div>
                <h2 className="text-white text-xl font-bold text-center mb-2">
                  Log Out?
                </h2>
                <p className="text-white/60 text-center text-sm mb-6">
                  Are you sure you want to log out of your account?
                </p>
                <div className="space-y-3">
                  <Button
                    onClick={handleLogout}
                    className="w-full h-12 bg-red-500 hover:bg-red-600 text-white font-semibold"
                  >
                    Yes, Log Out
                  </Button>
                  <Button
                    onClick={() => setShowLogoutConfirm(false)}
                    variant="outline"
                    className="w-full h-12 border-white/20 text-white hover:bg-white/10"
                  >
                    Cancel
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
