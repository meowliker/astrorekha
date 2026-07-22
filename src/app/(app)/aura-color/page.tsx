"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Activity,
  Briefcase,
  Check,
  ChevronLeft,
  Compass,
  Heart,
  Leaf,
  Loader2,
  Lock,
  Moon,
  Shield,
  Sparkles,
} from "lucide-react";
import ReportDisclaimer from "@/components/ReportDisclaimer";
import {
  AURA_COLORS,
  AURA_QUESTIONS,
  buildAuraReportTemplate,
  serializeAuraAnswers,
  type AuraColor,
  type AuraReportResult,
} from "@/lib/aura-color-report";
import { useUserStore } from "@/lib/user-store";

interface AuraStatusResponse {
  status: "not_started" | "complete";
  result?: AuraReportResult | null;
}

const resultSectionVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

const AURA_GRADIENT_COLORS: Record<AuraColor, [string, string, string]> = {
  Red: ["#fb365c", "#ef4444", "#f97316"],
  Orange: ["#f97316", "#f59e0b", "#ec4899"],
  Yellow: ["#fde047", "#f59e0b", "#a3e635"],
  Green: ["#34d399", "#22c55e", "#2dd4bf"],
  Blue: ["#22d3ee", "#0ea5e9", "#2563eb"],
  Indigo: ["#1d4ed8", "#4f46e5", "#7c3aed"],
  Violet: ["#8b5cf6", "#d946ef", "#7e22ce"],
  White: ["#f8fafc", "#cffafe", "#ddd6fe"],
};

function getAuraGradient(primaryColor: AuraColor, secondaryColor?: AuraColor | null) {
  const primaryColors = AURA_GRADIENT_COLORS[primaryColor];
  if (!secondaryColor || secondaryColor === primaryColor) {
    return `linear-gradient(135deg, ${primaryColors[0]}, ${primaryColors[1]}, ${primaryColors[2]})`;
  }

  const secondaryColors = AURA_GRADIENT_COLORS[secondaryColor];
  return `linear-gradient(135deg, ${primaryColors[0]} 0%, ${primaryColors[1]} 38%, ${secondaryColors[1]} 68%, ${secondaryColors[2]} 100%)`;
}

function normalizeAuraReportResult(report: AuraReportResult): AuraReportResult {
  if (!report.primaryColor) return report;
  return {
    ...buildAuraReportTemplate(report.primaryColor, report.secondaryColor || null),
    ...report,
  };
}

