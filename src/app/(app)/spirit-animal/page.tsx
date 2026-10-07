"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  Compass,
  Loader2,
  Lock,
} from "lucide-react";
import ReportDisclaimer from "@/components/ReportDisclaimer";
import {
  SpiritAnimalPageShell,
  SpiritAnimalResult,
} from "@/components/spirit-animal/SpiritAnimalReport";
import {
  SPIRIT_ANIMAL_QUESTIONS,
  serializeSpiritAnimalAnswers,
  type SpiritAnimalReportResult,
} from "@/lib/spirit-animal-report";
import { useUserStore } from "@/lib/user-store";

interface SpiritAnimalStatusResponse {
  status: "not_started" | "complete";
  result?: SpiritAnimalReportResult | null;
}

export default function SpiritAnimalPage() {
  const { unlockedFeatures } = useUserStore();
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<SpiritAnimalReportResult | null>(null);
  const [error, setError] = useState("");
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userId, setUserId] = useState("");

  const currentQuestion = SPIRIT_ANIMAL_QUESTIONS[step];
  const answeredCount = useMemo(
    () => SPIRIT_ANIMAL_QUESTIONS.filter((question) => Boolean(answers[question.id])).length,
    [answers]
  );

  const fetchStatus = useCallback(async (uid: string) => {
    const response = await fetch(`/api/spirit-animal-report/status?userId=${encodeURIComponent(uid)}`, {
      cache: "no-store",
    });
    if (response.status === 403) throw new Error("Spirit Animal Report is locked.");
    if (!response.ok) throw new Error("Unable to load your Spirit Animal Report right now.");
    const json = (await response.json()) as SpiritAnimalStatusResponse;
    if (json.status === "complete" && json.result) setResult(json.result);
  }, []);

  useEffect(() => {
    const boot = async () => {
      try {
        const localUserId = localStorage.getItem("astrorekha_user_id") || "";
        setUserId(localUserId);
        if (!localUserId) throw new Error("Please log in again to continue.");
        await fetchStatus(localUserId);
      } catch (caught: unknown) {
        setError(caught instanceof Error ? caught.message : "Unable to load your Spirit Animal Report.");
      } finally {
        setLoading(false);
      }
    };
    boot();
  }, [fetchStatus]);

  const submitQuiz = useCallback(async (nextAnswers: Record<string, string>) => {
    if (!userId || SPIRIT_ANIMAL_QUESTIONS.some((question) => !nextAnswers[question.id])) return;
    try {
      setIsSubmitting(true);
      setError("");
      const response = await fetch("/api/spirit-animal-report/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, answers: serializeSpiritAnimalAnswers(nextAnswers) }),
      });
      const json = await response.json().catch(() => ({}));
      if (response.status === 409 && json?.result) {
        setResult(json.result);
        return;
      }
      if (!response.ok) throw new Error(json?.message || "Unable to save your result.");
      setResult(json.result || null);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Unable to save your result.");
    } finally {
      setIsSubmitting(false);
      setIsAdvancing(false);
    }
  }, [userId]);

  const selectOption = (optionId: string) => {
    if (!currentQuestion || isAdvancing || isSubmitting) return;
    const nextAnswers = { ...answers, [currentQuestion.id]: optionId };
    setAnswers(nextAnswers);
    setIsAdvancing(true);
    window.setTimeout(() => {
      if (step === SPIRIT_ANIMAL_QUESTIONS.length - 1) {
        submitQuiz(nextAnswers);
      } else {
        setStep((value) => value + 1);
        setIsAdvancing(false);
      }
    }, 180);
  };

  const previousQuestion = () => {
    if (step === 0 || isSubmitting) return;
    const priorQuestion = SPIRIT_ANIMAL_QUESTIONS[step - 1];
    setAnswers((current) => ({ ...current, [priorQuestion.id]: "" }));
    setStep((value) => value - 1);
    setIsAdvancing(false);
  };

  if (!unlockedFeatures.spiritAnimalReport) {
    return (
      <main className="min-h-screen bg-[#0A0E1A] px-4 py-5 text-white">
        <div className="mx-auto max-w-md">
          <Link href="/reports" className="mb-4 inline-flex items-center gap-2 text-sm text-white/75">
            <ArrowLeft className="h-4 w-4" /> Reports
          </Link>
          <section className="rounded-3xl border border-primary/20 bg-[#1A2235] p-6 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10"><Lock className="h-6 w-6 text-primary" /></div>
            <h1 className="mt-4 text-xl font-semibold">Spirit Animal Report is locked</h1>
            <p className="mt-2 text-sm text-white/60">Unlock it from Reports to reveal your symbolic animal guide.</p>
            <Link href="/reports" className="mt-5 block w-full rounded-2xl bg-primary px-4 py-3 font-semibold text-white">Back to Reports</Link>
          </section>
        </div>
      </main>
    );
  }

  return (
    <SpiritAnimalPageShell>
          {loading ? (
            <div className="flex min-h-[70vh] items-center justify-center text-center">
              <div><Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" /><p className="mt-4 text-sm text-white/60">Following the trail...</p></div>
            </div>
          ) : null}

          {!loading && error && !result ? (
            <div className="rounded-3xl border border-red-400/25 bg-red-500/10 p-5 text-center">
              <p className="text-sm text-red-100">{error}</p>
              <Link href="/reports" className="mt-4 block w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-semibold">Back to Reports</Link>
            </div>
          ) : null}

          {!loading && !result && currentQuestion && !error ? (
            <section className="rounded-2xl border border-primary/20 bg-[#1A2235] p-3.5 shadow-xl shadow-black/30">
              <div className="flex items-center justify-between text-[11px] text-white/50">
                <span>Question {step + 1} of {SPIRIT_ANIMAL_QUESTIONS.length}</span>
                <span>{Math.round((answeredCount / SPIRIT_ANIMAL_QUESTIONS.length) * 100)}%</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                <motion.div className="h-full rounded-full bg-gradient-to-r from-primary via-fuchsia-500 to-purple-500" animate={{ width: `${(answeredCount / SPIRIT_ANIMAL_QUESTIONS.length) * 100}%` }} />
              </div>

              <AnimatePresence mode="wait">
                <motion.div key={currentQuestion.id} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -18 }} className="mt-4">
                  <div className="flex gap-2.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-gradient-to-br from-primary/25 to-purple-600/25"><Compass className="h-4 w-4 text-primary" /></div>
                    <div>
                      <h2 className="text-[17px] font-semibold leading-6">{currentQuestion.prompt}</h2>
                      <p className="mt-1.5 text-[11px] leading-4 text-white/50">{currentQuestion.context}</p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    {currentQuestion.options.map((option, index) => {
                      const selected = answers[currentQuestion.id] === option.id;
                      return (
                        <button key={option.id} onClick={() => selectOption(option.id)} disabled={isAdvancing || isSubmitting} className={`w-full rounded-xl border p-3 text-left transition ${selected ? "border-primary bg-primary/15 shadow-lg shadow-primary/10" : "border-white/10 bg-black/20 hover:border-primary/40 hover:bg-white/5"}`}>
                          <span className="flex items-start gap-2.5">
                            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${selected ? "border-primary bg-primary text-white" : "border-white/20 text-white/50"}`}>{selected ? <Check className="h-3 w-3" /> : String.fromCharCode(65 + index)}</span>
                            <span className="text-[13px] font-medium leading-5 text-white/80">{option.label}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              </AnimatePresence>

              <button onClick={previousQuestion} disabled={step === 0 || isSubmitting} className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 text-xs disabled:opacity-30"><ChevronLeft className="h-4 w-4" /> Back</button>
              <ReportDisclaimer className="mt-3" />
            </section>
          ) : null}

          {!loading && result ? (
            <SpiritAnimalResult
              result={result}
              onCompleteQuiz={() => {
                setStep(0);
                setAnswers({});
                setError("");
                setResult(null);
              }}
            />
          ) : null}
    </SpiritAnimalPageShell>
  );
}
