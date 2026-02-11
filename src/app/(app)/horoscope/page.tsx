"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, Loader2, Sparkles, Star } from "lucide-react";
import { getZodiacSign, getZodiacSymbol } from "@/lib/astrology-api";
import { useOnboardingStore } from "@/lib/onboarding-store";
import { supabase } from "@/lib/supabase";

const ZODIAC_SIGNS = [
  { sign: "Aries", symbol: "♈", gradient: "from-red-500 to-orange-500", element: "Fire" },
  { sign: "Taurus", symbol: "♉", gradient: "from-green-500 to-emerald-600", element: "Earth" },
  { sign: "Gemini", symbol: "♊", gradient: "from-yellow-400 to-amber-500", element: "Air" },
  { sign: "Cancer", symbol: "♋", gradient: "from-blue-400 to-cyan-500", element: "Water" },
  { sign: "Leo", symbol: "♌", gradient: "from-orange-400 to-yellow-500", element: "Fire" },
  { sign: "Virgo", symbol: "♍", gradient: "from-emerald-400 to-teal-500", element: "Earth" },
  { sign: "Libra", symbol: "♎", gradient: "from-pink-400 to-rose-500", element: "Air" },
  { sign: "Scorpio", symbol: "♏", gradient: "from-purple-500 to-indigo-600", element: "Water" },
  { sign: "Sagittarius", symbol: "♐", gradient: "from-violet-500 to-purple-600", element: "Fire" },
  { sign: "Capricorn", symbol: "♑", gradient: "from-slate-400 to-zinc-600", element: "Earth" },
  { sign: "Aquarius", symbol: "♒", gradient: "from-cyan-400 to-blue-500", element: "Air" },
  { sign: "Pisces", symbol: "♓", gradient: "from-indigo-400 to-violet-500", element: "Water" },
];

const PERIODS = [
  { id: "today", label: "Today", apiPeriod: "daily" },
  { id: "tomorrow", label: "Tomorrow", apiPeriod: "tomorrow" },
  { id: "week", label: "This Week", apiPeriod: "weekly" },
  { id: "month", label: "This Month", apiPeriod: "monthly" },
];

interface HoroscopeSection {
  title: string;
  icon: string;
  content: string;
}

interface SignHoroscopeData {
  horoscope: string;
  horoscope_sections?: HoroscopeSection[];
  focus_areas?: string[];
  challenges?: string[];
  sign?: string;
  period?: string;
}