export default function AuraColorPage() {
  const router = useRouter();
  const { unlockedFeatures } = useUserStore();
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<AuraReportResult | null>(null);
  const [error, setError] = useState("");
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userId, setUserId] = useState("");

  const currentQuestion = AURA_QUESTIONS[step];
  const selectedOptionId = currentQuestion ? answers[currentQuestion.id] : "";
  const answeredCount = useMemo(
    () => AURA_QUESTIONS.filter((question) => Boolean(answers[question.id])).length,
    [answers]
  );
  const progress = Math.round((answeredCount / AURA_QUESTIONS.length) * 100);

  const fetchStatus = useCallback(async (uid: string) => {
    const response = await fetch(`/api/aura-color-report/status?userId=${encodeURIComponent(uid)}`, {
      cache: "no-store",
    });

    if (response.status === 403) {
      throw new Error("Aura Color Quiz is locked.");
    }

    if (!response.ok) {
      throw new Error("Unable to load your aura color quiz right now.");
    }

    const json = (await response.json()) as AuraStatusResponse;
    if (json.status === "complete" && json.result) {
      setResult(normalizeAuraReportResult(json.result));
    }
  }, []);

  useEffect(() => {
    const boot = async () => {
      try {
        setLoading(true);
        setError("");
        const localUserId = localStorage.getItem("astrorekha_user_id") || "";
        setUserId(localUserId);

        if (!localUserId) {
          setError("Please login again to continue.");
          return;
        }

        await fetchStatus(localUserId);
      } catch (err: any) {
        setError(err?.message || "Unable to load your aura color quiz.");
      } finally {
        setLoading(false);
      }
    };

    boot();
  }, [fetchStatus]);

  const submitQuiz = useCallback(async (nextAnswers: Record<string, string> = answers) => {
    if (!userId || AURA_QUESTIONS.some((question) => !nextAnswers[question.id])) return;

    try {
      setIsSubmitting(true);
      setError("");
      const response = await fetch("/api/aura-color-report/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          answers: serializeAuraAnswers(nextAnswers),
        }),
      });

      const json = await response.json().catch(() => ({}));
      if (response.status === 409 && json?.result) {
        setResult(normalizeAuraReportResult(json.result));
        return;
      }

      if (!response.ok) {
        throw new Error(json?.message || "Unable to save your aura color quiz.");
      }

      setResult(json.result ? normalizeAuraReportResult(json.result) : null);
    } catch (err: any) {
      setError(err?.message || "Unable to save your aura color quiz.");
    } finally {
      setIsSubmitting(false);
      setIsAdvancing(false);
    }
  }, [answers, userId]);

  const selectOption = (optionId: string) => {
    if (!currentQuestion) return;
    if (isAdvancing || isSubmitting) return;

    const nextAnswers = {
      ...answers,
      [currentQuestion.id]: optionId,
    };

    setIsAdvancing(true);
    setAnswers(nextAnswers);

    window.setTimeout(() => {
      if (step === AURA_QUESTIONS.length - 1) {
        submitQuiz(nextAnswers);
        return;
      }

      setStep((value) => Math.min(AURA_QUESTIONS.length - 1, value + 1));
      setIsAdvancing(false);
    }, 180);
  };

  const goBack = () => {
    setIsAdvancing(false);
    setAnswers((prev) => ({
      ...prev,
      [AURA_QUESTIONS[Math.max(0, step - 1)].id]: "",
    }));
    setStep((value) => Math.max(0, value - 1));
  };

  if (!unlockedFeatures.auraColorReport) {
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

          <div className="rounded-3xl border border-primary/20 bg-[#1A2235] p-5 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <h1 className="mt-4 text-xl font-semibold text-white">Aura Color Quiz is locked</h1>
            <p className="mt-2 text-sm text-white/60">Unlock it from Reports to access your aura quiz.</p>
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
              <h1 className="text-lg font-semibold text-white">Aura Color Quiz</h1>
            </div>
          </div>
        </div>

        <div className="px-4 py-5">
          {loading ? (
            <div className="flex min-h-[70vh] items-center justify-center">
              <div className="text-center">
                <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
                <p className="mt-4 text-sm text-white/60">Opening your aura quiz...</p>
              </div>
            </div>
          ) : null}

          {!loading && error && !result ? (
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

          {!loading && !result && currentQuestion && !error ? (
            <div>
              <div className="rounded-3xl border border-primary/20 bg-[#1A2235] p-4">
                <div className="mb-4">
                  <div className="flex items-center justify-between text-xs text-white/50">
                    <span>{answeredCount}/{AURA_QUESTIONS.length} answered</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-primary via-fuchsia-500 to-cyan-400"
                      initial={false}
                      animate={{ width: `${progress}%` }}
                      transition={{ type: "spring", stiffness: 130, damping: 22 }}
                    />
                  </div>
                </div>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentQuestion.id}
                    initial={{ opacity: 0, x: 18 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -18 }}
                    transition={{ duration: 0.22 }}
                  >
                    <div className="mb-5 flex items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-500/25 via-fuchsia-500/25 to-amber-300/25">
                        <Sparkles className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-xs uppercase text-white/45">Energy check</p>
                        <h2 className="text-xl font-semibold leading-tight text-white">{currentQuestion.question}</h2>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {currentQuestion.options.map((option) => {
                        const isSelected = selectedOptionId === option.id;
                        return (
                          <button
                            key={option.id}
                            onClick={() => selectOption(option.id)}
                            disabled={isAdvancing || isSubmitting}
                            className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                              isSelected
                                ? "border-primary bg-primary/15 text-white shadow-lg shadow-primary/10"
                                : "border-white/10 bg-black/20 text-white/75 hover:border-primary/40 hover:bg-white/5"
                            } disabled:cursor-default`}
                          >
                            <div className="flex items-start gap-3">
                              <span
                                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                                  isSelected ? "border-primary bg-primary text-white" : "border-white/20 text-white/45"
                                }`}
                              >
                                {isSelected ? <Check className="h-3.5 w-3.5" /> : option.id.toUpperCase()}
                              </span>
                              <span className="text-sm font-medium leading-6">{option.label}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                </AnimatePresence>

                {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

	                <div className="mt-6 flex gap-3">
	                  <button
	                    onClick={goBack}
	                    disabled={step === 0 || isSubmitting}
	                    className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 text-white disabled:opacity-35"
	                    aria-label="Previous question"
	                  >
	                    <ChevronLeft className="h-5 w-5" />
	                    Back
	                  </button>
	                </div>
              </div>

              <p className="mt-4 text-center text-xs leading-5 text-white/45">
                This quiz can be completed once. Your saved aura color will stay available here.
              </p>
            </div>
          ) : null}

          {!loading && result ? <AuraResultView result={result} /> : null}
        </div>
      </div>
    </div>
  );
}

function AuraResultView({ result }: { result: AuraReportResult }) {
  const completeResult = normalizeAuraReportResult(result);
  const primary = AURA_COLORS[completeResult.primaryColor];
  const secondary = completeResult.secondaryColor ? AURA_COLORS[completeResult.secondaryColor] : null;
  const auraGradient = getAuraGradient(completeResult.primaryColor, completeResult.secondaryColor);
  const [activeTab, setActiveTab] = useState<"essence" | "energy" | "path" | "guidance">("essence");

  const tabButton = (
    tab: "essence" | "energy" | "path" | "guidance",
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
    if (activeTab === "essence") {
      return (
        <>
          <QualityGrid
            title="Core Qualities"
            items={completeResult.coreQualities}
          />
          <ReportBlock
            title="Natural Strengths"
            icon={<Shield className="h-4 w-4 text-emerald-300" />}
            items={completeResult.strengths}
            color="emerald"
          />
        </>
      );
    }

    if (activeTab === "energy") {
      return (
        <>
          <TextReportCard
            title="Emotional Pattern"
            icon={<Activity className="h-4 w-4 text-cyan-300" />}
            text={completeResult.emotionalPattern}
            tint="cyan"
          />
          <TextReportCard
            title="Shadow Pattern"
            icon={<Moon className="h-4 w-4 text-amber-300" />}
            text={completeResult.shadowPattern}
            tint="amber"
          />
          <ReportBlock
            title="Growth Areas"
            icon={<Shield className="h-4 w-4 text-amber-300" />}
            items={completeResult.growthAreas}
            color="amber"
          />
        </>
      );
    }

    if (activeTab === "path") {
      return (
        <>
          <TextReportCard
            title="Relationships"
            icon={<Heart className="h-4 w-4 text-pink-300" />}
            text={completeResult.relationships}
            tint="pink"
          />
          <TextReportCard
            title="Work and Purpose"
            icon={<Briefcase className="h-4 w-4 text-violet-300" />}
            text={completeResult.workAndPurpose}
            tint="violet"
          />
          <TextReportCard
            title="Spiritual Lesson"
            icon={<Compass className="h-4 w-4 text-primary" />}
            text={completeResult.spiritualLesson}
            tint="primary"
          />
        </>
      );
    }

    return (
      <>
        <ReportBlock
          title="Energy Care"
          icon={<Leaf className="h-4 w-4 text-emerald-300" />}
          items={completeResult.energyCare}
          color="emerald"
        />
        <div
          className="relative overflow-hidden rounded-3xl border border-fuchsia-300/25 bg-[#24112f] p-5 text-center shadow-lg shadow-fuchsia-950/30"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(236,72,153,0.32),transparent_42%),linear-gradient(135deg,rgba(168,85,247,0.24),rgba(236,72,153,0.12),rgba(6,182,212,0.08))]" />
          <div className="relative">
            <p className="text-xs uppercase tracking-wide text-fuchsia-200/70">Affirmation</p>
            <p className="mt-3 text-lg font-bold leading-7 text-pink-50">
              "{completeResult.affirmation}"
            </p>
          </div>
        </div>
      </>
    );
  };

  return (
    <motion.div initial="hidden" animate="visible" className="space-y-4">
      <motion.div
        variants={resultSectionVariants}
        className="overflow-hidden rounded-3xl border border-primary/25 bg-[#1A2235] shadow-2xl shadow-black/25"
      >
        <div className="relative px-5 py-7" style={{ backgroundImage: auraGradient }}>
          <div className="absolute inset-0 bg-black/25" />
          <div className="relative flex items-center gap-4">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-[2rem] border border-white/35 bg-white/15 shadow-2xl shadow-black/30 backdrop-blur-sm">
              <div
                className="h-16 w-16 rounded-[1.4rem] ring-8 ring-white/10"
                style={{ backgroundImage: auraGradient }}
              />
            </div>
            <div className="min-w-0">
              {completeResult.auraArchetype ? (
                <div className="inline-flex rounded-full border border-white/25 bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white shadow-lg shadow-black/15 backdrop-blur-sm">
                  {completeResult.auraArchetype}
                </div>
              ) : null}
              <h2 className="mt-1 text-3xl font-bold leading-tight text-white">{completeResult.colorName}</h2>
              <p className="mt-2 text-sm leading-6 text-white/80">{completeResult.energySignature}</p>
            </div>
          </div>
        </div>

        <div className="p-5">
          <div className="mb-5 grid grid-cols-2 gap-2">
            <MiniStat label="Primary" value={completeResult.primaryColor} icon={<Sparkles className="h-4 w-4 text-primary" />} />
            <MiniStat
              label="Tone"
              value={secondary ? secondary.color : "Focused"}
              icon={<Moon className="h-4 w-4 text-violet-300" />}
            />
          </div>

          {secondary ? (
            <div className="mb-5 rounded-2xl border border-white/10 bg-gradient-to-br from-white/10 to-white/[0.03] p-4">
              <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/55">
                <Moon className="h-4 w-4 text-violet-300" />
                Secondary Influence
              </p>
              <p className="mt-2 text-sm leading-6 text-white/75">
                Your {secondary.title} adds {secondary.shortMeaning.toLowerCase()} to your main aura pattern.
              </p>
            </div>
          ) : null}

          <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/15 to-purple-600/10 p-4">
            <h3 className="flex items-center gap-2 text-lg font-bold text-white">
              <Sparkles className="h-5 w-5 text-primary" />
              Aura Insight
            </h3>
            <p className="mt-3 text-sm leading-7 text-white/78">{completeResult.overview}</p>
          </div>
        </div>
      </motion.div>

      <div className="flex gap-1 rounded-2xl border border-white/10 bg-white/5 p-1">
        {tabButton("essence", "Essence", Sparkles)}
        {tabButton("energy", "Energy", Activity)}
        {tabButton("path", "Path", Compass)}
        {tabButton("guidance", "Care", Leaf)}
      </div>

      <div
        key={activeTab}
        className="space-y-4"
      >
        {renderTabContent()}
      </div>

      <ReportDisclaimer text="This aura color quiz is for entertainment only and is not medical, psychological, or professional advice." />
    </motion.div>
  );
}

function MiniStat({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="mb-2">{icon}</div>
      <p className="text-[11px] text-white/45">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold text-white">{value}</p>
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
  tint: "primary" | "cyan" | "amber" | "pink" | "violet";
}) {
  const tintClass = {
    primary: "border-primary/20 bg-primary/10",
    cyan: "border-cyan-400/20 bg-cyan-400/10",
    amber: "border-amber-400/20 bg-amber-400/10",
    pink: "border-pink-400/20 bg-pink-400/10",
    violet: "border-violet-400/20 bg-violet-400/10",
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

function QualityGrid({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-3xl border border-primary/20 bg-primary/10 p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="text-base font-semibold text-white">{title}</h3>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {items.map((item, index) => (
          <div
            key={`${title}-${item}-${index}`}
            className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-black/20 px-3 py-2"
          >
            <span className="h-2 w-2 rounded-full bg-primary" />
            <span className="text-sm font-medium capitalize text-white/78">{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReportBlock({
  title,
  items,
  icon,
  color,
}: {
  title: string;
  items: string[];
  icon: ReactNode;
  color: "primary" | "emerald" | "amber";
}) {
  const styles = {
    primary: {
      shell: "border-primary/20 bg-primary/10",
      dot: "bg-primary",
    },
    emerald: {
      shell: "border-emerald-400/20 bg-emerald-400/10",
      dot: "bg-emerald-300",
    },
    amber: {
      shell: "border-amber-400/20 bg-amber-400/10",
      dot: "bg-amber-300",
    },
  }[color];

  return (
    <div className={`rounded-3xl border p-5 ${styles.shell}`}>
      <h3 className="flex items-center gap-2 text-base font-semibold text-white">
        {icon}
        {title}
      </h3>
      <div className="mt-3 space-y-3">
        {items.map((item, index) => (
          <div key={`${title}-${index}`} className="flex gap-3">
            <div className={`mt-2 h-2 w-2 shrink-0 rounded-full ${styles.dot}`} />
            <p className="text-sm leading-6 text-white/70">{item}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
