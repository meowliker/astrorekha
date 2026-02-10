"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Check, Crown, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { generateUserId } from "@/lib/user-profile";

export default function PaywallPage() {
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState<string | null>(null);

  useEffect(() => {
    const handlePageShow = () => setIsProcessing(null);
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  const startCheckout = async (plan: "weekly" | "monthly" | "yearly") => {
    setIsProcessing(plan);
    try {
      const response = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          userId: generateUserId(),
          email: localStorage.getItem("palmcosmic_email") || "",
        }),
      });
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
    } catch (err) {
      console.error("Paywall checkout error:", err);
    } finally {
      setIsProcessing(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <div className="w-full max-w-md h-screen bg-[#0A0E1A] overflow-hidden shadow-2xl shadow-black/50 flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-40 bg-[#0A0E1A]/95 backdrop-blur-sm">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={() => router.push("/reports")}
              className="w-10 h-10 flex items-center justify-center"
            >
              <X className="w-5 h-5 text-white" />
            </button>
            <h1 className="text-white text-xl font-semibold">Premium</h1>
            <div className="w-10" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-6 space-y-6">
            {/* Header */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center"
            >
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center mx-auto mb-4">
                <Crown className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-white text-2xl font-bold mb-2">
                Unlock Premium
              </h1>
              <p className="text-white/60">
                Get unlimited access to all cosmic features
              </p>
            </motion.div>

            {/* Plans */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="space-y-4"
            >
              {/* Yearly Plan */}
              <div className="bg-gradient-to-r from-[#2A2515] to-[#1A1F2E] rounded-2xl p-5 border-2 border-yellow-500/50 relative">
                <div className="absolute -top-3 left-4 bg-gradient-to-r from-yellow-400 to-orange-500 text-black text-xs font-bold px-3 py-1 rounded-full">
                  BEST VALUE
                </div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-white font-semibold text-lg">Yearly</p>
                    <p className="text-primary text-sm">2-week free trial</p>
                    <p className="text-white/50 text-sm">Save 67%</p>
                  </div>
                  <div className="text-right">
                    <p className="text-white text-2xl font-bold">$39.99</p>
                    <p className="text-white/50 text-sm">/year</p>
                  </div>
                </div>
                <Button
                  onClick={() => startCheckout("yearly")}
                  disabled={isProcessing !== null}
                  className="w-full bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 text-black font-semibold rounded-full"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  {isProcessing === "yearly" ? "Processing..." : "Start 2-Week Free Trial"}
                </Button>
              </div>

              {/* Monthly Plan */}
              <div className="bg-[#1A1F2E] rounded-2xl p-5 border-2 border-primary/50 relative">
                <div className="absolute -top-3 left-4 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full">
                  MOST POPULAR
                </div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-white font-semibold text-lg">Monthly</p>
                    <p className="text-primary text-sm">1-week free trial</p>
                  </div>
                  <div className="text-right">
                    <p className="text-white text-2xl font-bold">$9.99</p>
                    <p className="text-white/50 text-sm">/month</p>
                  </div>
                </div>
                <Button
                  onClick={() => startCheckout("monthly")}
                  disabled={isProcessing !== null}
                  className="w-full bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-700 text-white font-semibold rounded-full"
                >
                  {isProcessing === "monthly" ? "Processing..." : "Start 1-Week Free Trial"}
                </Button>
              </div>

              {/* Weekly Plan */}
              <div className="bg-[#1A1F2E] rounded-2xl p-5 border border-white/10">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-white font-semibold text-lg">Weekly</p>
                    <p className="text-primary text-sm">3-day free trial</p>
                  </div>
                  <div className="text-right">
                    <p className="text-white text-2xl font-bold">$4.99</p>
                    <p className="text-white/50 text-sm">/week</p>
                  </div>
                </div>
                <Button
                  onClick={() => startCheckout("weekly")}
                  disabled={isProcessing !== null}
                  variant="outline"
                  className="w-full border-white/20 text-white hover:bg-white/10 rounded-full"
                >
                  {isProcessing === "weekly" ? "Processing..." : "Start 3-Day Free Trial"}
                </Button>
              </div>
            </motion.div>

            {/* Features */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="space-y-3"
            >
              {[
                "Unlimited palm readings",
                "AI-powered insights",
                "Daily horoscope",
                "Compatibility reports",
                "Birth chart analysis",
                "Priority support",
              ].map((feature) => (
                <div key={feature} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-rose-500/20 flex items-center justify-center">
                    <Check className="w-4 h-4 text-rose-400" />
                  </div>
                  <span className="text-white">{feature}</span>
                </div>
              ))}
            </motion.div>

            {/* Footer */}
            <p className="text-white/40 text-xs text-center">
              Cancel anytime • Secure payment powered by Stripe
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
