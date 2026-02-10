"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { ChevronRight, Star, Sun, Moon, Sparkles, Loader2, Lock, MessageCircle, Lightbulb, CheckCircle, XCircle, Clock } from "lucide-react";
import Image from "next/image";
import { getZodiacSign, getZodiacSymbol, getZodiacColor } from "@/lib/astrology-api";
import { useOnboardingStore } from "@/lib/onboarding-store";
import { useUserStore, UnlockedFeatures } from "@/lib/user-store";
import { UpsellPopup } from "@/components/UpsellPopup";
import { TrialStatusBanner } from "@/components/TrialStatusBanner";
import { doc, getDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { UserAvatar, cacheUserInfo } from "@/components/UserAvatar";
import { BirthChartTimer } from "@/components/BirthChartTimer";

interface DailyData {
  sunRiseSet?: { sunrise: string; sunset: string };
  rahuKalam?: { start: string; end: string };
  abhijitMuhurat?: { start: string; end: string };
  nakshatra?: any;
}

interface DailyInsights {
  daily_tip: string;
  dos: string[];
  donts: string[];
  lucky_time: string;
  lucky_number: number;
  lucky_color: string;
  mood: string;
  sun_sign?: string;
  moon_sign?: string;
  rising_sign?: string;
  current_dasha?: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [dailyData, setDailyData] = useState<DailyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [userZodiac, setUserZodiac] = useState({ sign: "Aries", symbol: "♈", color: "from-red-500 to-orange-500" });
  const [upsellPopup, setUpsellPopup] = useState<{ isOpen: boolean; feature: keyof UnlockedFeatures | null }>({
    isOpen: false,
    feature: null,
  });
  const [userName, setUserName] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [birthChartTimerActive, setBirthChartTimerActive] = useState(false);
  const [birthChartTimerStartedAt, setBirthChartTimerStartedAt] = useState<string | null>(null);
  const [birthChartTimerExpired, setBirthChartTimerExpired] = useState(false);
  const [dailyInsights, setDailyInsights] = useState<DailyInsights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  // Get sun sign from onboarding store as fallback
  const { birthMonth: storeBirthMonth, birthDay: storeBirthDay, sunSign: storeSunSign } = useOnboardingStore();
  
  // Get unlocked features from user store
  const { unlockedFeatures, birthChartGenerating, birthChartReady, syncFromFirebase } = useUserStore();

  useEffect(() => {
    loadUserZodiac();
    fetchDailyData();
  }, []);

  useEffect(() => {
    fetchDailyInsightsV2();
  }, []);

  const loadUserZodiac = async () => {
    try {
      // Get userId - prefer Firebase Auth uid
      const authUid = auth.currentUser?.uid;
      const storedId = localStorage.getItem("palmcosmic_user_id");
      const userId = authUid || storedId;

      if (userId) {
        // Load ascendant sign from Firebase
        const userRef = doc(db, "users", userId);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          const data = userSnap.data();
          
          // Load user name and email for avatar and cache them
          if (data.name) setUserName(data.name);
          if (data.email) setUserEmail(data.email);
          cacheUserInfo(data.name, data.email);
          
          // Sync unlocked features from Firebase to user store
          syncFromFirebase({
            unlockedFeatures: data.unlockedFeatures,
            palmReading: data.palmReading,
            birthChart: data.birthChart,
            compatibilityTest: data.compatibilityTest,
            prediction2026: data.prediction2026,
            coins: data.coins,
            subscriptionPlan: data.subscriptionPlan,
          });
          
          // Load birth chart timer data
          if (data.birthChartTimerActive !== undefined) {
            setBirthChartTimerActive(data.birthChartTimerActive);
          }
          if (data.birthChartTimerStartedAt) {
            setBirthChartTimerStartedAt(data.birthChartTimerStartedAt);
          }
          
          // Helper to extract sign name from string or object
          const extractSignName = (sign: any): string | null => {
            if (!sign) return null;
            if (typeof sign === "string") return sign;
            if (sign.name) return sign.name;
            return null;
          };

          // Use astro-engine sun sign from Firestore as source of truth
          let sunSignName = extractSignName(data.sunSign);

          // Fallback: check user_profiles/{userId} for astro-engine signs
          if (!sunSignName && userId) {
            try {
              const profileSnap = await getDoc(doc(db, "user_profiles", userId));
              if (profileSnap.exists()) {
                sunSignName = extractSignName(profileSnap.data().sunSign);
              }
            } catch (profileErr) {
              console.error("Error reading user_profiles:", profileErr);
            }
          }

          // Last resort: calculate from birth date (Western tropical)
          if (!sunSignName && data.birthMonth && data.birthDay) {
            sunSignName = getZodiacSign(Number(data.birthMonth), Number(data.birthDay));
          }

          if (sunSignName) {
            setUserZodiac({
              sign: sunSignName,
              symbol: getZodiacSymbol(sunSignName),
              color: getZodiacColor(sunSignName),
            });
            
            // Also try to get email from localStorage as fallback
            const storedEmail = localStorage.getItem("palmcosmic_email");
            if (storedEmail && !userEmail) {
              setUserEmail(storedEmail);
            }
            
            // We got the sun sign, exit early
            return;
          }
        }
      }
      
      // Also try to get email from localStorage as fallback
      const storedEmail = localStorage.getItem("palmcosmic_email");
      if (storedEmail && !userEmail) {
        setUserEmail(storedEmail);
      }
    } catch (error) {
      console.error("Error loading user zodiac:", error);
    }
    
    // Fallback to onboarding store sun sign or calculate from birth date
    // This only runs if Firebase fetch failed or user not found
    if (storeSunSign?.name) {
      setUserZodiac({
        sign: storeSunSign.name,
        symbol: getZodiacSymbol(storeSunSign.name),
        color: getZodiacColor(storeSunSign.name),
      });
    } else if (storeBirthMonth && storeBirthDay) {
      // Calculate sun sign from birth date
      const month = Number(storeBirthMonth);
      const day = Number(storeBirthDay);
      const sign = getZodiacSign(month, day);
      setUserZodiac({
        sign,
        symbol: getZodiacSymbol(sign),
        color: getZodiacColor(sign),
      });
    }
  };

  const fetchDailyData = async () => {
    try {
      const response = await fetch("/api/astrology/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: 28.6139,
          longitude: 77.209,
          timezone: 5.5,
        }),
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setDailyData(result.data);
        }
      }
    } catch (error) {
      console.error("Failed to fetch daily data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDailyInsightsV2 = async () => {
    try {
      setInsightsLoading(true);
      const authUid = auth.currentUser?.uid;
      const storedId = localStorage.getItem("palmcosmic_user_id");
      const userId = authUid || storedId;
      if (!userId) return;

      const response = await fetch(`/api/horoscope/daily-insights-v2?userId=${userId}`);
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          setDailyInsights(result.data);
        }
      }
    } catch (error) {
      console.error("Failed to fetch daily insights:", error);
    } finally {
      setInsightsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      {/* Trial/Payment Status Banner */}
      <TrialStatusBanner />
      
      <div className="w-full max-w-md h-screen bg-[#0A0E1A] overflow-hidden shadow-2xl shadow-black/50 flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-40 bg-[#0A0E1A]/95 backdrop-blur-sm border-b border-white/10">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={() => router.push("/profile")}
              className="hover:opacity-80 transition-opacity"
            >
              <UserAvatar name={userName} email={userEmail} size="md" />
            </button>
            <h1 className="text-white text-xl font-semibold">Dashboard</h1>
            <div className="w-10" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-4 space-y-6 pb-24">
            {/* Chat with Elysia */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative bg-gradient-to-br from-purple-600/20 via-pink-500/20 to-purple-600/20 rounded-2xl p-5 border-2 border-purple-500/30 cursor-pointer hover:border-purple-500/50 transition-all overflow-hidden group"
              onClick={() => router.push("/chat")}
            >
              {/* Animated background effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 via-pink-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              
              {/* Sparkle decorations */}
              <div className="absolute top-3 right-3 text-yellow-400 animate-pulse">
                <Sparkles className="w-4 h-4" />
              </div>
              
              <div className="relative flex items-center gap-4">
                <div className="relative flex-shrink-0">
                  {/* Pulsing ring */}
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 animate-ping opacity-20" />
                  <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/50 overflow-hidden">
                    <Image
                      src="/elysia.png"
                      alt="Elysia"
                      width={64}
                      height={64}
                      className="w-full h-full object-cover"
                      priority
                    />
                  </div>
                  {/* Online indicator */}
                  <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-400 rounded-full border-2 border-[#0A0E1A]" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-bold text-xl mb-1">
                    Chat with Elysia
                  </h3>
                  <p className="text-purple-200/80 text-sm">
                    Your personal cosmic guide & advisor
                  </p>
                </div>
                <ChevronRight className="w-6 h-6 text-purple-300 group-hover:translate-x-1 transition-transform" />
              </div>
            </motion.div>
            
            {/* Today's Cosmic Insights - 3 Cards */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <h2 className="text-white font-semibold text-lg mb-3">Today&apos;s Cosmic Insights</h2>
              
              {insightsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-white/30 animate-spin" />
                </div>
              ) : dailyInsights ? (
                <div className="grid grid-cols-3 gap-3">
                  {/* Today's Luck Card */}
                  <div
                    onClick={() => setExpandedCard("luck")}
                    className="bg-gradient-to-br from-yellow-500/20 to-amber-600/20 rounded-2xl p-4 border border-yellow-500/20 cursor-pointer hover:border-yellow-500/40 transition-all aspect-square flex flex-col items-center justify-center text-center relative overflow-hidden group"
                  >
                    <div className="absolute top-2 right-2 opacity-20 group-hover:opacity-40 transition-opacity">
                      <Star className="w-8 h-8 text-yellow-400" />
                    </div>
                    <span className="text-3xl mb-2">🍀</span>
                    <p className="text-yellow-400 font-bold text-xs">Today&apos;s Luck</p>
                    <p className="text-yellow-300 text-2xl font-bold mt-1">{dailyInsights.lucky_number}</p>
                  </div>

                  {/* Do's & Don'ts Card */}
                  <div
                    onClick={() => setExpandedCard("dosdonts")}
                    className="bg-gradient-to-br from-emerald-500/20 to-teal-600/20 rounded-2xl p-4 border border-emerald-500/20 cursor-pointer hover:border-emerald-500/40 transition-all aspect-square flex flex-col items-center justify-center text-center relative overflow-hidden group"
                  >
                    <div className="absolute top-2 right-2 opacity-20 group-hover:opacity-40 transition-opacity">
                      <CheckCircle className="w-8 h-8 text-emerald-400" />
                    </div>
                    <span className="text-3xl mb-2">✅</span>
                    <p className="text-emerald-400 font-bold text-xs">Do&apos;s &amp;</p>
                    <p className="text-emerald-400 font-bold text-xs">Don&apos;ts</p>
                  </div>

                  {/* Daily Tip Card */}
                  <div
                    onClick={() => setExpandedCard("tip")}
                    className="bg-gradient-to-br from-purple-500/20 to-violet-600/20 rounded-2xl p-4 border border-purple-500/20 cursor-pointer hover:border-purple-500/40 transition-all aspect-square flex flex-col items-center justify-center text-center relative overflow-hidden group"
                  >
                    <div className="absolute top-2 right-2 opacity-20 group-hover:opacity-40 transition-opacity">
                      <Lightbulb className="w-8 h-8 text-purple-400" />
                    </div>
                    <span className="text-3xl mb-2">💡</span>
                    <p className="text-purple-400 font-bold text-xs">Daily</p>
                    <p className="text-purple-400 font-bold text-xs">Tip</p>
                  </div>
                </div>
              ) : (
                <p className="text-white/30 text-sm text-center py-4">Insights loading...</p>
              )}
            </motion.div>

            {/* Expanded Card Modal */}
            {expandedCard && dailyInsights && (
              <div
                className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6"
                onClick={() => setExpandedCard(null)}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="w-full max-w-sm rounded-3xl overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  {expandedCard === "luck" && (
                    <div className="bg-gradient-to-br from-[#1A1F2E] to-[#252D3F] p-6 border border-yellow-500/20">
                      <div className="flex items-center gap-3 mb-5">
                        <span className="text-4xl">🍀</span>
                        <h3 className="text-white text-xl font-bold">Today&apos;s Luck</h3>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-yellow-500/10 rounded-xl p-4 text-center border border-yellow-500/20">
                          <p className="text-white/40 text-xs mb-1">Lucky Number</p>
                          <p className="text-yellow-400 text-3xl font-bold">{dailyInsights.lucky_number}</p>
                        </div>
                        <div className="bg-emerald-500/10 rounded-xl p-4 text-center border border-emerald-500/20">
                          <p className="text-white/40 text-xs mb-1">Lucky Color</p>
                          <p className="text-emerald-400 text-lg font-bold">{dailyInsights.lucky_color}</p>
                        </div>
                        <div className="bg-blue-500/10 rounded-xl p-4 text-center border border-blue-500/20">
                          <p className="text-white/40 text-xs mb-1">Lucky Time</p>
                          <p className="text-blue-400 text-sm font-bold">{dailyInsights.lucky_time}</p>
                        </div>
                        <div className="bg-purple-500/10 rounded-xl p-4 text-center border border-purple-500/20">
                          <p className="text-white/40 text-xs mb-1">Mood</p>
                          <p className="text-purple-400 text-lg font-bold">{dailyInsights.mood}</p>
                        </div>
                      </div>
                      <button onClick={() => setExpandedCard(null)} className="w-full mt-5 py-3 bg-white/10 rounded-xl text-white/60 text-sm hover:bg-white/20 transition-colors">Close</button>
                    </div>
                  )}

                  {expandedCard === "dosdonts" && (
                    <div className="bg-gradient-to-br from-[#1A1F2E] to-[#252D3F] p-6 border border-emerald-500/20">
                      <div className="flex items-center gap-3 mb-5">
                        <span className="text-4xl">✅</span>
                        <h3 className="text-white text-xl font-bold">Do&apos;s &amp; Don&apos;ts</h3>
                      </div>
                      <div className="space-y-4">
                        <div className="bg-emerald-500/10 rounded-xl p-4 border border-emerald-500/20">
                          <h4 className="text-emerald-400 font-bold text-sm mb-3 flex items-center gap-2">
                            <CheckCircle className="w-4 h-4" /> Do&apos;s
                          </h4>
                          <ul className="space-y-2">
                            {dailyInsights.dos.map((item, idx) => (
                              <li key={idx} className="text-white/70 text-sm flex items-start gap-2">
                                <span className="text-emerald-400 mt-0.5">&#10003;</span>
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="bg-red-500/10 rounded-xl p-4 border border-red-500/20">
                          <h4 className="text-red-400 font-bold text-sm mb-3 flex items-center gap-2">
                            <XCircle className="w-4 h-4" /> Don&apos;ts
                          </h4>
                          <ul className="space-y-2">
                            {dailyInsights.donts.map((item, idx) => (
                              <li key={idx} className="text-white/70 text-sm flex items-start gap-2">
                                <span className="text-red-400 mt-0.5">&#10007;</span>
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                      <button onClick={() => setExpandedCard(null)} className="w-full mt-5 py-3 bg-white/10 rounded-xl text-white/60 text-sm hover:bg-white/20 transition-colors">Close</button>
                    </div>
                  )}

                  {expandedCard === "tip" && (
                    <div className="bg-gradient-to-br from-[#1A1F2E] to-[#252D3F] p-6 border border-purple-500/20">
                      <div className="flex items-center gap-3 mb-5">
                        <span className="text-4xl">💡</span>
                        <h3 className="text-white text-xl font-bold">Daily Tip</h3>
                      </div>
                      <div className="bg-purple-500/10 rounded-xl p-5 border border-purple-500/20">
                        <p className="text-white/80 leading-relaxed">
                          {dailyInsights.daily_tip}
                        </p>
                      </div>
                      <p className="text-white/30 text-xs mt-3 text-center">
                        Personalized based on your birth chart
                      </p>
                      <button onClick={() => setExpandedCard(null)} className="w-full mt-5 py-3 bg-white/10 rounded-xl text-white/60 text-sm hover:bg-white/20 transition-colors">Close</button>
                    </div>
                  )}
                </motion.div>
              </div>
            )}

            {/* Daily Horoscope Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="relative rounded-2xl overflow-hidden cursor-pointer group border border-white/10"
              onClick={() => router.push("/horoscope")}
            >
              {/* Gradient background */}
              <div className="absolute inset-0 bg-[#1A1F2E]" />
              <div className={`absolute inset-0 bg-gradient-to-br ${userZodiac.color} opacity-50 group-hover:opacity-60 transition-opacity`} />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              
              {/* Decorative stars */}
              <div className="absolute top-3 right-4 opacity-20">
                <Star className="w-16 h-16 text-white" />
              </div>
              <div className="absolute top-6 right-16 opacity-10">
                <Sparkles className="w-8 h-8 text-white" />
              </div>

              <div className="relative p-5">
                <div className="flex items-start gap-4">
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${userZodiac.color} flex items-center justify-center shadow-lg flex-shrink-0`}>
                    <span className="text-white text-2xl">{userZodiac.symbol}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white/50 text-xs font-medium uppercase tracking-wider mb-0.5">Your Horoscope</p>
                    <h3 className="text-white font-bold text-lg">{userZodiac.sign}</h3>
                    <p className="text-white/50 text-xs mt-1">
                      {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 bg-white/10 rounded-full px-3 py-1.5 backdrop-blur-sm">
                    <span className="text-white/70 text-xs font-medium">Read</span>
                    <ChevronRight className="w-3.5 h-3.5 text-white/50" />
                  </div>
                </div>
                
                <div className="flex gap-2 mt-4">
                  {["Daily", "Weekly", "Monthly"].map((label) => (
                    <span key={label} className="bg-white/10 backdrop-blur-sm rounded-full px-3 py-1 text-white/60 text-[11px] font-medium">
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            </motion.div>
            
            {/* Reports from Advisors */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <h2 className="text-white font-semibold text-xl mb-4">Reports from Advisors</h2>
              
              <div className="space-y-3">
                {/* Palm Reading Report - Always unlocked with subscription */}
                <div 
                  onClick={() => router.push("/palm-reading")}
                  className="bg-[#1A2235] rounded-2xl border border-primary/20 p-3 cursor-pointer hover:border-primary/40 transition-colors relative"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-rose-500/30 to-pink-600/30 flex items-center justify-center flex-shrink-0 overflow-hidden border border-white/10">
                      <span className="text-3xl">🖐️</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-semibold">Palm Reading Report</h3>
                      <p className="text-white/50 text-xs mt-0.5">Discover your life path & destiny</p>
                    </div>
                    <ChevronRight className="w-6 h-6 text-white/40" />
                  </div>
                </div>

                {/* Prediction 2026 Report */}
                <div 
                  onClick={() => {
                    if (unlockedFeatures.prediction2026) {
                      router.push("/prediction-2026");
                    } else {
                      setUpsellPopup({ isOpen: true, feature: "prediction2026" });
                    }
                  }}
                  className="bg-[#1A2235] rounded-2xl border border-primary/20 p-3 cursor-pointer hover:border-primary/40 transition-colors relative"
                >
                  {!unlockedFeatures.prediction2026 && (
                    <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center">
                      <Lock className="w-3 h-3 text-white/60" />
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-indigo-500/30 to-purple-600/30 flex items-center justify-center flex-shrink-0 overflow-hidden border border-white/10">
                      <span className="text-3xl">🔮</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-semibold">Prediction 2026 Report</h3>
                      <p className="text-white/50 text-xs mt-0.5">What the stars hold for your future</p>
                      {!unlockedFeatures.prediction2026 && (
                        <button className="mt-1 px-3 py-1 bg-primary/20 text-primary text-xs rounded-full">
                          Get Report
                        </button>
                      )}
                    </div>
                    <ChevronRight className="w-6 h-6 text-white/40" />
                  </div>
                </div>

                {/* Birth Chart Report */}
                <div 
                  className={`bg-[#1A2235] border border-primary/20 transition-colors ${
                    birthChartTimerActive && !birthChartTimerExpired 
                      ? "rounded-2xl" 
                      : "rounded-2xl"
                  }`}
                >
                  <div 
                    onClick={async () => {
                      // Don't allow click if timer is active and not expired
                      if (birthChartTimerActive && !birthChartTimerExpired) {
                        return;
                      }
                      if (unlockedFeatures.birthChart) {
                        if (!birthChartGenerating) {
                          // Deactivate timer when user opens the report (with delay so user doesn't see it disappear)
                          if (birthChartTimerActive) {
                            // Update Firebase to deactivate timer after a delay
                            setTimeout(async () => {
                              setBirthChartTimerActive(false);
                              const userId = localStorage.getItem("palmcosmic_user_id");
                              if (userId) {
                                try {
                                  const { doc, updateDoc } = await import("firebase/firestore");
                                  await updateDoc(doc(db, "users", userId), {
                                    birthChartTimerActive: false,
                                  });
                                } catch (err) {
                                  console.error("Failed to deactivate timer:", err);
                                }
                              }
                            }, 2500);
                          }
                          router.push("/birth-chart");
                        }
                      } else {
                        setUpsellPopup({ isOpen: true, feature: "birthChart" });
                      }
                    }}
                    className={`p-3 relative ${
                      birthChartTimerActive && !birthChartTimerExpired 
                        ? "cursor-not-allowed opacity-70" 
                        : "cursor-pointer hover:bg-white/5"
                    }`}
                  >
                    {!unlockedFeatures.birthChart && (
                      <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center">
                        <Lock className="w-3 h-3 text-white/60" />
                      </div>
                    )}
                    {birthChartGenerating && (
                      <div className="absolute top-2 right-2">
                        <Loader2 className="w-5 h-5 text-primary animate-spin" />
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-orange-500/30 to-amber-600/30 flex items-center justify-center flex-shrink-0 overflow-hidden border border-white/10">
                        <span className="text-3xl">📊</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-semibold">Birth Chart Report</h3>
                        <p className="text-white/50 text-xs mt-0.5">Your complete astrological blueprint</p>
                        {!unlockedFeatures.birthChart && (
                          <button className="mt-1 px-3 py-1 bg-primary/20 text-primary text-xs rounded-full">
                            Get Report
                          </button>
                        )}
                        {birthChartGenerating && (
                          <p className="text-white/50 text-xs mt-1">Generating your chart...</p>
                        )}
                      </div>
                      <ChevronRight className="w-6 h-6 text-white/40" />
                    </div>
                  </div>
                  {/* Timer Bar */}
                  {unlockedFeatures.birthChart && birthChartTimerActive && (
                    <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 px-4 py-2.5 flex items-center justify-center gap-2 border-t border-primary/20">
                      <BirthChartTimer 
                        startedAt={birthChartTimerStartedAt} 
                        isActive={birthChartTimerActive}
                        onExpire={() => setBirthChartTimerExpired(true)}
                      />
                      {!birthChartTimerExpired && (
                        <span className="text-amber-400/80 text-xs">until your report is ready</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Compatibility Test */}
                <div 
                  onClick={() => {
                    if (unlockedFeatures.compatibilityTest) {
                      router.push("/compatibility");
                    } else {
                      setUpsellPopup({ isOpen: true, feature: "compatibilityTest" });
                    }
                  }}
                  className="bg-[#1A2235] rounded-2xl border border-primary/20 p-3 cursor-pointer hover:border-primary/40 transition-colors relative"
                >
                  {!unlockedFeatures.compatibilityTest && (
                    <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center">
                      <Lock className="w-3 h-3 text-white/60" />
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-pink-500/30 to-rose-600/30 flex items-center justify-center flex-shrink-0 overflow-hidden border border-white/10">
                      <span className="text-3xl">💕</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-semibold">Compatibility Test</h3>
                      <p className="text-white/50 text-xs mt-0.5">Find your perfect cosmic match</p>
                      {!unlockedFeatures.compatibilityTest && (
                        <button className="mt-1 px-3 py-1 bg-primary/20 text-primary text-xs rounded-full">
                          Get Report
                        </button>
                      )}
                    </div>
                    <ChevronRight className="w-6 h-6 text-white/40" />
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Upsell Popup */}
        {upsellPopup.feature && (
          <UpsellPopup
            isOpen={upsellPopup.isOpen}
            onClose={() => setUpsellPopup({ isOpen: false, feature: null })}
            feature={upsellPopup.feature}
          />
        )}
      </div>
    </div>
  );
}
