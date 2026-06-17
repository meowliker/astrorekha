"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Check, Loader2 } from "lucide-react";
import { OnboardingHeader, ProgressBar } from "@/components/onboarding/OnboardingHeader";
import { cn } from "@/lib/utils";
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

      let parsedAnswers: Record<string, unknown> = {};
      try {
        const savedAnswers = localStorage.getItem(ANSWERS_STORAGE_KEY);
        if (savedAnswers) {
          const parsed = JSON.parse(savedAnswers);
          if (parsed && typeof parsed === "object") {
            parsedAnswers = parsed as Record<string, unknown>;
            setAnswers(parsed as Record<string, string>);
          }
        }
      } catch {
        // ignore invalid JSON and continue
      }

      let normalizedConfig = DEFAULT_LAYOUT_B_CONFIG;
      try {
        const response = await fetch("/api/ab-test/layout-config", { cache: "no-store" });
        const json = await response.json().catch(() => ({}));
        normalizedConfig = normalizeLayoutBConfig(json?.config || DEFAULT_LAYOUT_B_CONFIG);
        setConfig(normalizedConfig);
      } catch {
        normalizedConfig = DEFAULT_LAYOUT_B_CONFIG;
        setConfig(normalizedConfig);
      } finally {
        const activeQuestions = getActiveSketchQuestions(normalizedConfig);
        const hasValue = (value: unknown) =>
          Array.isArray(value)
            ? value.length > 0
            : typeof value === "string"
            ? value.trim().length > 0
            : Boolean(value);

        const firstUnansweredIndex = activeQuestions.findIndex(
          (question) => !hasValue(parsedAnswers[question.id])
        );

        if (activeQuestions.length > 0 && firstUnansweredIndex === -1) {
          router.replace("/onboarding/step-19");
          return;
        }

        if (firstUnansweredIndex > 0) {
          setStep(firstUnansweredIndex);
        }

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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <OnboardingHeader showBack currentStep={13} totalSteps={14} />
      <ProgressBar currentStep={13} totalSteps={14} />

      <div className="mx-auto w-full max-w-md flex-1 px-6 pt-8">
        <h1 className="text-center text-2xl font-semibold">Personalize Your Soulmate Sketch</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Quick 30-second funnel. This helps generate a better portrait.
        </p>

        {!done && current ? (
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 rounded-2xl border border-border bg-card p-4"
          >
            <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Step {step + 1} / {questions.length}
              </span>
              <span>{Math.round(((step + 1) / questions.length) * 100)}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${((step + 1) / questions.length) * 100}%` }}
              />
            </div>
            <h2 className="mt-4 text-xl font-medium">{current.title}</h2>
            <div className="mt-4 space-y-2">
              {current.options.map((option) => {
                const selected = answers[current.id] === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => selectOption(option.value)}
                    className={cn(
                      "w-full rounded-xl border p-3 text-left transition",
                      "bg-card hover:bg-card/80 border-border hover:border-primary/50",
                      selected && "border-primary bg-primary/10"
                    )}
                  >
                    <span className="inline-flex items-center gap-3">
                      <span className="text-xl">{option.emoji}</span>
                      <span>{option.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        ) : (
          <div className="mt-6 rounded-2xl border border-primary/30 bg-primary/10 p-5 text-center">
            <div className="mx-auto w-fit rounded-full bg-primary/20 p-2">
              <Check className="h-5 w-5 text-primary" />
            </div>
            <p className="mt-3 text-sm text-foreground">
              Great. Your sketch preferences are saved.
            </p>
          </div>
        )}
      </div>

      <div className="px-6 pb-24">
        <Button onClick={() => router.push("/onboarding/step-19")} className="h-14 w-full text-lg font-semibold">
          {done ? "Continue to Create Account" : "Skip for now"}
        </Button>
      </div>
    </div>
  );
}
