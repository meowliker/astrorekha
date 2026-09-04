"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, CalendarDays, ChevronDown, ChevronUp, Clock, Lightbulb, Loader2, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReportDisclaimer from "@/components/ReportDisclaimer";
import { getCompatibilityResult, getInstantCompatibility, saveCompatibilityResult } from "@/lib/compatibility-data";
import { calculateMoonMerge, calculateMoonPhase, type MoonMergeReport, type MoonPhaseReport } from "@/lib/moon-phase";
import { supabase } from "@/lib/supabase";
import { approximateMoonSign, extractStoredSignName } from "@/lib/zodiac-utils";

const SIGN_SYMBOLS: Record<string, string> = {
  Aries: "♈",
  Taurus: "♉",
  Gemini: "♊",
  Cancer: "♋",
  Leo: "♌",
  Virgo: "♍",
  Libra: "♎",
  Scorpio: "♏",
  Sagittarius: "♐",
  Capricorn: "♑",
  Aquarius: "♒",
  Pisces: "♓",
};

const SIGN_ELEMENTS: Record<string, string> = {
  Aries: "Fire",
  Taurus: "Earth",
  Gemini: "Air",
  Cancer: "Water",
  Leo: "Fire",
  Virgo: "Earth",
  Libra: "Air",
  Scorpio: "Water",
  Sagittarius: "Fire",
  Capricorn: "Earth",
  Aquarius: "Air",
  Pisces: "Water",
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type FullResult = {
  sign1: string;
  sign2: string;
  score: number;
  description: string;
  matchLevel: string;
  matchSubtitle: string;
  relationshipGlance: string;
  wheelOfBalance: {
    emotional: number;
    intellectual: number;
    spiritual: number;
    sexual: number;
  };
  wheelDescriptions: {
    emotional: string;
    intellectual: string;
    spiritual: string;
    sexual: string;
  };
  toxicityScore: number;
  toxicityDescription: string;
  aspects: {
    love: number;
    marriage: number;
    trust: number;
    teamwork: number;
    communication: number;
    humor: number;
  };
  aspectDescriptions: {
    love: string;
    marriage: string;
    trust: string;
    teamwork: string;
    communication: string;
    humor: string;
  };
  challenges: {
    title: string;
    description: string;
    solution: string;
  }[];
  moonMerge?: {
    user: MoonPhaseReport;
    partner: MoonPhaseReport;
    merge: MoonMergeReport;
  };
};

function monthToNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric >= 1 && numeric <= 12) return numeric;
  const index = MONTH_NAMES.findIndex((month) => month.toLowerCase() === raw.toLowerCase());
  return index >= 0 ? index + 1 : null;
}

function splitDate(value: string): { year: string; month: string; day: string } | null {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return null;
  return { year, month: String(Number(month)), day: String(Number(day)) };
}

function parseTimezoneOffset(value: unknown) {
  const offset = Number(String(value || "").trim());
  return Number.isFinite(offset) ? offset : 5.5;
}

function parseTimeValue(value: string) {
  const [hourRaw, minuteRaw] = value.split(":");
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);

  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return { hour: 12, minute: 0 };
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return { hour, minute: 0 };

  return { hour, minute };
}

function parseStoredBirthTime(hourValue: unknown, minuteValue: unknown, periodValue: unknown) {
  const hour = Number(String(hourValue || "").trim());
  const minute = Number(String(minuteValue || "0").trim());
  const period = String(periodValue || "").trim().toUpperCase();

  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return { hour: 12, minute: 0 };

  if (period === "AM" || period === "PM") {
    if (!Number.isInteger(hour) || hour < 1 || hour > 12) return { hour: 12, minute: 0 };
    if (period === "AM") return { hour: hour === 12 ? 0 : hour, minute };
    return { hour: hour === 12 ? 12 : hour + 12, minute };
  }

  if (Number.isInteger(hour) && hour >= 0 && hour <= 23) return { hour, minute };

  return { hour: 12, minute: 0 };
}

