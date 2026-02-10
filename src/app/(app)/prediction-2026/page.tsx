"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, ChevronUp, Loader2, Star, Heart, Briefcase, Activity, Sparkles } from "lucide-react";
import { useOnboardingStore } from "@/lib/onboarding-store";
import predictions2026Data from "../../../../data/predictions-2026.json";

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december"
];

const MONTH_ICONS: Record<string, string> = {
  january: "❄️",
  february: "💝",
  march: "🌸",
  april: "🌷",
  may: "🌺",
  june: "☀️",
  july: "🌊",
  august: "🌻",
  september: "🍂",
  october: "🎃",
  november: "🍁",
  december: "🎄",
};

export default function Prediction2026Page() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [prediction, setPrediction] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  // Use ascendant sign for 2026 predictions (as per working.md requirements)
  const { ascendantSign } = useOnboardingStore();
  const zodiacSign = ascendantSign?.name || "Aries"; // Default to Aries if not set

  useEffect(() => {
    loadPrediction();
  }, [zodiacSign]);

  const loadPrediction = async () => {
    setLoading(true);
    setError(null);

    try {
      // Load from pre-generated JSON data
      const signKey = zodiacSign.toLowerCase() as keyof typeof predictions2026Data;
      const predictionData = predictions2026Data[signKey];
      
      if (predictionData) {
        setPrediction(predictionData.prediction);
      } else {
        setError("Prediction not available for your zodiac sign.");
      }
    } catch (err) {
      console.error("Failed to load prediction:", err);
      setError("Failed to load prediction. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const toggleMonth = (month: string) => {
    setExpandedMonth(expandedMonth === month ? null : month);
  };

  const getRatingColor = (rating: number) => {
    if (rating >= 8.5) return "text-green-400";
    if (rating >= 7) return "text-yellow-400";
    return "text-orange-400";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-full max-w-md h-screen bg-[#0A0E1A] flex items-center justify-center">
          <div className="text-center px-8">
            <Loader2 className="w-16 h-16 text-primary animate-spin mx-auto mb-6" />
            <h2 className="text-white text-xl font-bold mb-2">Consulting the Stars...</h2>
            <p className="text-white/60 text-sm">
              Generating your personalized 2026 predictions for {zodiacSign}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-full max-w-md h-screen bg-[#0A0E1A] flex flex-col">
          <div className="sticky top-0 z-40 bg-[#0A0E1A]/95 backdrop-blur-sm border-b border-white/10">
            <div className="flex items-center gap-4 px-4 py-3">
              <button onClick={() => router.back()} className="w-10 h-10 flex items-center justify-center">
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
              <h1 className="text-white text-xl font-semibold flex-1 text-center pr-10">2026 Predictions</h1>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center px-6">
            <div className="text-center">
              <p className="text-red-400 mb-4">{error}</p>
              <button
                onClick={loadPrediction}
                className="px-6 py-3 bg-primary rounded-xl text-white font-semibold"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <div className="w-full max-w-md h-screen bg-[#0A0E1A] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-40 bg-[#0A0E1A]/95 backdrop-blur-sm border-b border-white/10">
          <div className="flex items-center justify-between px-4 py-3">
            <button onClick={() => router.back()} className="w-10 h-10 flex items-center justify-center">
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <h1 className="text-white text-xl font-semibold">2026 Predictions</h1>
            <div className="w-10" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-6 space-y-4 pb-24">
            {/* Year Overview */}
            {prediction?.yearOverview && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-br from-primary/20 to-purple-600/20 rounded-2xl p-5 border border-primary/30"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center">
                    <Sparkles className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h2 className="text-white font-bold text-xl">{prediction.yearOverview.title}</h2>
                    <p className="text-primary text-sm">{zodiacSign} • 2026</p>
                  </div>
                </div>

                <p className="text-white/80 text-base leading-relaxed mb-4">
                  {prediction.yearOverview.summary}
                </p>

                {/* Key Themes */}
                {prediction.yearOverview.keyThemes && (
                  <div className="mb-4">
                    <h4 className="text-white/60 text-xs uppercase tracking-wider mb-2">Key Themes</h4>
                    <div className="flex flex-wrap gap-2">
                      {prediction.yearOverview.keyThemes.map((theme: string, idx: number) => (
                        <span
                          key={idx}
                          className="px-3 py-1 bg-white/10 rounded-full text-white text-sm"
                        >
                          {theme}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Lucky Numbers & Colors */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-black/20 rounded-xl p-3">
                    <p className="text-white/40 text-xs mb-1">Lucky Numbers</p>
                    <p className="text-white font-semibold">
                      {prediction.yearOverview.luckyNumbers?.join(", ")}
                    </p>
                  </div>
                  <div className="bg-black/20 rounded-xl p-3">
                    <p className="text-white/40 text-xs mb-1">Lucky Colors</p>
                    <p className="text-white font-semibold">
                      {prediction.yearOverview.luckyColors?.join(", ")}
                    </p>
                  </div>
                </div>

                {/* Overall Rating */}
                {prediction.yearOverview.overallRating && (
                  <div className="mt-4 flex items-center justify-center gap-2">
                    <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                    <span className="text-white font-bold text-lg">
                      {prediction.yearOverview.overallRating}/10
                    </span>
                    <span className="text-white/40 text-sm">Year Rating</span>
                  </div>
                )}
              </motion.div>
            )}

            {/* Monthly Predictions */}
            <div>
              <h3 className="text-white font-semibold text-lg mb-3">Monthly Breakdown</h3>
              <div className="space-y-2">
                {MONTHS.map((month, idx) => {
                  const monthData = prediction?.months?.[month];
                  if (!monthData) return null;

                  const isExpanded = expandedMonth === month;

                  return (
                    <motion.div
                      key={month}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className="bg-[#1A1F2E] rounded-2xl border border-white/10 overflow-hidden"
                    >
                      {/* Month Header */}
                      <button
                        onClick={() => toggleMonth(month)}
                        className="w-full p-4 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{MONTH_ICONS[month]}</span>
                          <div className="text-left">
                            <h4 className="text-white font-semibold capitalize">{monthData.title || `${month} 2026`}</h4>
                            {!isExpanded && (
                              <p className="text-white/50 text-xs line-clamp-1">{monthData.overview}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {monthData.rating && (
                            <span className={`font-bold ${getRatingColor(monthData.rating)}`}>
                              {monthData.rating}
                            </span>
                          )}
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5 text-white/40" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-white/40" />
                          )}
                        </div>
                      </button>

                      {/* Expanded Content */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="px-4 pb-4 space-y-4">
                              {/* Overview */}
                              <p className="text-white/70 text-sm">{monthData.overview}</p>

                              {/* Love */}
                              {monthData.love && (
                                <div className="bg-pink-500/10 rounded-xl p-3">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Heart className="w-4 h-4 text-pink-400" />
                                    <span className="text-pink-400 font-semibold text-sm">Love & Relationships</span>
                                  </div>
                                  <p className="text-white/70 text-sm">{monthData.love}</p>
                                </div>
                              )}

                              {/* Career */}
                              {monthData.career && (
                                <div className="bg-blue-500/10 rounded-xl p-3">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Briefcase className="w-4 h-4 text-blue-400" />
                                    <span className="text-blue-400 font-semibold text-sm">Career & Finance</span>
                                  </div>
                                  <p className="text-white/70 text-sm">{monthData.career}</p>
                                </div>
                              )}

                              {/* Health */}
                              {monthData.health && (
                                <div className="bg-green-500/10 rounded-xl p-3">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Activity className="w-4 h-4 text-green-400" />
                                    <span className="text-green-400 font-semibold text-sm">Health & Wellness</span>
                                  </div>
                                  <p className="text-white/70 text-sm">{monthData.health}</p>
                                </div>
                              )}

                              {/* Lucky Days */}
                              {monthData.luckyDays && monthData.luckyDays.length > 0 && (
                                <div className="flex items-center gap-2">
                                  <span className="text-white/40 text-xs">Lucky Days:</span>
                                  <div className="flex gap-1">
                                    {monthData.luckyDays.map((day: number, i: number) => (
                                      <span
                                        key={i}
                                        className="w-7 h-7 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center"
                                      >
                                        {day}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
