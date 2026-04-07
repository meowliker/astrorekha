"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Check, Loader2 } from "lucide-react";
import {
  DEFAULT_LAYOUT_B_CONFIG,
  getActiveSketchQuestions,
  normalizeLayoutBConfig,
  type LayoutBFunnelConfig,
} from "@/lib/layout-b-funnel";

const ANSWERS_STORAGE_KEY = "astrorekha_soulmate_answers";

export default function SketchFunnelPage() {
  const router = useRouter();
  const [config, setConfig] = useState<LayoutBFunnelConfig>(DEFAULT_LAYOUT_B_CONFIG);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);

  const questions = useMemo(() => getActiveSketchQuestions(config), [config]);
  const current = questions[step];
  const done = questions.length > 0 && step >= questions.length;

  useEffect(() => {
    const init = async () => {
      const hasCompletedPayment = localStorage.getItem("astrorekha_payment_completed") === "true";
      const layoutVariant = localStorage.getItem("astrorekha_layout_variant");
      if (!hasCompletedPayment || layoutVariant !== "B") {
        router.replace("/onboarding/bundle-pricing-b");
        return;
      }

      try {
        const savedAnswers = localStorage.getItem(ANSWERS_STORAGE_KEY);
        if (savedAnswers) {
          setAnswers(JSON.parse(savedAnswers));
        }
      } catch {
        // ignore invalid JSON and continue
      }

      try {
        const response = await fetch("/api/ab-test/layout-config", { cache: "no-store" });
        const json = await response.json().catch(() => ({}));
        setConfig(normalizeLayoutBConfig(json?.config || DEFAULT_LAYOUT_B_CONFIG));
      } catch {
        setConfig(DEFAULT_LAYOUT_B_CONFIG);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [router]);

  useEffect(() => {
    localStorage.setItem(ANSWERS_STORAGE_KEY, JSON.stringify(answers));
  }, [answers]);

  const selectOption = (value: string) => {
    if (!current) return;
    const next = { ...answers, [current.id]: value };
    setAnswers(next);
    if (step < questions.length - 1) {
      setStep((s) => s + 1);
    } else {
      setStep(questions.length);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0E1A] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-300" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0E1A] px-5 py-6">
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-center text-2xl font-semibold text-white">Personalize Your Soulmate Sketch</h1>
        <p className="mt-2 text-center text-sm text-white/60">
          Quick 30-second funnel. This helps generate a better portrait.
        </p>

        {!done && current ? (
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
          >
            <div className="mb-3 flex items-center justify-between text-xs text-white/50">
              <span>
                Step {step + 1} / {questions.length}
              </span>
              <span>{Math.round(((step + 1) / questions.length) * 100)}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-indigo-400 transition-all"
                style={{ width: `${((step + 1) / questions.length) * 100}%` }}
              />
            </div>
            <h2 className="mt-4 text-xl font-medium text-white">{current.title}</h2>
            <div className="mt-4 space-y-2">
              {current.options.map((option) => {
                const selected = answers[current.id] === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => selectOption(option.value)}
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
          </motion.div>
        ) : (
          <div className="mt-6 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-5 text-center">
            <div className="mx-auto w-fit rounded-full bg-emerald-500/20 p-2">
              <Check className="h-5 w-5 text-emerald-300" />
            </div>
            <p className="mt-3 text-sm text-emerald-100">
              Great. Your sketch preferences are saved.
            </p>
          </div>
        )}

        <Button
          onClick={() => router.push("/onboarding/step-19")}
          className="mt-6 h-12 w-full bg-indigo-500 hover:bg-indigo-400"
        >
          {done ? "Continue to Create Account" : "Skip for now"}
        </Button>
      </div>
    </div>
  );
}