function formatMoonPercent(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function extractPartnerMoonSign(payload: any): string | null {
  return (
    extractStoredSignName(payload?.data?.planets?.Moon?.zodiac_sign) ||
    extractStoredSignName(payload?.data?.kundli?.nakshatra_details?.chandra_rasi?.name) ||
    extractStoredSignName(payload?.data?.moon_sign)
  );
}

function buildFullResult(data: ReturnType<typeof getInstantCompatibility>): FullResult {
  const score = data.overallScore;
  const matchLevel = score >= 80 ? "Excellent match" : score >= 60 ? "Good match" : score >= 40 ? "Challenging match" : "Difficult match";
  const matchSubtitle = score >= 60 ? "Great potential for lasting love" : "May push one another to the extreme";
  const variance = (seed: number) => Math.max(15, Math.min(95, score + (seed % 40) - 20));

  return {
    score,
    description: data.summary,
    sign1: data.sign1,
    sign2: data.sign2,
    matchLevel,
    matchSubtitle,
    relationshipGlance: data.summary,
    wheelOfBalance: {
      emotional: data.emotionalScore,
      intellectual: data.intellectualScore,
      spiritual: data.spiritualScore,
      sexual: data.physicalScore,
    },
    wheelDescriptions: {
      emotional: data.strengths[0] || "Strong emotional connection",
      intellectual: data.strengths[1] || "Good mental compatibility",
      spiritual: data.strengths[2] || "Shared values and beliefs",
      sexual: data.strengths[3] || "Physical chemistry present",
    },
    toxicityScore: data.toxicityScore,
    toxicityDescription: data.toxicityDescription,
    aspects: {
      love: variance(data.sign1.charCodeAt(0)),
      marriage: variance(data.sign2.charCodeAt(0)),
      trust: variance(data.sign1.length * 13),
      teamwork: variance(data.sign2.length * 17),
      communication: variance((data.sign1.length + data.sign2.length) * 3),
      humor: variance(data.sign1.charCodeAt(1) || 70),
    },
    aspectDescriptions: {
      love: "Loading...",
      marriage: "Loading...",
      trust: "Loading...",
      teamwork: "Loading...",
      communication: "Loading...",
      humor: "Loading...",
    },
    challenges: data.challenges,
  };
}

function MoonPhaseOrb({ phase, size = 80 }: { phase: MoonPhaseReport; size?: number }) {
  const rawId = useId().replace(/:/g, "");
  const gradientId = `moonGradient-${rawId}`;
  const glowId = `moonGlow-${rawId}`;
  const illumination = phase.illumination / 100;
  const controlX = phase.waxing
    ? 50 + (1 - 2 * illumination) * 88
    : 50 - (1 - 2 * illumination) * 88;
  const litPath = phase.waxing
    ? `M 50 6 A 44 44 0 0 1 50 94 Q ${controlX} 50 50 6 Z`
    : `M 50 6 A 44 44 0 0 0 50 94 Q ${controlX} 50 50 6 Z`;

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="drop-shadow-[0_0_18px_rgba(212,184,150,0.28)]">
      <defs>
        <radialGradient id={gradientId} cx="35%" cy="28%" r="70%">
          <stop offset="0%" stopColor="#FFF7D6" />
          <stop offset="46%" stopColor="#D4B896" />
          <stop offset="100%" stopColor="#9B7A50" />
        </radialGradient>
        <radialGradient id={glowId} cx="45%" cy="38%" r="72%">
          <stop offset="0%" stopColor="#253147" />
          <stop offset="100%" stopColor="#070B14" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="45" fill={`url(#${glowId})`} stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
      {phase.illumination >= 98 ? (
        <circle cx="50" cy="50" r="44" fill={`url(#${gradientId})`} />
      ) : phase.illumination > 2 ? (
        <path d={litPath} fill={`url(#${gradientId})`} />
      ) : null}
      <circle cx="36" cy="32" r="4" fill="rgba(8,12,22,0.18)" />
      <circle cx="61" cy="42" r="3" fill="rgba(8,12,22,0.14)" />
      <circle cx="45" cy="63" r="2.7" fill="rgba(8,12,22,0.15)" />
      <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="1" />
    </svg>
  );
}

function MoonPersonCard({ label, phase }: { label: string; phase: MoonPhaseReport }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-center">
      <div className="mx-auto mb-2 flex justify-center">
        <MoonPhaseOrb phase={phase} size={70} />
      </div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/38">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{phase.phaseName}</p>
      <p className="mt-1 text-xs text-[#D4B896]/75">{formatMoonPercent(phase.illumination)}% illuminated</p>
    </div>
  );
}

