"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Briefcase,
  Clock3,
  Heart,
  History,
  KeyRound,
  Leaf,
  Loader2,
  Lock,
  Moon,
  RotateCcw,
  Shield,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import ReportDisclaimer from "@/components/ReportDisclaimer";
import { supabase } from "@/lib/supabase";
import { getBirthDateParts } from "@/lib/birth-details";
import { useOnboardingStore } from "@/lib/onboarding-store";
import { useUserStore } from "@/lib/user-store";

interface PastLifeBirthData {
  day: number;
  month: number;
  year: number;
  time: string | null;
  place: string | null;
  sunSign: string | null;
  moonSign: string | null;
  ascendantSign: string | null;
  knowsBirthTime: boolean;
}

interface PastLifeReport {
  archetype: string;
  archetypeTitle: string;
  pastLifeCount: number;
  era: string;
  region: string;
  soulTheme: string;
  karmicSnapshot?: string;
  overview: string;
  identity: string;
  karmicGift: string;
  karmicWound: string;
  relationshipKarma: string;
  careerKarma: string;
  spiritualLesson: string;
  repeatingPatterns: string[];
  remedies: string[];
  affirmation: string;
  birthData: PastLifeBirthData;
  generatedAt: string;
}

interface PastLifeStatusResponse {
  status: "not_started" | "generating" | "complete" | "failed";
  report?: PastLifeReport | null;
  generated_at?: string | null;
}

const resultSectionVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0 },
};

