"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { OnboardingHeader, ProgressBar } from "@/components/onboarding/OnboardingHeader";
import { SKETCH_QUESTION_BANK } from "@/lib/layout-b-funnel";
import { cn } from "@/lib/utils";
import { generateUserId } from "@/lib/user-profile";

const ANSWERS_STORAGE_KEY = "astrorekha_soulmate_answers";
const QUESTION_ID = "future_goal";

function parseMultiAnswer(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function Step10BPage() {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const question = useMemo(
    () => SKETCH_QUESTION_BANK.find((item) => item.id === QUESTION_ID),
    []
  );

  useEffect(() => {
    const onboardingFlow = localStorage.getItem("astrorekha_onboarding_flow");
    const layoutVariant = localStorage.getItem("astrorekha_layout_variant");
    if (onboardingFlow !== "flow-b" || layoutVariant !== "B") {
      router.replace("/onboarding/step-11");
      return;
    }

    try {
      const savedAnswers = localStorage.getItem(ANSWERS_STORAGE_KEY);
      if (savedAnswers) {
        const parsed = JSON.parse(savedAnswers);
        if (parsed && typeof parsed === "object") {
          setAnswers(parsed as Record<string, string>);
        }
      }
    } catch {
      // ignore malformed local data
    }
  }, [router]);

  const persistAnswers = (nextAnswers: Record<string, string>) => {
    try {
      const savedAnswers = localStorage.getItem(ANSWERS_STORAGE_KEY);
      if (savedAnswers) {
        const parsed = JSON.parse(savedAnswers);
        if (parsed && typeof parsed === "object") {
          nextAnswers = { ...(parsed as Record<string, string>), ...nextAnswers };
        }
      }
    } catch {
      // ignore malformed local data and use incoming answers
    }

    const userId = localStorage.getItem("astrorekha_user_id") || generateUserId();
    localStorage.setItem("astrorekha_user_id", userId);
    localStorage.setItem(ANSWERS_STORAGE_KEY, JSON.stringify(nextAnswers));

    fetch(`/api/soulmate-sketch/answers?userId=${encodeURIComponent(userId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, answers: nextAnswers }),
    }).catch((error) => {
      console.error("[flow-b/step-10b] failed to persist soulmate answers", error);
    });

    return nextAnswers;
  };

  const toggleOption = (value: string) => {
    const existing = parseMultiAnswer(answers[QUESTION_ID]);
    const nextValues = existing.includes(value)
      ? existing.filter((item) => item !== value)
      : [...existing, value];

    const nextAnswers = { ...answers };
    if (nextValues.length === 0) {
      delete nextAnswers[QUESTION_ID];
    } else {
      nextAnswers[QUESTION_ID] = nextValues.join(",");
    }

    const mergedAnswers = persistAnswers(nextAnswers);
    setAnswers(mergedAnswers);
  };

  const handleContinue = () => {
    router.push("/onboarding/step-11");
  };

  const selectedValues = parseMultiAnswer(answers[QUESTION_ID]);

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <OnboardingHeader showBack currentStep={10} totalSteps={14} onBack={() => router.push("/onboarding/step-10")} />
      <ProgressBar currentStep={10} totalSteps={14} />

      <div className="flex-1 flex flex-col px-6 pt-8">
        <h1 className="text-xl md:text-2xl font-bold text-center mb-2">{question?.title || "Your relationship future"}</h1>
        <p className="text-center text-xs text-muted-foreground mb-6">Select one or more options.</p>

        <div className="space-y-3">
          {question?.options.map((option) => {
            const selected = selectedValues.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => toggleOption(option.value)}
                className={cn(
                  "w-full flex items-center gap-4 p-4 rounded-xl transition-all duration-200",
                  "bg-card hover:bg-card/80 border border-border hover:border-primary/50",
                  selected && "border-primary bg-primary/10"
                )}
              >
                <span className="text-2xl">{option.emoji}</span>
                <span className="font-medium">{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="onboarding-cta">
        <button
          type="button"
          onClick={handleContinue}
          disabled={selectedValues.length === 0}
          className={cn(
            "w-full h-14 rounded-xl text-lg font-semibold transition-all",
            selectedValues.length > 0
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          )}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