function MoonMergePanel({ moonMerge }: { moonMerge: NonNullable<FullResult["moonMerge"]> }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-[#D4B896]/20 bg-gradient-to-br from-[#121827] via-[#161A2A] to-[#251324] p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#D4B896]/70">Birth Moon Merge</p>
          <h3 className="mt-1 text-xl font-bold text-white">{moonMerge.merge.title}</h3>
        </div>
        <div className="rounded-full border border-[#D4B896]/25 bg-[#D4B896]/10 px-3 py-1 text-lg font-black text-[#F5D7A1]">
          {moonMerge.merge.score}%
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <MoonPersonCard label="You" phase={moonMerge.user} />

        <div className="relative flex h-28 w-20 items-center justify-center overflow-visible">
          <motion.div
            initial={{ x: -34, opacity: 0.75 }}
            animate={{ x: [ -34, 0, -5 ] }}
            transition={{ duration: 1.1, ease: "easeOut", delay: 0.1 }}
            className="absolute"
          >
            <MoonPhaseOrb phase={moonMerge.user} size={54} />
          </motion.div>
          <motion.div
            initial={{ x: 34, opacity: 0.75 }}
            animate={{ x: [ 34, 0, 5 ] }}
            transition={{ duration: 1.1, ease: "easeOut", delay: 0.1 }}
            className="absolute"
          >
            <MoonPhaseOrb phase={moonMerge.partner} size={54} />
          </motion.div>
          <motion.div
            initial={{ scale: 0.35, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.45, ease: "easeOut", delay: 0.95 }}
            className="absolute flex h-16 w-16 items-center justify-center rounded-full border border-[#F5D7A1]/30 bg-[#F5D7A1]/10 shadow-[0_0_26px_rgba(245,215,161,0.22)]"
          >
            <span className="text-sm font-black text-[#F5D7A1]">{moonMerge.merge.score}%</span>
          </motion.div>
        </div>

        <MoonPersonCard label="Partner" phase={moonMerge.partner} />
      </div>

      <p className="mt-4 text-sm leading-relaxed text-white/70">{moonMerge.merge.summary}</p>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-white/[0.045] px-3 py-2 text-center">
          <p className="text-base font-bold text-white">{moonMerge.merge.completionScore}%</p>
          <p className="text-[11px] text-white/45">Completion</p>
        </div>
        <div className="rounded-xl bg-white/[0.045] px-3 py-2 text-center">
          <p className="text-base font-bold text-white">{moonMerge.merge.similarityScore}%</p>
          <p className="text-[11px] text-white/45">Similarity</p>
        </div>
        <div className="rounded-xl bg-white/[0.045] px-3 py-2 text-center">
          <p className="text-base font-bold text-white">{moonMerge.merge.illuminationBalance}%</p>
          <p className="text-[11px] text-white/45">Light Balance</p>
        </div>
      </div>
    </div>
  );
}

