"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Crown, Package } from "lucide-react";
import { useUserStore } from "@/lib/user-store";
import { supabase } from "@/lib/supabase";

const BUNDLE_NAMES: Record<string, string> = {
  "palm-reading": "Palm Reading Report",
  "palm-birth": "Palm + Birth Chart Report",
  "palm-birth-compat": "Palm + Birth Chart + Compatibility Report",
};

const FEATURE_LABELS: Record<string, string> = {
  palmReading: "Palm Reading",
  birthChart: "Birth Chart",
  compatibilityTest: "Compatibility Report",
  prediction2026: "2026 Predictions",
};

export default function ManageSubscriptionPage() {
  const router = useRouter();
  const { purchasedBundle, unlockedFeatures } = useUserStore();
  const [purchaseDate, setPurchaseDate] = useState<string | null>(null);

  useEffect(() => {
    const fetchPurchaseInfo = async () => {
      const userId = localStorage.getItem("astrorekha_user_id");
      if (!userId) return;

      const { data } = await supabase
        .from("payments")
        .select("created_at")
        .eq("user_id", userId)
        .eq("payment_status", "paid")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (data?.created_at) {
        setPurchaseDate(
          new Date(data.created_at).toLocaleDateString("en-IN", {
            month: "long",
            day: "numeric",
            year: "numeric",
          })
        );
      }
    };
    fetchPurchaseInfo();
  }, []);

  const unlockedList = Object.entries(unlockedFeatures)
    .filter(([, v]) => v)
    .map(([k]) => k);

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <div className="w-full max-w-md h-screen bg-[#0A0E1A] overflow-hidden shadow-2xl shadow-black/50 flex flex-col relative">
        {/* Starry background */}
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
          <div className="flex items-center justify-center px-4 py-3">
            <button
              onClick={() => router.push("/settings")}
              className="absolute left-4 w-10 h-10 flex items-center justify-center"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <h1 className="text-white text-xl font-semibold">My Purchases</h1>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto relative z-10">
          <div className="px-4 py-6 space-y-4">
            {/* Current Bundle */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gradient-to-r from-primary/20 to-purple-500/20 rounded-2xl p-5 border border-primary/30"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                  <Crown className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-white/60 text-sm">Your Package</p>
                  <p className="text-primary text-lg font-bold">
                    {purchasedBundle ? BUNDLE_NAMES[purchasedBundle] || purchasedBundle : "No package purchased"}
                  </p>
                </div>
              </div>
              {purchaseDate && (
                <p className="text-white/40 text-xs">Purchased on {purchaseDate}</p>
              )}
            </motion.div>

            {/* Unlocked Features */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-[#1A1F2E] rounded-2xl p-5 border border-white/10"
            >
              <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
                <Package className="w-5 h-5 text-primary" /> Unlocked Features
              </h2>
              {unlockedList.length > 0 ? (
                <div className="space-y-3">
                  {unlockedList.map((feature) => (
                    <div key={feature} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                        <Check className="w-4 h-4 text-green-400" />
                      </div>
                      <span className="text-white text-sm">
                        {FEATURE_LABELS[feature] || feature}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-white/40 text-sm">No features unlocked yet.</p>
              )}
            </motion.div>

            {/* Info */}
            <p className="text-white/30 text-xs text-center px-4">
              All purchases are one-time and permanent. Your unlocked features never expire.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
