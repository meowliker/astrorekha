"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUserStore } from "@/lib/user-store";
import ReportDisclaimer from "@/components/ReportDisclaimer";
import {
  DEFAULT_LAYOUT_B_CONFIG,
  getActiveSketchQuestions,
  normalizeLayoutBConfig,
  type LayoutBFunnelConfig,
  type SketchQuestion,
} from "@/lib/layout-b-funnel";

interface SketchStatus {
  status: "not_started" | "pending" | "generating" | "complete" | "failed";
  sketch_image_url?: string | null;
  question_answers?: Record<string, string> | null;
  generation_count?: number;
  maxSketchPerUser?: number;
  remaining?: number;
}

const ANSWERS_STORAGE_KEY = "astrorekha_soulmate_answers";
const MULTI_SELECT_QUESTION_IDS = new Set(["main_worry", "future_goal"]);

function parseMultiAnswer(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export default function SoulmateSketchPage() {
  const router = useRouter();
  const { unlockedFeatures } = useUserStore();
  const [config, setConfig] = useState<LayoutBFunnelConfig>(DEFAULT_LAYOUT_B_CONFIG);
  const [status, setStatus] = useState<SketchStatus | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState("");
  const [hasSyncedStepFromSavedAnswers, setHasSyncedStepFromSavedAnswers] = useState(false);

  const questions = useMemo(
    () => getActiveSketchQuestions(config).filter((question) => question.id !== "future_goal"),
    [config]
  );
  const activeQuestion: SketchQuestion | null = questions[currentStep] || null;
  const isMultiSelectQuestion = !!activeQuestion && MULTI_SELECT_QUESTION_IDS.has(activeQuestion.id);

  const fetchStatus = useCallback(async () => {
    if (!userId) return;
    const response = await fetch(`/api/soulmate-sketch/status?userId=${encodeURIComponent(userId)}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error("Unable to load sketch status");
    }
    const json = await response.json();
    setStatus(json);
    if (json?.question_answers && typeof json.question_answers === "object") {
      setAnswers((prev) => ({ ...prev, ...json.question_answers }));
    }
  }, [userId]);

  useEffect(() => {
    const boot = async () => {
      try {
        setLoading(true);
        const localUserId = localStorage.getItem("astrorekha_user_id") || "";
        setUserId(localUserId);

        const savedAnswers = localStorage.getItem(ANSWERS_STORAGE_KEY);
        if (savedAnswers) {
          setAnswers(JSON.parse(savedAnswers));
        }

        const cfgResponse = await fetch("/api/ab-test/layout-config", { cache: "no-store" });
        const cfgJson = await cfgResponse.json().catch(() => ({}));
        setConfig(normalizeLayoutBConfig(cfgJson?.config || DEFAULT_LAYOUT_B_CONFIG));

        if (localUserId) {
          const response = await fetch(`/api/soulmate-sketch/status?userId=${encodeURIComponent(localUserId)}`, {
            cache: "no-store",
          });
          if (response.ok) {
            const json = await response.json();
            setStatus(json);
            if (json?.question_answers && typeof json.question_answers === "object") {
              setAnswers((prev) => ({ ...prev, ...json.question_answers }));
            }
          }
        }
      } catch (bootError) {
        console.error("Soulmate sketch boot error:", bootError);
        setError("Unable to load soulmate sketch right now.");
      } finally {
        setLoading(false);
      }
    };
    boot();
  }, []);

  useEffect(() => {
    localStorage.setItem(ANSWERS_STORAGE_KEY, JSON.stringify(answers));
  }, [answers]);

  useEffect(() => {
    if (loading || hasSyncedStepFromSavedAnswers || questions.length === 0) return;

    const firstUnansweredIndex = questions.findIndex((question) => {
      const value = answers[question.id];
      if (!value) return true;
      if (MULTI_SELECT_QUESTION_IDS.has(question.id)) {
        return parseMultiAnswer(value).length === 0;
      }
      return value.trim().length === 0;
    });

    setCurrentStep(firstUnansweredIndex === -1 ? questions.length : firstUnansweredIndex);
    setHasSyncedStepFromSavedAnswers(true);
  }, [answers, hasSyncedStepFromSavedAnswers, loading, questions]);

  useEffect(() => {
    if (!status || status.status !== "generating") return;
    const id = setInterval(() => {
      fetchStatus().catch(() => {});
    }, 7000);
    return () => clearInterval(id);
  }, [status, fetchStatus]);

  const persistAnswers = useCallback(
    (nextAnswers: Record<string, string>) => {
      if (!userId) return;
      fetch(`/api/soulmate-sketch/answers?userId=${encodeURIComponent(userId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, answers: nextAnswers }),
      }).catch((persistError) => {
        console.error("[soulmate-sketch] failed to persist answers", persistError);
      });
    },
    [userId]
  );

  const handleSelect = (value: string) => {
    if (!activeQuestion) return;
    if (MULTI_SELECT_QUESTION_IDS.has(activeQuestion.id)) {
      setAnswers((prev) => {
        const existing = parseMultiAnswer(prev[activeQuestion.id]);
        const next = existing.includes(value)
          ? existing.filter((item) => item !== value)
          : [...existing, value];
        const updated = { ...prev };
        if (next.length === 0) {
          delete updated[activeQuestion.id];
        } else {
          updated[activeQuestion.id] = next.join(",");
        }
        persistAnswers(updated);
        return updated;
      });
      return;
    }

    const nextAnswers = { ...answers, [activeQuestion.id]: value };
    setAnswers(nextAnswers);
    persistAnswers(nextAnswers);
    if (currentStep < questions.length - 1) {
      setCurrentStep((s) => s + 1);
    }
  };

  const handleContinue = () => {
    if (!activeQuestion) return;
    if (!MULTI_SELECT_QUESTION_IDS.has(activeQuestion.id)) return;

    const selected = parseMultiAnswer(answers[activeQuestion.id]);
    if (selected.length === 0) return;

    if (currentStep < questions.length - 1) {
      setCurrentStep((s) => s + 1);
    }
  };

  const handleGenerate = async () => {
    if (!userId) {
      setError("Please login again to continue.");
      return;
    }

    setError("");
    setIsGenerating(true);
    try {
      const response = await fetch(`/api/soulmate-sketch/generate?userId=${encodeURIComponent(userId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const json = await response.json();
      if (!response.ok) {
        console.error("[soulmate-sketch] generate api error", {
          status: response.status,
          body: json,
        });
        if (json?.error === "generation_limit_reached") {
          setStatus(json.sketch || { status: "complete" });
          return;
        }
        const apiMessage = typeof json?.message === "string" ? json.message.trim() : "";
        const safeMessage =
          apiMessage && apiMessage.toLowerCase() !== "no message available"
            ? apiMessage
            : "Sketch generation failed. Please try again in a minute.";
        throw new Error(safeMessage);
      }
      setStatus(json.sketch || { status: "complete" });
      await fetchStatus();
    } catch (generateError: unknown) {
      console.error("[soulmate-sketch] generate failed", generateError);
      const message =
        generateError instanceof Error ? generateError.message : "Unable to generate sketch right now.";
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0E1A] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const imageUrl = status?.sketch_image_url || null;
  const hasReachedLimit = (status?.generation_count || 0) >= (status?.maxSketchPerUser || config.maxSketchPerUser);
  const hasAllAnswers = questions.every((question) => !!answers[question.id]);

  if (!unlockedFeatures.soulmateSketch) {
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
            <h1 className="text-xl font-semibold text-white">Soulmate Sketch is locked</h1>
            <p className="mt-2 text-sm text-white/60">Unlock it from Reports to start your sketch funnel.</p>
            <Button onClick={() => router.push("/reports")} className="mt-5 w-full">
              Back to Reports
            </Button>
          </div>
        </div>
      </div>
    );
  }

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

        <div className="rounded-3xl border border-primary/20 bg-[#1A2235] p-5">
          <h1 className="text-2xl font-semibold text-white">Your Soulmate Portrait</h1>

          {status?.status === "generating" || isGenerating ? (
            <div className="mt-6 rounded-2xl border border-primary/30 bg-primary/10 p-6 text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
              <p className="mt-3 text-base font-medium text-white">Finding your soulmate...</p>
              <p className="mt-2 text-sm text-white/75">
                Your portrait is being prepared. Please check back in some time.
              </p>
              <p className="mt-2 text-xs text-white/60">
                You can leave this screen and return later. We keep checking automatically.
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-4 border-white/20 bg-white/5 text-white hover:bg-white/10"
                onClick={() => fetchStatus().catch(() => {})}
              >
                Check Status Now
              </Button>
            </div>
          ) : imageUrl ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-5"
            >
              <div className="overflow-hidden rounded-2xl border border-white/15">
                <img src={imageUrl} alt="Soulmate sketch" className="w-full object-cover" />
              </div>
            </motion.div>
          ) : (
            <>
              {activeQuestion ? (
                <div className="mt-6">
                  <div className="mb-3 flex items-center justify-between text-xs text-white/50">
                    <span>
                      {Math.min(currentStep + 1, questions.length)}/{questions.length}
                    </span>
                    <span>{Math.round(((currentStep + 1) / questions.length) * 100)}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${((currentStep + 1) / questions.length) * 100}%` }}
                    />
                  </div>

                  <h2 className="mt-5 text-xl font-medium text-white">{activeQuestion.title}</h2>
                  {isMultiSelectQuestion ? (
                    <p className="mt-1 text-xs text-white/55">Select one or more options.</p>
                  ) : null}
                  <div className="mt-4 space-y-2">
                    {activeQuestion.options.map((option) => {
                      const selected = isMultiSelectQuestion
                        ? parseMultiAnswer(answers[activeQuestion.id]).includes(option.value)
                        : answers[activeQuestion.id] === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => handleSelect(option.value)}
                          className={`w-full rounded-xl border p-3 text-left transition ${
                            selected ? "border-primary bg-primary/10" : "border-white/10 bg-white/[0.03]"
                          }`}
                        >
                          <span className="inline-flex items-center gap-3">
                            <span className="text-xl">{option.emoji}</span>
                            <span className="text-white">{option.label}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {isMultiSelectQuestion && currentStep < questions.length - 1 ? (
                    <Button
                      onClick={handleContinue}
                      disabled={parseMultiAnswer(answers[activeQuestion.id]).length === 0}
                      className="mt-4 h-11 w-full"
                    >
                      Continue
                    </Button>
                  ) : null}
                </div>
              ) : null}

              {hasAllAnswers ? (
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating || hasReachedLimit}
                  className="mt-6 h-12 w-full"
                >
                  {isGenerating ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating...
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      Generate My Soulmate Sketch
                    </span>
                  )}
                </Button>
              ) : null}
            </>
          )}

          {hasReachedLimit && !imageUrl ? (
            <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              Sketch generation limit reached for this account.
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          ) : null}

          <ReportDisclaimer text="This AI-generated portrait is for spiritual self-reflection, not professional advice, and AstroRekha assumes no liability for any decisions or outcomes based on its content." />
        </div>
      </div>
    </div>
  );
}