export default function PartnerCompatibilityPage() {
  const router = useRouter();
  const [userMoonSign, setUserMoonSign] = useState<string | null>(null);
  const [userMoonPhase, setUserMoonPhase] = useState<MoonPhaseReport | null>(null);
  const [userMoonLoading, setUserMoonLoading] = useState(true);
  const [partnerBirthDate, setPartnerBirthDate] = useState("");
  const [partnerBirthTime, setPartnerBirthTime] = useState("12:00");
  const [partnerMoonSign, setPartnerMoonSign] = useState<string | null>(null);
  const [result, setResult] = useState<FullResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReadMore, setShowReadMore] = useState(false);
  const [expandedAspect, setExpandedAspect] = useState<string | null>(null);
  const [expandedChallenge, setExpandedChallenge] = useState<number | null>(null);
  const [expandedWheel, setExpandedWheel] = useState<string | null>(null);

  useEffect(() => {
    const loadUserMoonSign = async () => {
      setUserMoonLoading(true);
      try {
        const userId = localStorage.getItem("astrorekha_user_id");
        if (!userId) {
          setUserMoonSign(null);
          return;
        }

        const { data: userData } = await supabase
          .from("users")
          .select("moon_sign, birth_month, birth_day, birth_year, birth_hour, birth_minute, birth_period, timezone")
          .eq("id", userId)
          .single();

        let moonSign = extractStoredSignName(userData?.moon_sign);
        let birthMonth = userData?.birth_month;
        let birthDay = userData?.birth_day;
        let birthYear = userData?.birth_year;
        let birthHour = userData?.birth_hour;
        let birthMinute = userData?.birth_minute;
        let birthPeriod = userData?.birth_period;
        let timezone = userData?.timezone;

        if (!moonSign || !birthMonth || !birthDay || !birthYear) {
          const { data: profileData } = await supabase
            .from("user_profiles")
            .select("moon_sign, birth_month, birth_day, birth_year, birth_hour, birth_minute, birth_period, timezone")
            .eq("id", userId)
            .single();

          moonSign = moonSign || extractStoredSignName(profileData?.moon_sign);
          birthMonth = birthMonth || profileData?.birth_month;
          birthDay = birthDay || profileData?.birth_day;
          birthYear = birthYear || profileData?.birth_year;
          birthHour = birthHour || profileData?.birth_hour;
          birthMinute = birthMinute || profileData?.birth_minute;
          birthPeriod = birthPeriod || profileData?.birth_period;
          timezone = timezone || profileData?.timezone;
        }

        if (!moonSign && birthMonth && birthDay && birthYear) {
          const month = monthToNumber(birthMonth);
          if (month) {
            moonSign = approximateMoonSign(month, String(birthDay), String(birthYear));
          }
        }

        if (birthMonth && birthDay && birthYear) {
          const month = monthToNumber(birthMonth);
          const day = Number(birthDay);
          const year = Number(birthYear);

          if (month && Number.isInteger(day) && Number.isInteger(year)) {
            const time = parseStoredBirthTime(birthHour, birthMinute, birthPeriod);
            setUserMoonPhase(
              calculateMoonPhase({
                year,
                month,
                day,
                hour: time.hour,
                minute: time.minute,
                timezoneOffsetHours: parseTimezoneOffset(timezone),
              })
            );
          } else {
            setUserMoonPhase(null);
          }
        } else {
          setUserMoonPhase(null);
        }

        setUserMoonSign(moonSign || null);
      } catch (err) {
        console.error("Failed to load user moon sign:", err);
        setUserMoonSign(null);
        setUserMoonPhase(null);
      } finally {
        setUserMoonLoading(false);
      }
    };

    loadUserMoonSign();
  }, []);

  const canSubmit = useMemo(
    () => !!partnerBirthDate && !!partnerBirthTime && !!userMoonSign && !loading,
    [partnerBirthDate, partnerBirthTime, userMoonSign, loading]
  );

  const buildResult = async (sign1: string, sign2: string) => {
    const cached = await getCompatibilityResult(sign1, sign2);
    const data = cached || getInstantCompatibility(sign1, sign2);
    if (!cached) saveCompatibilityResult(data).catch(console.error);
    return buildFullResult({ ...data, sign1, sign2 });
  };

  const handleFindCompatibility = async () => {
    if (!userMoonSign) {
      setError("Your Moon sign is not available yet.");
      return;
    }

    const parts = splitDate(partnerBirthDate);
    if (!parts) {
      setError("Please enter a valid partner birth date.");
      return;
    }

    setLoading(true);
    setError(null);
    setPartnerMoonSign(null);

    try {
      const partnerTime = parseTimeValue(partnerBirthTime);
      const nextPartnerMoonPhase = calculateMoonPhase({
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
        hour: partnerTime.hour,
        minute: partnerTime.minute,
        timezoneOffsetHours: 5.5,
      });
      const response = await fetch("/api/astrology/birth-chart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          birthDate: partnerBirthDate,
          birthTime: partnerBirthTime,
          latitude: 28.6139,
          longitude: 77.209,
          timezone: 5.5,
          chartType: "vedic",
        }),
      });

      let moonSign: string | null = null;
      if (response.ok) {
        const payload = await response.json();
        moonSign = extractPartnerMoonSign(payload);
      }

      if (!moonSign) {
        moonSign = approximateMoonSign(parts.month, parts.day, parts.year);
      }

      setPartnerMoonSign(moonSign);
      const nextResult = await buildResult(userMoonSign, moonSign);
      setResult(
        userMoonPhase
          ? {
              ...nextResult,
              moonMerge: {
                user: userMoonPhase,
                partner: nextPartnerMoonPhase,
                merge: calculateMoonMerge(userMoonPhase, nextPartnerMoonPhase),
              },
            }
          : nextResult
      );
    } catch (err) {
      console.error("Moon compatibility error:", err);
      const fallback = approximateMoonSign(parts.month, parts.day, parts.year);
      const partnerTime = parseTimeValue(partnerBirthTime);
      const nextPartnerMoonPhase = calculateMoonPhase({
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
        hour: partnerTime.hour,
        minute: partnerTime.minute,
        timezoneOffsetHours: 5.5,
      });
      setPartnerMoonSign(fallback);
      const nextResult = await buildResult(userMoonSign, fallback);
      setResult(
        userMoonPhase
          ? {
              ...nextResult,
              moonMerge: {
                user: userMoonPhase,
                partner: nextPartnerMoonPhase,
                merge: calculateMoonMerge(userMoonPhase, nextPartnerMoonPhase),
              },
            }
          : nextResult
      );
    } finally {
      setLoading(false);
    }
  };

  const getSignElement = (name: string) => SIGN_ELEMENTS[name] || "Unknown";

  const getAspectColor = (value: number) => {
    if (value >= 70) return "bg-gradient-to-r from-yellow-400 to-orange-400";
    if (value >= 50) return "bg-gradient-to-r from-cyan-400 to-blue-400";
    if (value >= 30) return "bg-gradient-to-r from-pink-400 to-rose-400";
    return "bg-gradient-to-r from-green-400 to-rose-400";
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <div className="w-full max-w-md min-h-screen bg-[#0A0E1A] shadow-2xl shadow-black/50">
        <div className="sticky top-0 z-40 bg-[#0A0E1A]/95 backdrop-blur-sm">
          <div className="flex items-center gap-4 px-4 py-3">
            <button
              onClick={() => (result ? setResult(null) : router.push("/compatibility"))}
              className="w-10 h-10 flex items-center justify-center"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <h1 className="text-white text-xl font-semibold italic flex-1 text-center pr-10">Compatibility Report</h1>
          </div>
        </div>

        <main className="px-4 py-6 space-y-6">
          {!result ? (
            <>
              <div className="text-center space-y-3">
                <div className="mx-auto w-16 h-16 rounded-full bg-[#D4B896]/15 border border-[#D4B896]/30 flex items-center justify-center">
                  <Moon className="w-7 h-7 text-[#D4B896]" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Partner birth details</h2>
                  <p className="mt-2 text-sm leading-relaxed text-white/60">
                    {userMoonLoading
                      ? "Loading your Moon sign..."
                      : userMoonSign
                        ? `Your Moon sign: ${userMoonSign}${userMoonPhase ? ` • ${userMoonPhase.phaseName}` : ""}`
                        : "Your Moon sign could not be found."}
                  </p>
                </div>
              </div>

              <div className="space-y-4 rounded-2xl border border-white/10 bg-[#121827] p-4">
                <label className="block">
                  <span className="mb-2 flex items-center gap-2 text-sm font-medium text-white/70">
                    <CalendarDays className="h-4 w-4 text-[#D4B896]" />
                    Partner birth date
                  </span>
                  <input
                    type="date"
                    value={partnerBirthDate}
                    onChange={(event) => setPartnerBirthDate(event.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#0A0E1A] px-4 py-3 text-white outline-none focus:border-[#D4B896]/60"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 flex items-center gap-2 text-sm font-medium text-white/70">
                    <Clock className="h-4 w-4 text-[#D4B896]" />
                    Partner birth time
                  </span>
                  <input
                    type="time"
                    value={partnerBirthTime}
                    onChange={(event) => setPartnerBirthTime(event.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#0A0E1A] px-4 py-3 text-white outline-none focus:border-[#D4B896]/60"
                  />
                </label>
              </div>

              {error && (
                <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              )}

              <Button
                onClick={handleFindCompatibility}
                disabled={!canSubmit}
                className="w-full rounded-full bg-rose-600 py-6 text-lg font-medium text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Finding compatibility...
                  </>
                ) : (
                  "Find compatibility"
                )}
              </Button>
            </>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {result.moonMerge && <MoonMergePanel moonMerge={result.moonMerge} />}

              <div className="space-y-4">
                <div className="text-center">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#D4B896]/70">Sign Compatibility</p>
                  <p className="mt-1 text-sm text-white/45">Based on both partners&apos; birth chart signs</p>
                </div>

              <div className="flex items-center justify-center gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#D4B896]/30 to-[#C4A676]/20 border-2 border-[#D4B896]/50 flex items-center justify-center">
                    <span className="text-[#D4B896] text-3xl">{SIGN_SYMBOLS[result.sign1] || "☾"}</span>
                  </div>
                  <span className="text-[#D4B896] text-sm mt-2">{result.sign1}</span>
                  <span className="text-[#D4B896]/50 text-xs flex items-center gap-1">
                    <span className="text-xs">≋</span> {getSignElement(result.sign1)}
                  </span>
                </div>

                <div className="flex flex-col items-center">
                  <span className="text-white text-2xl font-bold">{result.score}%</span>
                  <div className="w-16 h-1 bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 rounded-full mt-1" />
                </div>

                <div className="flex flex-col items-center">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#D4B896]/30 to-[#C4A676]/20 border-2 border-[#D4B896]/50 flex items-center justify-center">
                    <span className="text-[#D4B896] text-3xl">{SIGN_SYMBOLS[result.sign2] || "☾"}</span>
                  </div>
                  <span className="text-[#D4B896] text-sm mt-2">{result.sign2}</span>
                  <span className="text-[#D4B896]/50 text-xs flex items-center gap-1">
                    <span className="text-xs">≡</span> {getSignElement(result.sign2)}
                  </span>
                </div>
              </div>

              <div className="text-center">
                <h2 className="text-white text-2xl font-bold">{result.matchLevel}</h2>
                <p className="text-white/60 text-sm">{result.matchSubtitle}</p>
              </div>
              </div>

              <div className="bg-[#1A2535] rounded-2xl p-5 border border-[#2A3545]">
                <h3 className="text-[#D4B896] text-lg font-semibold mb-3">Relationship at a glance</h3>
                <p className="text-white/70 text-sm leading-relaxed">
                  {result.relationshipGlance.length > 200
                    ? showReadMore
                      ? result.relationshipGlance
                      : result.relationshipGlance.slice(0, 150) + "..."
                    : result.relationshipGlance}
                </p>
                {result.relationshipGlance.length > 200 && (
                  <button
                    onClick={() => setShowReadMore(!showReadMore)}
                    className="text-rose-400 text-sm mt-2 flex items-center gap-1"
                  >
                    {showReadMore ? "Show less" : "Read more"}
                    {showReadMore ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                )}
              </div>

              <div>
                <h3 className="text-white text-xl font-bold mb-4">Wheel of balance</h3>
                <div className="relative">
                  <div className="flex justify-between mb-2 px-4">
                    <div className="text-left">
                      <span className="px-3 py-1 bg-teal-500/20 text-teal-400 text-xs rounded-full">Emotional</span>
                      <p className="text-teal-400 text-lg font-bold mt-1">{result.wheelOfBalance.emotional}%</p>
                    </div>
                    <div className="text-right">
                      <span className="px-3 py-1 bg-amber-500/20 text-amber-400 text-xs rounded-full">Intellectual</span>
                      <p className="text-amber-400 text-lg font-bold mt-1">{result.wheelOfBalance.intellectual}%</p>
                    </div>
                  </div>

                  <div className="relative flex justify-center my-4">
                    <svg viewBox="0 0 200 200" className="w-56 h-56">
                      <circle cx="100" cy="100" r="90" fill="#1A2535" />
                      <path
                        d={`M 100 100 L 100 ${100 - 90 * result.wheelOfBalance.emotional / 100} A ${90 * result.wheelOfBalance.emotional / 100} ${90 * result.wheelOfBalance.emotional / 100} 0 0 0 ${100 - 90 * result.wheelOfBalance.emotional / 100} 100 Z`}
                        fill="#2DD4BF"
                        className="cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => setExpandedWheel("emotional")}
                      />
                      <path
                        d={`M 100 100 L ${100 + 90 * result.wheelOfBalance.intellectual / 100} 100 A ${90 * result.wheelOfBalance.intellectual / 100} ${90 * result.wheelOfBalance.intellectual / 100} 0 0 0 100 ${100 - 90 * result.wheelOfBalance.intellectual / 100} Z`}
                        fill="#FBBF24"
                        className="cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => setExpandedWheel("intellectual")}
                      />
                      <path
                        d={`M 100 100 L ${100 - 90 * result.wheelOfBalance.spiritual / 100} 100 A ${90 * result.wheelOfBalance.spiritual / 100} ${90 * result.wheelOfBalance.spiritual / 100} 0 0 0 100 ${100 + 90 * result.wheelOfBalance.spiritual / 100} Z`}
                        fill="#22D3EE"
                        className="cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => setExpandedWheel("spiritual")}
                      />
                      <path
                        d={`M 100 100 L 100 ${100 + 90 * result.wheelOfBalance.sexual / 100} A ${90 * result.wheelOfBalance.sexual / 100} ${90 * result.wheelOfBalance.sexual / 100} 0 0 0 ${100 + 90 * result.wheelOfBalance.sexual / 100} 100 Z`}
                        fill="#A78BFA"
                        className="cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => setExpandedWheel("sexual")}
                      />
                      <line x1="100" y1="10" x2="100" y2="190" stroke="#0A0E1A" strokeWidth="2" />
                      <line x1="10" y1="100" x2="190" y2="100" stroke="#0A0E1A" strokeWidth="2" />
                    </svg>
                  </div>

                  <div className="flex justify-between mt-2 px-4">
                    <div className="text-left">
                      <span className="px-3 py-1 bg-cyan-500/20 text-cyan-400 text-xs rounded-full">Spiritual</span>
                      <p className="text-cyan-400 text-lg font-bold mt-1">{result.wheelOfBalance.spiritual}%</p>
                    </div>
                    <div className="text-right">
                      <span className="px-3 py-1 bg-purple-500/20 text-purple-400 text-xs rounded-full">Sexual</span>
                      <p className="text-purple-400 text-lg font-bold mt-1">{result.wheelOfBalance.sexual}%</p>
                    </div>
                  </div>
                </div>
              </div>

              {expandedWheel && (() => {
                const attrs = {
                  emotional: { emoji: "😊", label: "Emotional", bgColor: "bg-teal-500/10", borderColor: "border-teal-500/30", textColor: "text-teal-400" },
                  intellectual: { emoji: "🧠", label: "Intellectual", bgColor: "bg-amber-500/10", borderColor: "border-amber-500/30", textColor: "text-amber-400" },
                  spiritual: { emoji: "✨", label: "Spiritual", bgColor: "bg-cyan-500/10", borderColor: "border-cyan-500/30", textColor: "text-cyan-400" },
                  sexual: { emoji: "💕", label: "Sexual", bgColor: "bg-purple-500/10", borderColor: "border-purple-500/30", textColor: "text-purple-400" },
                };
                const attr = attrs[expandedWheel as keyof typeof attrs];
                const value = result.wheelOfBalance[expandedWheel as keyof typeof result.wheelOfBalance];
                const description = result.wheelDescriptions[expandedWheel as keyof typeof result.wheelDescriptions];

                return (
                  <motion.div
                    key={expandedWheel}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`${attr.bgColor} rounded-2xl p-5 border ${attr.borderColor}`}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-2xl">{attr.emoji}</span>
                      <span className={`${attr.textColor} text-lg font-semibold`}>{attr.label}</span>
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-white text-3xl font-bold">{value}%</span>
                      <span className="px-2 py-1 bg-white/10 text-white/60 text-xs rounded-full">
                        {value >= 60 ? "High" : value >= 40 ? "Medium" : "Low"}
                      </span>
                    </div>
                    <p className="text-white/70 text-sm leading-relaxed">{description}</p>
                  </motion.div>
                );
              })()}

              <div>
                <h3 className="text-white text-xl font-bold mb-4">Toxicity score</h3>
                <div className="relative h-32 flex items-center justify-center mb-4">
                  <svg viewBox="0 0 100 60" className="w-64">
                    <defs>
                      <linearGradient id="partnerToxicGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#3B82F6" />
                        <stop offset="33%" stopColor="#8B5CF6" />
                        <stop offset="66%" stopColor="#F97316" />
                        <stop offset="100%" stopColor="#EF4444" />
                      </linearGradient>
                    </defs>
                    <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#1A2535" strokeWidth="8" strokeLinecap="round" />
                    <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="url(#partnerToxicGradient)" strokeWidth="8" strokeLinecap="round" />
                  </svg>
                  <div className="absolute bottom-0 text-center">
                    <span className="text-white text-3xl font-bold">{result.toxicityScore}%</span>
                    <div className="px-3 py-1 bg-white/10 rounded-full mt-1">
                      <span className="text-white/80 text-sm">
                        {result.toxicityScore >= 60 ? "High" : result.toxicityScore >= 40 ? "Medium" : "Low"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex justify-between text-white/50 text-xs px-4">
                  <span>Low</span>
                  <span>High</span>
                </div>
                <p className="text-white/70 text-sm mt-4 leading-relaxed">{result.toxicityDescription}</p>
              </div>

              <div>
                <h3 className="text-white text-xl font-bold mb-4">Compatibility aspects</h3>
                <div className="space-y-4">
                  {Object.entries(result.aspects).map(([key, value]) => (
                    <div key={key}>
                      <button
                        onClick={() => setExpandedAspect(expandedAspect === key ? null : key)}
                        className="w-full"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-white capitalize font-medium">{key}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-white/80">{value}%</span>
                            <ChevronDown className={`w-4 h-4 text-white/50 transition-transform ${expandedAspect === key ? "rotate-180" : ""}`} />
                          </div>
                        </div>
                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${value}%` }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                            className={`h-full ${getAspectColor(value)}`}
                          />
                        </div>
                      </button>
                      <AnimatePresence>
                        {expandedAspect === key && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <p className="text-white/60 text-sm mt-2 pl-2 border-l-2 border-rose-500/50">
                              {result.aspectDescriptions[key as keyof typeof result.aspectDescriptions] !== "Loading..."
                                ? result.aspectDescriptions[key as keyof typeof result.aspectDescriptions]
                                : (value >= 70 ? `Strong ${key} compatibility indicates a harmonious connection in this area.` :
                                   value >= 50 ? `Moderate ${key} compatibility suggests room for growth together.` :
                                   `${key.charAt(0).toUpperCase() + key.slice(1)} may require extra attention and effort from both partners.`)}
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gradient-to-br from-[#1A3040] to-[#1A2535] rounded-2xl p-5 border border-[#2A4555]">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-rose-400 to-cyan-500 flex items-center justify-center text-2xl">
                    👩‍🔮
                  </div>
                  <div className="flex-1">
                    <h4 className="text-white font-semibold">Unsure about something?</h4>
                    <p className="text-white/60 text-sm">Talk to an advisor for a more personalized touch 💕</p>
                  </div>
                </div>
                <Button
                  onClick={() => router.push("/chat")}
                  className="w-full mt-4 bg-rose-500 hover:bg-rose-600 text-white py-3 rounded-full"
                >
                  Ask 🔮
                </Button>
              </div>

              <div>
                <h3 className="text-white text-xl font-bold mb-4">Biggest challenges in a relationship</h3>
                <div className="space-y-4">
                  {result.challenges.map((challenge, index) => (
                    <div key={index} className="bg-[#1A2535] rounded-2xl p-5 border border-[#2A3545]">
                      <h4 className="text-[#D4B896] text-lg font-semibold mb-2">{challenge.title}</h4>
                      <p className="text-white/70 text-sm leading-relaxed mb-3">{challenge.description}</p>
                      <button
                        onClick={() => setExpandedChallenge(expandedChallenge === index ? null : index)}
                        className="flex items-center gap-2 text-rose-400 text-sm"
                      >
                        <Lightbulb className="w-4 h-4" />
                        How you can solve it
                        <ChevronDown className={`w-4 h-4 transition-transform ${expandedChallenge === index ? "rotate-180" : ""}`} />
                      </button>
                      <AnimatePresence>
                        {expandedChallenge === index && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <p className="text-rose-300/80 text-sm mt-3 pl-4 border-l-2 border-rose-500">
                              {challenge.solution}
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              </div>

              <Button
                onClick={() => {
                  setResult(null);
                  setPartnerMoonSign(null);
                  setExpandedAspect(null);
                  setExpandedChallenge(null);
                  setExpandedWheel(null);
                }}
                className="w-full bg-rose-600 hover:bg-rose-700 text-white py-6 rounded-full text-lg font-medium"
              >
                Check Another Match
              </Button>
            </motion.div>
          )}

          <ReportDisclaimer />
        </main>
      </div>
    </div>
  );
}
