"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUserStore } from "@/lib/user-store";
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

  const questions = useMemo(() => getActiveSketchQuestions(config), [config]);
  const activeQuestion: SketchQuestion | null = questions[currentStep] || null;

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
    if (!status || status.status !== "generating") return;
    const id = setInterval(() => {
      fetchStatus().catch(() => {});
    }, 3000);
    return () => clearInterval(id);
  }, [status, fetchStatus]);

  const handleSelect = (value: string) => {
    if (!activeQuestion) return;
    setAnswers((prev) => ({ ...prev, [activeQuestion.id]: value }));
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
        if (json?.error === "generation_limit_reached") {
          setStatus(json.sketch || { status: "complete" });
          return;
        }
        throw new Error(json?.message || "Generation failed");
      }
      setStatus(json.sketch || { status: "complete" });
      await fetchStatus();
    } catch (generateError: any) {
      setError(generateError?.message || "Unable to generate sketch right now.");
    } finally {
      setIsGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0E1A] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-300" />
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
          <div className="rounded-3xl border border-white/10 bg-[#121a2f] p-5 text-center">
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

        <div className="rounded-3xl border border-white/10 bg-[#121a2f] p-5">
          <h1 className="text-2xl font-semibold text-white">Soulmate Sketch</h1>
          <p className="mt-1 text-sm text-white/60">
            One personalized sketch per user. Complete the mini funnel and generate once.
          </p>

          {status?.status === "generating" || isGenerating ? (
            <div className="mt-6 rounded-2xl border border-indigo-400/30 bg-indigo-500/10 p-6 text-center">
              <Loader2 className="mx-auto h-7 w-7 animate-spin text-indigo-300" />
              <p className="mt-3 text-sm text-indigo-100">Generating your soulmate portrait...</p>
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
              <p className="mt-3 text-center text-xs text-white/50">
                Your one-time sketch has been generated successfully.
              </p>
            </motion.div>
          ) : (
            <>
              {activeQuestion ? (
                <div className="mt-6">
                  <div className="mb-3 flex items-center justify-between text-xs text-white/50">
                    <span>
                      Step {Math.min(currentStep + 1, questions.length)} / {questions.length}
                    </span>
                    <span>{Math.round(((currentStep + 1) / questions.length) * 100)}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-indigo-400 transition-all"
                      style={{ width: `${((currentStep + 1) / questions.length) * 100}%` }}
                    />
                  </div>

                  <h2 className="mt-5 text-xl font-medium text-white">{activeQuestion.title}</h2>
                  <div className="mt-4 space-y-2">
                    {activeQuestion.options.map((option) => {
                      const selected = answers[activeQuestion.id] === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => handleSelect(option.value)}
                          className={`w-full rounded-xl border p-3 text-left transition ${
                            selected ? "border-indigo-400 bg-indigo-500/15" : "border-white/10 bg-white/[0.03]"
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
                </div>
              ) : null}

              {hasAllAnswers ? (
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating || hasReachedLimit}
                  className="mt-6 h-12 w-full bg-indigo-500 hover:bg-indigo-400"
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

          <div className="mt-5 flex flex-wrap gap-2">
            {questions.map((question, idx) => (
              <span
                key={question.id}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] ${
                  answers[question.id]
                    ? "border-green-400/40 bg-green-500/10 text-green-200"
                    : idx === currentStep
                    ? "border-indigo-400/50 bg-indigo-500/10 text-indigo-100"
                    : "border-white/15 bg-white/[0.03] text-white/55"
                }`}
              >
                {answers[question.id] ? <Check className="h-3 w-3" /> : null}
                {question.id.replaceAll("_", " ")}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