export default function HoroscopePage() {
  const router = useRouter();
  const [selectedSign, setSelectedSign] = useState("Aries");
  const [selectedPeriod, setSelectedPeriod] = useState("today");
  const [showSignPicker, setShowSignPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [horoscopeData, setHoroscopeData] = useState<SignHoroscopeData | null>(null);
  const [userSign, setUserSign] = useState<string | null>(null);

  const { birthMonth: storeBirthMonth, birthDay: storeBirthDay } = useOnboardingStore();

  const currentSignData = ZODIAC_SIGNS.find((z) => z.sign === selectedSign) || ZODIAC_SIGNS[0];

  useEffect(() => {
    loadUserSign();
  }, []);

  const loadUserSign = async () => {
    try {
      const extractSignName = (sign: any): string | null => {
        if (!sign) return null;
        if (typeof sign === "string") return sign;
        if (sign.name) return sign.name;
        return null;
      };

      const userId = localStorage.getItem("astrorekha_user_id");

      if (userId) {
        const { data: userData } = await supabase.from("users").select("*").eq("id", userId).single();

        if (userData) {
          const storedSunSign = extractSignName(userData.sun_sign);
          if (storedSunSign) {
            setSelectedSign(storedSunSign);
            setUserSign(storedSunSign);
            return;
          }

          try {
            const { data: profile } = await supabase.from("user_profiles").select("sun_sign").eq("id", userId).single();
            if (profile) {
              const profileSunSign = extractSignName(profile.sun_sign);
              if (profileSunSign) {
                setSelectedSign(profileSunSign);
                setUserSign(profileSunSign);
                return;
              }
            }
          } catch (profileErr) {
            console.error("Error reading user_profiles:", profileErr);
          }

          if (userData.birth_month && userData.birth_day) {
            const sign = getZodiacSign(Number(userData.birth_month), Number(userData.birth_day));
            setSelectedSign(sign);
            setUserSign(sign);
            return;
          }
        }
      }

      const onboardingSunSign = useOnboardingStore.getState().sunSign;
      if (onboardingSunSign?.name) {
        setSelectedSign(onboardingSunSign.name);
        setUserSign(onboardingSunSign.name);
      } else if (storeBirthMonth && storeBirthDay) {
        const sign = getZodiacSign(Number(storeBirthMonth), Number(storeBirthDay));
        setSelectedSign(sign);
        setUserSign(sign);
      }
    } catch (error) {
      console.error("Error loading user sign:", error);
    }
  };

  useEffect(() => {
    fetchHoroscope();
  }, [selectedSign, selectedPeriod]);

  const fetchHoroscope = async () => {
    setLoading(true);
    setHoroscopeData(null);
    try {
      const periodConfig = PERIODS.find((p) => p.id === selectedPeriod);
      const apiPeriod = periodConfig?.apiPeriod || "daily";

      // Try pre-generated sign-based horoscope first
      const signRes = await fetch(`/api/horoscope/sign?sign=${selectedSign}&period=${apiPeriod}`);
      if (signRes.ok) {
        const signResult = await signRes.json();
        if (signResult.success && signResult.data) {
          setHoroscopeData(signResult.data);
          setLoading(false);
          return;
        }
      }

      // Fallback to cached/Divine API
      const period = apiPeriod === "tomorrow" ? "daily" : apiPeriod;
      const day = apiPeriod === "tomorrow" ? "TOMORROW" : "TODAY";
      const fallbackRes = await fetch(`/api/horoscope/cached?sign=${selectedSign}&period=${period}&day=${day}`);
      if (fallbackRes.ok) {
        const fallbackResult = await fallbackRes.json();
        if (fallbackResult.success && fallbackResult.data) {
          setHoroscopeData({
            horoscope: fallbackResult.data.horoscope_data || "",
            horoscope_sections: fallbackResult.data.horoscope_sections || undefined,
          });
        }
      }
    } catch (error) {
      console.error("Failed to fetch horoscope:", error);
    } finally {
      setLoading(false);
    }
  };

  const currentDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const periodTitle = selectedPeriod === "week" ? "Weekly" : selectedPeriod === "month" ? "Monthly" : selectedPeriod === "tomorrow" ? "Tomorrow\u2019s" : "Daily";

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <div className="w-full max-w-md min-h-screen bg-[#0A0E1A] overflow-hidden shadow-2xl shadow-black/50 flex flex-col">
        {/* Hero Header with Gradient */}
        <div className={`relative bg-gradient-to-br ${currentSignData.gradient} overflow-hidden`}>
          {/* Decorative stars */}
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-4 left-8 w-1 h-1 bg-white rounded-full" />
            <div className="absolute top-8 right-12 w-1.5 h-1.5 bg-white rounded-full" />
            <div className="absolute top-16 left-20 w-1 h-1 bg-white rounded-full" />
            <div className="absolute bottom-8 right-8 w-1 h-1 bg-white rounded-full" />
            <div className="absolute bottom-12 left-12 w-1.5 h-1.5 bg-white rounded-full" />
            <div className="absolute top-12 right-24 w-0.5 h-0.5 bg-white rounded-full" />
          </div>

          {/* Back button */}
          <div className="flex items-center justify-between px-4 pt-4 pb-2 relative z-10">
            <button
              onClick={() => router.push("/reports")}
              className="w-9 h-9 rounded-full bg-black/20 backdrop-blur-sm flex items-center justify-center hover:bg-black/30 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <Sparkles className="w-5 h-5 text-white/60" />
          </div>

          {/* Sign info */}
          <div className="px-6 pb-6 pt-2 relative z-10">
            <button
              onClick={() => setShowSignPicker(true)}
              className="flex items-center gap-2 mb-3 group"
            >
              <span className="text-5xl">{currentSignData.symbol}</span>
              <ChevronDown className="w-4 h-4 text-white/60 group-hover:text-white transition-colors" />
            </button>
            <h1 className="text-3xl font-bold text-white mb-1">
              {selectedSign}
            </h1>
            <p className="text-white/70 text-sm">
              {currentSignData.element} Sign {userSign === selectedSign && <span className="text-white/90">&#183; Your Sign</span>}
            </p>
            <p className="text-white/50 text-xs mt-1">{currentDate}</p>
          </div>
        </div>

        {/* Period Tabs */}
        <div className="flex gap-1 px-4 py-3 bg-[#0A0E1A] border-b border-white/5">
          {PERIODS.map((period) => (
            <button
              key={period.id}
              onClick={() => setSelectedPeriod(period.id)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${
                selectedPeriod === period.id
                  ? `bg-gradient-to-r ${currentSignData.gradient} text-white shadow-lg`
                  : "text-white/40 hover:text-white/60 hover:bg-white/5"
              }`}
            >
              {period.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${currentSignData.gradient} flex items-center justify-center animate-pulse`}>
                <Star className="w-6 h-6 text-white" />
              </div>
              <p className="text-white/40 text-sm">Reading the stars...</p>
            </div>
          ) : horoscopeData ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              key={`${selectedSign}-${selectedPeriod}`}
              className="px-5 py-6"
            >
              {/* Period Title */}
              <h2 className="text-xl font-bold text-white mb-5">
                {periodTitle} Horoscope
              </h2>

              {/* Focus & Challenges (if available from pre-generated data) */}
              {horoscopeData.focus_areas && horoscopeData.challenges && (
                <div className="grid grid-cols-2 gap-3 mb-6">
                  <div className="bg-emerald-500/10 rounded-xl p-4 border border-emerald-500/20">
                    <h3 className="text-emerald-400 font-semibold text-xs uppercase tracking-wider mb-2">Focus</h3>
                    <ul className="space-y-1.5">
                      {horoscopeData.focus_areas.map((item, idx) => (
                        <li key={idx} className="text-white/80 text-sm flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="bg-amber-500/10 rounded-xl p-4 border border-amber-500/20">
                    <h3 className="text-amber-400 font-semibold text-xs uppercase tracking-wider mb-2">Watch Out</h3>
                    <ul className="space-y-1.5">
                      {horoscopeData.challenges.map((item, idx) => (
                        <li key={idx} className="text-white/80 text-sm flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Horoscope Text - Organized by Sections */}
              <div className="space-y-4 mb-6">
                {(() => {
                  const sectionIcons: Record<string, string> = {
                    "overview": "✨",
                    "love & relationships": "💕",
                    "love": "💕",
                    "relationships": "💕",
                    "career & finance": "💼",
                    "career": "💼",
                    "finance": "💰",
                    "health & wellness": "🌿",
                    "health": "🌿",
                    "wellness": "🧘",
                    "travel & adventure": "✈️",
                    "travel": "✈️",
                  };

                  // Use structured sections if available (from Divine API)
                  if (horoscopeData.horoscope_sections && horoscopeData.horoscope_sections.length > 0) {
                    return horoscopeData.horoscope_sections.map((section, idx) => (
                      <div key={idx} className="bg-white/[0.03] rounded-xl p-4 border border-white/5">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-lg">
                            {sectionIcons[section.title.toLowerCase()] || "🔮"}
                          </span>
                          <h3 className="text-white font-semibold text-sm">{section.title}</h3>
                        </div>
                        <p className="text-white/70 leading-relaxed text-[14px]">
                          {section.content}
                        </p>
                      </div>
                    ));
                  }

                  // Fallback: try to parse **Section** markdown headers
                  const text = horoscopeData.horoscope;
                  const sectionRegex = /\*\*(.+?)\*\*/g;
                  const parts = text.split(sectionRegex);

                  if (parts.length > 1) {
                    const sections: { title: string; content: string }[] = [];
                    for (let i = 1; i < parts.length; i += 2) {
                      const title = parts[i]?.trim();
                      const content = parts[i + 1]?.trim();
                      if (title && content) {
                        sections.push({ title, content });
                      }
                    }
                    if (parts[0]?.trim()) {
                      sections.unshift({ title: "", content: parts[0].trim() });
                    }

                    return sections.map((section, idx) => (
                      <div key={idx} className="bg-white/[0.03] rounded-xl p-4 border border-white/5">
                        {section.title && (
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-lg">
                              {sectionIcons[section.title.toLowerCase()] || "🔮"}
                            </span>
                            <h3 className="text-white font-semibold text-sm">{section.title}</h3>
                          </div>
                        )}
                        {section.content
                          .split(/\n\n|\n/)
                          .filter((p: string) => p.trim())
                          .map((paragraph: string, pIdx: number) => (
                            <p key={pIdx} className="text-white/70 leading-relaxed text-[14px] mb-2 last:mb-0">
                              {paragraph.trim()}
                            </p>
                          ))}
                      </div>
                    ));
                  }

                  // Last fallback: split long text into logical sections by sentence grouping
                  const sentences = text.split(/(?<=\.)\s+/).filter((s: string) => s.trim());
                  if (sentences.length > 4) {
                    const chunkSize = Math.ceil(sentences.length / 4);
                    const autoSections = [
                      { title: "Overview", icon: "✨", sentences: sentences.slice(0, chunkSize) },
                      { title: "Love & Relationships", icon: "💕", sentences: sentences.slice(chunkSize, chunkSize * 2) },
                      { title: "Health & Wellness", icon: "🌿", sentences: sentences.slice(chunkSize * 2, chunkSize * 3) },
                      { title: "Career & Finance", icon: "💼", sentences: sentences.slice(chunkSize * 3) },
                    ].filter(s => s.sentences.length > 0);

                    return autoSections.map((section, idx) => (
                      <div key={idx} className="bg-white/[0.03] rounded-xl p-4 border border-white/5">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-lg">{section.icon}</span>
                          <h3 className="text-white font-semibold text-sm">{section.title}</h3>
                        </div>
                        <p className="text-white/70 leading-relaxed text-[14px]">
                          {section.sentences.join(" ")}
                        </p>
                      </div>
                    ));
                  }

                  // Absolute fallback: just render the text
                  return (
                    <div className="bg-white/[0.03] rounded-xl p-4 border border-white/5">
                      <p className="text-white/70 leading-relaxed text-[15px]">{text}</p>
                    </div>
                  );
                })()}
              </div>

              {/* Decorative divider */}
              <div className="flex items-center gap-3 my-6">
                <div className="flex-1 h-px bg-white/10" />
                <Sparkles className="w-4 h-4 text-white/20" />
                <div className="flex-1 h-px bg-white/10" />
              </div>

              {/* Source badge */}
              <div className="flex items-center justify-center gap-2 mb-4">
                <div className={`w-2 h-2 rounded-full bg-gradient-to-r ${currentSignData.gradient}`} />
                <span className="text-white/30 text-xs">Powered by Swiss Ephemeris + AI</span>
              </div>
            </motion.div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <p className="text-white/40 text-sm">Horoscope not available yet</p>
              <p className="text-white/30 text-xs">Check back soon</p>
            </div>
          )}
        </div>

        {/* Sign Picker Modal */}
        <AnimatePresence>
          {showSignPicker && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 z-50 flex items-end justify-center"
              onClick={() => setShowSignPicker(false)}
            >
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="w-full max-w-md bg-[#1A1F2E] rounded-t-3xl p-6"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-12 h-1 bg-white/20 rounded-full mx-auto mb-6" />
                <h2 className="text-white text-xl font-bold mb-4 text-center">Select Sign</h2>
                <div className="grid grid-cols-3 gap-3">
                  {ZODIAC_SIGNS.map((zodiac) => (
                    <button
                      key={zodiac.sign}
                      onClick={() => {
                        setSelectedSign(zodiac.sign);
                        setShowSignPicker(false);
                      }}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all ${
                        selectedSign === zodiac.sign
                          ? `bg-gradient-to-br ${zodiac.gradient} bg-opacity-20 border border-white/30 shadow-lg`
                          : "bg-white/5 hover:bg-white/10 border border-transparent"
                      }`}
                    >
                      <span className="text-2xl">{zodiac.symbol}</span>
                      <span className="text-white/80 text-xs font-medium">{zodiac.sign}</span>
                      {userSign === zodiac.sign && (
                        <span className="text-[10px] text-white/40">You</span>
                      )}
                    </button>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