const monthNames = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const birthFormMonths = [
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

interface PastLifeBirthFormState {
  birthMonth: string;
  birthDay: string;
  birthYear: string;
  birthHour: string;
  birthMinute: string;
  birthPeriod: "AM" | "PM";
  birthPlace: string;
  knowsBirthTime: boolean;
}

const defaultBirthFormState: PastLifeBirthFormState = {
  birthMonth: "January",
  birthDay: "1",
  birthYear: "2000",
  birthHour: "12",
  birthMinute: "00",
  birthPeriod: "AM",
  birthPlace: "",
  knowsBirthTime: true,
};

function normalizeBirthFormState(row: Record<string, any> | null | undefined): PastLifeBirthFormState | null {
  if (!row) return null;
  if (!(row.birth_month || row.birth_day || row.birth_year || row.birth_place)) return null;

  return {
    birthMonth: String(row.birth_month || defaultBirthFormState.birthMonth),
    birthDay: String(row.birth_day || defaultBirthFormState.birthDay),
    birthYear: String(row.birth_year || defaultBirthFormState.birthYear),
    birthHour: String(row.birth_hour || defaultBirthFormState.birthHour),
    birthMinute: String(row.birth_minute || defaultBirthFormState.birthMinute).padStart(2, "0"),
    birthPeriod: row.birth_period === "PM" ? "PM" : "AM",
    birthPlace: String(row.birth_place || ""),
    knowsBirthTime: row.knows_birth_time ?? true,
  };
}

function getPastLifeBirthDateIso(input: Pick<PastLifeBirthFormState, "birthMonth" | "birthDay" | "birthYear">): string | null {
  const parts = getBirthDateParts(input);
  if (!parts) return null;
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function getPastLifeBirthTime24(input: Pick<PastLifeBirthFormState, "birthHour" | "birthMinute" | "birthPeriod" | "knowsBirthTime">): string | null {
  if (input.knowsBirthTime === false) return "12:00";

  const hour = Number(String(input.birthHour || "").trim());
  const minute = Number(String(input.birthMinute || "0").trim());
  const period = String(input.birthPeriod || "").trim().toUpperCase();

  if (!Number.isInteger(hour) || hour < 1 || hour > 12) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  if (period !== "AM" && period !== "PM") return null;

  let normalizedHour = hour;
  if (period === "PM" && normalizedHour !== 12) normalizedHour += 12;
  if (period === "AM" && normalizedHour === 12) normalizedHour = 0;

  return `${String(normalizedHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function isPastLifeBirthFormMissing(details: PastLifeBirthFormState) {
  const birthDate = getPastLifeBirthDateIso({
    birthMonth: details.birthMonth,
    birthDay: details.birthDay,
    birthYear: details.birthYear,
  });
  const birthTime = details.knowsBirthTime
    ? getPastLifeBirthTime24({
        birthHour: details.birthHour,
        birthMinute: details.birthMinute,
        birthPeriod: details.birthPeriod,
        knowsBirthTime: details.knowsBirthTime,
      })
    : "12:00";

  return !birthDate || !details.birthPlace.trim() || (details.knowsBirthTime && !birthTime);
}

function formatBirthData(data: PastLifeBirthData) {
  const month = monthNames[Math.max(0, Math.min(11, data.month - 1))] || String(data.month);
  return `${data.day} ${month} ${data.year}`;
}

function reduceToSingleDigit(value: number) {
  let total = Math.abs(Math.trunc(value));
  while (total > 9) {
    total = String(total)
      .split("")
      .reduce((sum, digit) => sum + Number(digit), 0);
  }
  return total || 1;
}

function getPastLifeCount(report: PastLifeReport) {
  if (report.birthData) {
    const digitSum = `${report.birthData.day}${report.birthData.month}${report.birthData.year}`
      .split("")
      .reduce((sum, digit) => sum + Number(digit), 0);
    return reduceToSingleDigit(digitSum);
  }
  return Math.max(1, Math.min(9, Math.trunc(report.pastLifeCount) || 1));
}

function getKarmicSnapshot(report: PastLifeReport) {
  if (report.karmicSnapshot) return report.karmicSnapshot;
  const fallbackSnapshots: Record<string, string> = {
    Healer: "You may repeat cycles where you rescue first and ask what you need later.",
    Scholar: "You may turn uncertainty into analysis, delaying emotional trust until everything feels provable.",
    Protector: "You may carry responsibility early, staying guarded even when the present is asking you to soften.",
    Artist: "You may translate intense feelings into beauty while hesitating to be fully seen.",
    Wanderer: "You may seek freedom when life becomes still, even when your soul is ready to belong.",
    Mystic: "You may sense hidden truths quickly, then retreat when others cannot meet that depth.",
  };
  return fallbackSnapshots[report.archetype] || `${report.soulTheme} may be showing up through your choices and repeating emotional patterns.`;
}

export default function PastLifePage() {
  const router = useRouter();
  const { unlockedFeatures } = useUserStore();
  const {
    birthMonth: storeBirthMonth,
    birthDay: storeBirthDay,
    birthYear: storeBirthYear,
    birthHour: storeBirthHour,
    birthMinute: storeBirthMinute,
    birthPeriod: storeBirthPeriod,
    birthPlace: storeBirthPlace,
    knowsBirthTime: storeKnowsBirthTime,
    setBirthDate,
    setBirthTime,
    setBirthPlace,
  } = useOnboardingStore();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [savingBirthDetails, setSavingBirthDetails] = useState(false);
  const [report, setReport] = useState<PastLifeReport | null>(null);
  const [error, setError] = useState("");
  const [needsBirthDetails, setNeedsBirthDetails] = useState(false);
  const [userId, setUserId] = useState("");
  const [birthMonth, setBirthMonthState] = useState(defaultBirthFormState.birthMonth);
  const [birthDay, setBirthDayState] = useState(defaultBirthFormState.birthDay);
  const [birthYear, setBirthYearState] = useState(defaultBirthFormState.birthYear);
  const [birthHour, setBirthHourState] = useState(defaultBirthFormState.birthHour);
  const [birthMinute, setBirthMinuteState] = useState(defaultBirthFormState.birthMinute);
  const [birthPeriod, setBirthPeriodState] = useState<"AM" | "PM">(defaultBirthFormState.birthPeriod);
  const [birthPlace, setBirthPlaceState] = useState(defaultBirthFormState.birthPlace);
  const [knowsBirthTime, setKnowsBirthTimeState] = useState(defaultBirthFormState.knowsBirthTime);

  const validBirthDate = getPastLifeBirthDateIso({ birthMonth, birthDay, birthYear });
  const validBirthTime = knowsBirthTime
    ? getPastLifeBirthTime24({ birthHour, birthMinute, birthPeriod, knowsBirthTime })
    : "12:00";
  const isMissingRequiredBirthData =
    !validBirthDate || !birthPlace.trim() || (knowsBirthTime && !validBirthTime);

  const loadStatus = useCallback(async (uid: string) => {
    const response = await fetch("/api/past-life-report/status", {
      cache: "no-store",
      headers: {
        "x-user-id": uid,
      },
    });

    if (response.status === 403) {
      throw new Error("Past Life Report is locked.");
    }

    if (!response.ok) {
      throw new Error("Unable to load your Past Life Report right now.");
    }

    const json = (await response.json()) as PastLifeStatusResponse;
    if (json.status === "complete" && json.report) {
      setReport(json.report);
    }
  }, []);

  const applyBirthFormState = useCallback((details: PastLifeBirthFormState) => {
    setBirthMonthState(details.birthMonth);
    setBirthDayState(details.birthDay);
    setBirthYearState(details.birthYear);
    setBirthHourState(details.birthHour);
    setBirthMinuteState(details.birthMinute);
    setBirthPeriodState(details.birthPeriod);
    setBirthPlaceState(details.birthPlace);
    setKnowsBirthTimeState(details.knowsBirthTime);
    setBirthDate(details.birthMonth, details.birthDay, details.birthYear);
    setBirthTime(details.birthHour, details.birthMinute, details.birthPeriod);
    setBirthPlace(details.birthPlace);
  }, [setBirthDate, setBirthPlace, setBirthTime]);

  const loadUserBirthData = useCallback(async (uid: string): Promise<PastLifeBirthFormState> => {
    let details: PastLifeBirthFormState | null = null;

    try {
      const { data: profileData } = await supabase
        .from("user_profiles")
        .select("birth_month, birth_day, birth_year, birth_hour, birth_minute, birth_period, birth_place, knows_birth_time")
        .eq("id", uid)
        .maybeSingle();

      details = normalizeBirthFormState(profileData);
    } catch (err) {
      console.error("Failed to load past life profile birth data:", err);
    }

    if (!details) {
      try {
        const { data: dbUser } = await supabase
          .from("users")
          .select("birth_month, birth_day, birth_year, birth_hour, birth_minute, birth_period, birth_place")
          .eq("id", uid)
          .maybeSingle();

        details = normalizeBirthFormState(dbUser);
      } catch (err) {
        console.error("Failed to load past life user birth data:", err);
      }
    }

    const fallbackDetails = {
      birthMonth: storeBirthMonth || defaultBirthFormState.birthMonth,
      birthDay: storeBirthDay || defaultBirthFormState.birthDay,
      birthYear: storeBirthYear || defaultBirthFormState.birthYear,
      birthHour: storeBirthHour || defaultBirthFormState.birthHour,
      birthMinute: storeBirthMinute || defaultBirthFormState.birthMinute,
      birthPeriod: storeBirthPeriod || defaultBirthFormState.birthPeriod,
      birthPlace: storeBirthPlace || defaultBirthFormState.birthPlace,
      knowsBirthTime: storeKnowsBirthTime,
    };

    const resolvedDetails = details || fallbackDetails;
    applyBirthFormState(resolvedDetails);
    return resolvedDetails;
  }, [
    applyBirthFormState,
    storeBirthDay,
    storeBirthHour,
    storeBirthMinute,
    storeBirthMonth,
    storeBirthPeriod,
    storeBirthPlace,
    storeBirthYear,
    storeKnowsBirthTime,
  ]);

  useEffect(() => {
    const boot = async () => {
      try {
        setLoading(true);
        setError("");
        setNeedsBirthDetails(false);
        const localUserId = localStorage.getItem("astrorekha_user_id") || "";
        setUserId(localUserId);

        if (!localUserId) {
          setError("Please login again to continue.");
          return;
        }

        const birthDetails = await loadUserBirthData(localUserId);
        if (isPastLifeBirthFormMissing(birthDetails)) {
          setNeedsBirthDetails(true);
          return;
        }

        await loadStatus(localUserId);
      } catch (err: any) {
        setError(err?.message || "Unable to load your Past Life Report.");
      } finally {
        setLoading(false);
      }
    };

    boot();
  }, [loadStatus, loadUserBirthData]);

  const generateReport = async (force = false) => {
    if (!userId || generating) return;

    try {
      setGenerating(true);
      setError("");
      setNeedsBirthDetails(false);
      const response = await fetch("/api/past-life-report/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify({ force }),
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (json?.error === "missing_birth_details") {
          setNeedsBirthDetails(true);
          setError(json?.message || "Please complete your birth details before generating this report.");
          setReport(null);
          return;
        }

        const message =
          json?.message || "Unable to generate your Past Life Report right now.";
        throw new Error(message);
      }

      setReport(json.report || null);
    } catch (err: any) {
      setError(err?.message || "Unable to generate your Past Life Report.");
    } finally {
      setGenerating(false);
      setLoading(false);
    }
  };

  const handleBirthDateChange = (month: string, day: string, year: string) => {
    setBirthMonthState(month);
    setBirthDayState(day);
    setBirthYearState(year);
    setBirthDate(month, day, year);
  };

  const handleBirthTimeChange = (hour: string, minute: string, period: "AM" | "PM") => {
    setBirthHourState(hour);
    setBirthMinuteState(minute);
    setBirthPeriodState(period);
    setBirthTime(hour, minute, period);
  };

  const handleBirthPlaceChange = (place: string) => {
    setBirthPlaceState(place);
    setBirthPlace(place);
  };

  const saveBirthDetailsAndGenerate = async () => {
    if (!userId || savingBirthDetails || generating) return;

    if (isMissingRequiredBirthData) {
      setNeedsBirthDetails(true);
      setError("Please complete your birth date, birth time, and birth place before generating this report.");
      return;
    }

    try {
      setSavingBirthDetails(true);
      setError("");
      const now = new Date().toISOString();
      const profileUpdateData = {
        birth_month: birthMonth,
        birth_day: birthDay,
        birth_year: birthYear,
        birth_hour: birthHour,
        birth_minute: birthMinute,
        birth_period: birthPeriod,
        birth_place: birthPlace.trim(),
        knows_birth_time: knowsBirthTime,
        updated_at: now,
      };
      const userUpdateData = {
        birth_month: birthMonth,
        birth_day: birthDay,
        birth_year: birthYear,
        birth_hour: birthHour,
        birth_minute: birthMinute,
        birth_period: birthPeriod,
        birth_place: birthPlace.trim(),
        updated_at: now,
      };

      await Promise.all([
        supabase.from("user_profiles").upsert({ id: userId, ...profileUpdateData }, { onConflict: "id" }),
        supabase.from("users").update(userUpdateData).eq("id", userId),
      ]);

      setNeedsBirthDetails(false);
      await generateReport(false);
    } catch (err) {
      console.error("Failed to save past life birth details:", err);
      setError("Unable to save your birth details. Please try again.");
    } finally {
      setSavingBirthDetails(false);
    }
  };

  if (!unlockedFeatures.pastLifeReport) {
    return (
      <div className="min-h-screen bg-[#0A0E1A] px-4 py-5">
        <div className="mx-auto w-full max-w-md">
          <button
            onClick={() => router.push("/reports")}
            className="mb-4 inline-flex items-center gap-2 text-sm text-white/80 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Reports
          </button>

          <div className="rounded-3xl border border-primary/20 bg-[#171320] p-5 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <h1 className="mt-4 text-xl font-semibold text-white">Past Life Report is locked</h1>
            <p className="mt-2 text-sm text-white/60">Unlock it from Reports to reveal your karmic pattern.</p>
            <button
              onClick={() => router.push("/reports")}
              className="mt-5 w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white"
            >
              Back to Reports
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <div className="h-screen w-full max-w-md overflow-y-auto bg-[#0A0E1A] shadow-2xl shadow-black/50">
        <div className="sticky top-0 z-40 border-b border-white/10 bg-[#0A0E1A]/95 backdrop-blur-sm">
          <div className="flex items-center gap-4 px-4 py-3">
            <button onClick={() => router.push("/reports")} className="flex h-10 w-10 items-center justify-center">
              <ArrowLeft className="h-5 w-5 text-white" />
            </button>
            <div className="flex-1 text-center pr-10">
              <h1 className="text-lg font-semibold text-white">Past Life Report</h1>
            </div>
          </div>
        </div>

        <div className="px-4 py-5">
          {loading ? (
            <div className="flex min-h-[70vh] items-center justify-center">
              <div className="text-center">
                <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
                <p className="mt-4 text-sm text-white/60">Reading your karmic imprint...</p>
              </div>
            </div>
          ) : null}

          {!loading && needsBirthDetails && !report ? (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="bg-primary/10 border border-primary/30 rounded-2xl p-6 text-center">
                <h2 className="text-white font-semibold text-lg mb-2">Birth Details Required</h2>
                <p className="text-white/60 text-sm">To generate your Past Life Report, we need your birth details.</p>
              </div>

              <div className="bg-[#1A1F2E] rounded-2xl p-4 border border-white/10 space-y-4">
                <div>
                  <label className="text-white/60 text-sm block mb-2">Birth Date</label>
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      value={birthMonth}
                      onChange={(e) => handleBirthDateChange(e.target.value, birthDay, birthYear)}
                      className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm"
                    >
                      {birthFormMonths.map((month) => (
                        <option key={month} value={month}>{month}</option>
                      ))}
                    </select>
                    <select
                      value={birthDay}
                      onChange={(e) => handleBirthDateChange(birthMonth, e.target.value, birthYear)}
                      className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm"
                    >
                      {Array.from({ length: 31 }, (_, index) => String(index + 1)).map((day) => (
                        <option key={day} value={day}>{day}</option>
                      ))}
                    </select>
                    <select
                      value={birthYear}
                      onChange={(e) => handleBirthDateChange(birthMonth, birthDay, e.target.value)}
                      className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm"
                    >
                      {Array.from({ length: 100 }, (_, index) => String(2024 - index)).map((year) => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-white/60 text-sm block mb-2">Birth Time</label>
                  <div className="grid grid-cols-3 gap-2">
                    <select
                      value={birthHour}
                      onChange={(e) => handleBirthTimeChange(e.target.value, birthMinute, birthPeriod)}
                      className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm"
                    >
                      {Array.from({ length: 12 }, (_, index) => String(index + 1)).map((hour) => (
                        <option key={hour} value={hour}>{hour}</option>
                      ))}
                    </select>
                    <select
                      value={birthMinute}
                      onChange={(e) => handleBirthTimeChange(birthHour, e.target.value, birthPeriod)}
                      className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm"
                    >
                      {["00", "15", "30", "45"].map((minute) => (
                        <option key={minute} value={minute}>{minute}</option>
                      ))}
                    </select>
                    <select
                      value={birthPeriod}
                      onChange={(e) => handleBirthTimeChange(birthHour, birthMinute, e.target.value as "AM" | "PM")}
                      className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm"
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-white/60 text-sm block mb-2">Birth Place</label>
                  <input
                    type="text"
                    value={birthPlace}
                    onChange={(e) => handleBirthPlaceChange(e.target.value)}
                    placeholder="City, Country"
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm placeholder:text-white/40"
                  />
                </div>

                {error ? <p className="text-sm text-red-300">{error}</p> : null}

                <Button
                  onClick={saveBirthDetailsAndGenerate}
                  disabled={savingBirthDetails || generating}
                  className="w-full bg-gradient-to-r from-primary to-purple-600"
                >
                  {savingBirthDetails || generating ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </span>
                  ) : (
                    "Generate My Past Life Report"
                  )}
                </Button>
              </div>
            </motion.div>
          ) : null}

          {!loading && error && !needsBirthDetails && !report ? (
            <div className="rounded-3xl border border-red-400/30 bg-red-500/10 p-5 text-center">
              <p className="text-sm text-red-200">{error}</p>
              <button
                onClick={() => router.push("/reports")}
                className="mt-4 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white"
              >
                Back to Reports
              </button>
            </div>
          ) : null}

          {!loading && !needsBirthDetails && !report && !error ? (
            <div className="space-y-4">
              <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-[#171320] p-6">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(124,58,237,0.28),transparent_38%),radial-gradient(circle_at_bottom_left,rgba(236,72,153,0.18),transparent_45%)]" />
                <div className="relative text-center">
                  <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[1.6rem] border border-primary/25 bg-primary/10 shadow-lg shadow-primary/20">
                    <History className="h-9 w-9 text-primary" />
                  </div>
                  <p className="mt-5 text-xs uppercase tracking-[0.24em] text-primary/70">Purva Janam</p>
                  <h2 className="mt-2 text-3xl font-bold leading-tight text-white">Reveal Your Past Life</h2>
                  <p className="mt-3 text-sm leading-6 text-white/65">
                    Your birth details are used to create a symbolic karmic report about the patterns your soul may be carrying.
                  </p>
                  <button
                    onClick={() => generateReport(false)}
                    disabled={generating}
                    className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-purple-600 text-sm font-bold text-white shadow-lg shadow-primary/20 disabled:opacity-60"
                  >
                    {generating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                    Generate Report
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {!loading && report ? (
            <PastLifeResultView report={report} onRegenerate={() => generateReport(true)} regenerating={generating} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PastLifeResultView({
  report,
  onRegenerate,
  regenerating,
}: {
  report: PastLifeReport;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"soul" | "karma" | "life" | "remedy">("soul");
  const karmicSnapshot = getKarmicSnapshot(report);

  const tabButton = (
    tab: "soul" | "karma" | "life" | "remedy",
    label: string,
    Icon: typeof Sparkles
  ) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`flex flex-1 flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] transition ${
        activeTab === tab
          ? "bg-primary text-white shadow-lg shadow-primary/20"
          : "text-white/55 hover:bg-white/5 hover:text-white"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );

  const renderTabContent = () => {
    if (activeTab === "soul") {
      return (
        <>
          <TextReportCard title="Past Life Identity" icon={<History className="h-4 w-4 text-primary" />} text={report.identity} tint="primary" />
          <TextReportCard title="Soul Theme" icon={<KeyRound className="h-4 w-4 text-fuchsia-200" />} text={report.soulTheme} tint="fuchsia" />
        </>
      );
    }

    if (activeTab === "karma") {
      return (
        <>
          <TextReportCard title="Karmic Gift" icon={<Sparkles className="h-4 w-4 text-emerald-200" />} text={report.karmicGift} tint="emerald" />
          <TextReportCard title="Karmic Wound" icon={<Shield className="h-4 w-4 text-rose-200" />} text={report.karmicWound} tint="rose" />
          <PatternBlock title="Repeating Patterns" items={report.repeatingPatterns} icon={<Moon className="h-4 w-4 text-violet-200" />} />
        </>
      );
    }

    if (activeTab === "life") {
      return (
        <>
          <TextReportCard title="Relationship Karma" icon={<Heart className="h-4 w-4 text-pink-200" />} text={report.relationshipKarma} tint="pink" />
          <TextReportCard title="Career Karma" icon={<Briefcase className="h-4 w-4 text-cyan-200" />} text={report.careerKarma} tint="cyan" />
          <TextReportCard title="Spiritual Lesson" icon={<Leaf className="h-4 w-4 text-emerald-200" />} text={report.spiritualLesson} tint="emerald" />
        </>
      );
    }

    return (
      <>
        <PatternBlock title="Remedies and Actions" items={report.remedies} icon={<Leaf className="h-4 w-4 text-emerald-200" />} />
        <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-[#211329] p-5 text-center">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(124,58,237,0.26),transparent_40%),linear-gradient(135deg,rgba(168,85,247,0.24),rgba(236,72,153,0.12))]" />
          <div className="relative">
            <p className="text-xs uppercase tracking-wide text-primary/70">Affirmation</p>
            <p className="mt-3 text-lg font-bold leading-7 text-white">"{report.affirmation}"</p>
          </div>
        </div>
      </>
    );
  };

  return (
    <motion.div initial="hidden" animate="visible" className="space-y-4">
      <motion.div
        variants={resultSectionVariants}
        className="overflow-hidden rounded-3xl border border-primary/20 bg-[#171320] shadow-2xl shadow-black/25"
      >
        <div className="relative px-5 py-7">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.36),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(236,72,153,0.24),transparent_45%),linear-gradient(135deg,#261225,#0A0E1A)]" />
          <div className="relative">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="inline-flex rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary">
                {report.archetype}
              </div>
              <button
                onClick={onRegenerate}
                disabled={regenerating}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 disabled:opacity-40"
                aria-label="Regenerate report"
              >
                {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              </button>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-[2rem] border border-primary/30 bg-black/20 shadow-2xl shadow-black/30">
                <Sparkles className="h-11 w-11 text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="text-3xl font-bold leading-tight text-white">{report.archetypeTitle}</h2>
                <p className="mt-2 text-sm leading-6 text-white/78">{report.overview}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-5">
          <div className="mb-5 grid grid-cols-2 gap-2">
            <MiniStat label="Past Lives" value={String(getPastLifeCount(report))} icon={<History className="h-4 w-4 text-primary" />} />
            <MiniStat label="Birth Date" value={formatBirthData(report.birthData)} icon={<Clock3 className="h-4 w-4 text-fuchsia-200" />} />
            <MiniStat label="Era" value={report.era} icon={<Moon className="h-4 w-4 text-violet-200" />} />
            <MiniStat label="Region" value={report.region} icon={<Leaf className="h-4 w-4 text-emerald-200" />} />
          </div>

          <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4">
            <h3 className="flex items-center gap-2 text-lg font-bold text-white">
              <KeyRound className="h-5 w-5 text-primary" />
              Karmic Snapshot
            </h3>
            <p className="mt-3 text-sm leading-7 text-white/75">{karmicSnapshot}</p>
          </div>
        </div>
      </motion.div>

      <div className="flex gap-1 rounded-2xl border border-white/10 bg-white/5 p-1">
        {tabButton("soul", "Soul", History)}
        {tabButton("karma", "Karma", Moon)}
        {tabButton("life", "Life", Heart)}
        {tabButton("remedy", "Remedy", Leaf)}
      </div>

      <div key={activeTab} className="space-y-4">
        {renderTabContent()}
      </div>

      <ReportDisclaimer text="This AI-assisted Past Life Report uses birth details and symbolic astrological patterns for spiritual self-reflection. It is not a factual historical record or medical, psychological, legal, financial, or professional advice." />
    </motion.div>
  );
}

function MiniStat({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="mb-2">{icon}</div>
      <p className="text-[11px] text-white/45">{label}</p>
      <p className="mt-0.5 line-clamp-2 text-sm font-semibold capitalize text-white">{value}</p>
    </div>
  );
}

function TextReportCard({
  title,
  text,
  icon,
  tint,
}: {
  title: string;
  text?: string;
  icon: ReactNode;
  tint: "primary" | "fuchsia" | "emerald" | "rose" | "pink" | "cyan";
}) {
  const tintClass = {
    primary: "border-primary/20 bg-primary/10",
    fuchsia: "border-fuchsia-300/20 bg-fuchsia-400/10",
    emerald: "border-emerald-300/20 bg-emerald-400/10",
    rose: "border-rose-300/20 bg-rose-400/10",
    pink: "border-pink-300/20 bg-pink-400/10",
    cyan: "border-cyan-300/20 bg-cyan-400/10",
  }[tint];

  return (
    <div className={`rounded-3xl border p-5 ${tintClass}`}>
      <h3 className="flex items-center gap-2 text-base font-semibold text-white">
        {icon}
        {title}
      </h3>
      <p className="mt-3 text-sm leading-7 text-white/72">{text}</p>
    </div>
  );
}

function PatternBlock({ title, items, icon }: { title: string; items: string[]; icon: ReactNode }) {
  return (
    <div className="rounded-3xl border border-violet-300/20 bg-violet-400/10 p-5">
      <h3 className="flex items-center gap-2 text-base font-semibold text-white">
        {icon}
        {title}
      </h3>
      <div className="mt-3 space-y-3">
        {items.map((item, index) => (
          <div key={`${title}-${index}`} className="flex gap-3">
            <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
            <p className="text-sm leading-6 text-white/70">{item}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
