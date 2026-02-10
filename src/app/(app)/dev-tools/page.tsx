"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw, Unlock, Lock, Coins, Trash2, Database, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUserStore } from "@/lib/user-store";
import { useOnboardingStore } from "@/lib/onboarding-store";

export default function DevToolsPage() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [devPassword, setDevPassword] = useState("");
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState("");

  const {
    subscriptionPlan,
    unlockedFeatures,
    coins,
    birthChartGenerating,
    birthChartReady,
    purchaseSubscription,
    unlockFeature,
    unlockAllFeatures,
    setCoins,
    addCoins,
    setBirthChartGenerating,
    setBirthChartReady,
    resetUserState,
  } = useUserStore();

  const {
    gender,
    birthMonth,
    birthDay,
    birthYear,
    birthPlace,
    sunSign,
    moonSign,
    ascendantSign,
    reset: resetOnboarding,
  } = useOnboardingStore();

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 2000);
  };

  const handleActivateTester = async () => {
    setActivateError("");

    const userId = localStorage.getItem("palmcosmic_user_id");
    if (!userId) {
      setActivateError("No userId found. Please log in first.");
      return;
    }
    if (!devPassword) {
      setActivateError("Enter the dev password.");
      return;
    }

    setActivating(true);
    try {
      const res = await fetch("/api/dev/activate-tester", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: devPassword, userId }),
      });

      const data = await res.json();
      if (!res.ok) {
        setActivateError(data.error || "Failed to activate");
        return;
      }

      unlockAllFeatures();
      setCoins(999999);
      showMessage("Dev tester enabled");
      setDevPassword("");
    } catch (err) {
      console.error("Activate tester failed:", err);
      setActivateError("Something went wrong.");
    } finally {
      setActivating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <div className="w-full max-w-md min-h-screen bg-[#0A0E1A] overflow-hidden shadow-2xl shadow-black/50 flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-40 bg-[#0A0E1A]/95 backdrop-blur-sm border-b border-white/10">
          <div className="flex items-center gap-4 px-4 py-3">
            <button
              onClick={() => router.back()}
              className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <h1 className="text-white text-xl font-semibold">🛠️ Dev Tools</h1>
          </div>
        </div>

        {/* Message Toast */}
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mx-4 mt-4 p-3 bg-green-500/20 border border-green-500/30 rounded-xl text-green-400 text-sm text-center"
          >
            {message}
          </motion.div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
          {/* Dev Tester */}
          <div className="bg-[#1A1F2E] rounded-2xl p-4 border border-white/10">
            <h2 className="text-white font-semibold mb-3 flex items-center gap-2">
              <Lock className="w-4 h-4" /> Dev Tester Access
            </h2>

            <div className="space-y-3">
              <input
                type="password"
                value={devPassword}
                onChange={(e) => setDevPassword(e.target.value)}
                placeholder="Enter global dev password"
                className="w-full h-11 px-4 bg-[#0A0E1A] border border-white/10 rounded-xl text-white placeholder:text-white/40 focus:outline-none focus:border-primary"
              />

              {activateError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                  <p className="text-red-400 text-sm text-center">{activateError}</p>
                </div>
              )}

              <Button
                onClick={handleActivateTester}
                disabled={activating}
                className="w-full"
              >
                {activating ? "Activating..." : "Activate Dev Tester"}
              </Button>
            </div>
          </div>

          {/* Current State */}
          <div className="bg-[#1A1F2E] rounded-2xl p-4 border border-white/10">
            <h2 className="text-white font-semibold mb-3 flex items-center gap-2">
              <Database className="w-4 h-4" /> Current State
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-white/60">Subscription</span>
                <span className="text-white">{subscriptionPlan || "None"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">Coins</span>
                <span className="text-yellow-400">{coins}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">Birth Chart</span>
                <span className="text-white">
                  {birthChartGenerating ? "Generating..." : birthChartReady ? "Ready" : "Not generated"}
                </span>
              </div>
            </div>
            
            <div className="mt-3 pt-3 border-t border-white/10">
              <p className="text-white/60 text-xs mb-2">Unlocked Features:</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(unlockedFeatures).map(([key, value]) => (
                  <span
                    key={key}
                    className={`px-2 py-1 rounded-full text-xs ${
                      value ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                    }`}
                  >
                    {key}: {value ? "✓" : "✗"}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* User Profile */}
          <div className="bg-[#1A1F2E] rounded-2xl p-4 border border-white/10">
            <h2 className="text-white font-semibold mb-3 flex items-center gap-2">
              <User className="w-4 h-4" /> User Profile (Onboarding)
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-white/60">Gender</span>
                <span className="text-white">{gender || "Not set"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">Birth Date</span>
                <span className="text-white">{birthMonth} {birthDay}, {birthYear}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">Birth Place</span>
                <span className="text-white truncate max-w-[150px]">{birthPlace || "Not set"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">Sun Sign</span>
                <span className="text-white">{sunSign?.name || "Not calculated"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">Moon Sign</span>
                <span className="text-white">{moonSign?.name || "Not calculated"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">Ascendant</span>
                <span className="text-white">{ascendantSign?.name || "Not calculated"}</span>
              </div>
            </div>
          </div>

          {/* Subscription Controls */}
          <div className="bg-[#1A1F2E] rounded-2xl p-4 border border-white/10">
            <h2 className="text-white font-semibold mb-3">Simulate Subscription</h2>
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  purchaseSubscription("weekly");
                  showMessage("Weekly plan activated (15 coins)");
                }}
                className="text-xs"
              >
                1-Week
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  purchaseSubscription("monthly");
                  showMessage("Monthly plan activated (15 coins)");
                }}
                className="text-xs"
              >
                2-Week
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  purchaseSubscription("yearly");
                  showMessage("Yearly plan activated (30 coins)");
                }}
                className="text-xs"
              >
                4-Week
              </Button>
            </div>
          </div>

          {/* Feature Unlock Controls */}
          <div className="bg-[#1A1F2E] rounded-2xl p-4 border border-white/10">
            <h2 className="text-white font-semibold mb-3 flex items-center gap-2">
              <Unlock className="w-4 h-4" /> Unlock Features
            </h2>
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    unlockFeature("prediction2026");
                    showMessage("2026 Predictions unlocked");
                  }}
                  className="text-xs"
                >
                  2026 Predictions
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    unlockFeature("birthChart");
                    showMessage("Birth Chart unlocked");
                  }}
                  className="text-xs"
                >
                  Birth Chart
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    unlockFeature("compatibilityTest");
                    showMessage("Compatibility Test unlocked");
                  }}
                  className="text-xs"
                >
                  Compatibility
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    unlockAllFeatures();
                    showMessage("All features unlocked!");
                  }}
                  className="text-xs bg-primary/20"
                >
                  Unlock All
                </Button>
              </div>
            </div>
          </div>

          {/* Coin Controls */}
          <div className="bg-[#1A1F2E] rounded-2xl p-4 border border-white/10">
            <h2 className="text-white font-semibold mb-3 flex items-center gap-2">
              <Coins className="w-4 h-4" /> Coin Controls
            </h2>
            <div className="grid grid-cols-4 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCoins(0);
                  showMessage("Coins set to 0");
                }}
                className="text-xs"
              >
                0
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCoins(15);
                  showMessage("Coins set to 15");
                }}
                className="text-xs"
              >
                15
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCoins(30);
                  showMessage("Coins set to 30");
                }}
                className="text-xs"
              >
                30
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  addCoins(50);
                  showMessage("Added 50 coins");
                }}
                className="text-xs"
              >
                +50
              </Button>
            </div>
          </div>

          {/* Birth Chart Controls */}
          <div className="bg-[#1A1F2E] rounded-2xl p-4 border border-white/10">
            <h2 className="text-white font-semibold mb-3">Birth Chart State</h2>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setBirthChartGenerating(true);
                  setBirthChartReady(false);
                  showMessage("Birth chart generating...");
                }}
                className="text-xs"
              >
                Set Generating
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setBirthChartGenerating(false);
                  setBirthChartReady(true);
                  showMessage("Birth chart ready");
                }}
                className="text-xs"
              >
                Set Ready
              </Button>
            </div>
          </div>

          {/* Reset Controls */}
          <div className="bg-red-500/10 rounded-2xl p-4 border border-red-500/20">
            <h2 className="text-red-400 font-semibold mb-3 flex items-center gap-2">
              <Trash2 className="w-4 h-4" /> Reset Data
            </h2>
            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  resetUserState();
                  showMessage("User state reset");
                }}
                className="w-full text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
              >
                Reset User State (Purchases, Coins)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  resetOnboarding();
                  showMessage("Onboarding data reset");
                }}
                className="w-full text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
              >
                Reset Onboarding Data
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  localStorage.removeItem("palmcosmic_palm_image");
                  showMessage("Palm image cleared");
                }}
                className="w-full text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
              >
                Clear Palm Image
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  resetUserState();
                  resetOnboarding();
                  localStorage.clear();
                  showMessage("All data cleared! Redirecting...");
                  setTimeout(() => router.push("/onboarding/step-5"), 1500);
                }}
                className="w-full text-xs border-red-500/50 text-red-400 hover:bg-red-500/20 font-semibold"
              >
                Full Reset & Start Onboarding
              </Button>
            </div>
          </div>

          {/* Quick Navigation */}
          <div className="bg-[#1A1F2E] rounded-2xl p-4 border border-white/10">
            <h2 className="text-white font-semibold mb-3">Quick Navigation</h2>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/onboarding/step-5")}
                className="text-xs"
              >
                Onboarding Step 5
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/onboarding/step-17")}
                className="text-xs"
              >
                Paywall (Step 17)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/onboarding/step-18")}
                className="text-xs"
              >
                Upsells (Step 18)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/dashboard")}
                className="text-xs"
              >
                Dashboard
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/chat")}
                className="text-xs"
              >
                Elysia Chat
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/palm-reading")}
                className="text-xs"
              >
                Palm Reading
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
