"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { OnboardingHeader, ProgressBar } from "@/components/onboarding/OnboardingHeader";
import {
  SKETCH_QUESTION_BANK,
  type SketchQuestionId,
} from "@/lib/layout-b-funnel";
import { cn } from "@/lib/utils";
import { generateUserId } from "@/lib/user-profile";

const ANSWERS_STORAGE_KEY = "astrorekha_soulmate_answers";
const MULTI_SELECT_QUESTION_IDS = new Set(["main_worry", "future_goal"]);
const ONBOARDING_LAYOUT_B_QUESTION_ORDER: SketchQuestionId[] = [
  "attracted_to",
  "age_group",
  "vibe",
  "main_worry",
];
const ATTRACTED_TO_ALIAS_KEYS = [
  "attractedTo",
  "attracted",
  "gender_preference",
  "genderPreference",
  "target_gender",
] as const;

interface LayoutBQuestionStepProps {
  routeStep: number;
}

export function LayoutBQuestionStep({ routeStep }: LayoutBQuestionStepProps) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);

  const questions = useMemo(() => {
    const byId = new Map(SKETCH_QUESTION_BANK.map((q) => [q.id, q]));
    return ONBOARDING_LAYOUT_B_QUESTION_ORDER
      .map((id) => byId.get(id))
      .filter((q): q is NonNullable<typeof q> => !!q);
  }, []);
  const questionIndex = Math.max(0, routeStep - 7);
  const current = questions[questionIndex];
  const totalQuestionSteps = Math.max(questions.length, 1);
  const isMultiSelect = !!current && MULTI_SELECT_QUESTION_IDS.has(current.id);

  useEffect(() => {
    const init = async () => {
      try {
        const savedAnswers = localStorage.getItem(ANSWERS_STORAGE_KEY);
        if (savedAnswers) {
          setAnswers(JSON.parse(savedAnswers));
        }
      } catch {
        // ignore invalid local data
      } finally {
        setReady(true);
      }
    };
    init();
  }, []);

  useEffect(() => {
    localStorage.setItem(ANSWERS_STORAGE_KEY, JSON.stringify(answers));
  }, [answers]);

  useEffect(() => {
    if (!ready) return;
    if (questionIndex >= totalQuestionSteps) {
      router.replace("/onboarding/step-11");
    }
  }, [ready, questionIndex, totalQuestionSteps, router]);

  const mergeWithStoredAnswers = (incoming: Record<string, string>) => {
    try {
      const savedAnswers = localStorage.getItem(ANSWERS_STORAGE_KEY);
      if (!savedAnswers) return incoming;
      const parsed = JSON.parse(savedAnswers);
      if (!parsed || typeof parsed !== "object") return incoming;
      return { ...(parsed as Record<string, string>), ...incoming };
    } catch {
      return incoming;
    }
  };

  const withAttractedAliases = (sourceAnswers: Record<string, string>) => {
    const attractedValue = sourceAnswers.attracted_to;
    if (!attractedValue) return sourceAnswers;

    const next = { ...sourceAnswers };
    for (const key of ATTRACTED_TO_ALIAS_KEYS) {
      next[key] = attractedValue;
    }
    return next;
  };

  const persistAnswers = (incomingAnswers: Record<string, string>) => {
    const nextAnswers = withAttractedAliases(mergeWithStoredAnswers(incomingAnswers));
    localStorage.setItem(ANSWERS_STORAGE_KEY, JSON.stringify(nextAnswers));

    const userId = localStorage.getItem("astrorekha_user_id") || generateUserId();
    localStorage.setItem("astrorekha_user_id", userId);

    fetch(`/api/soulmate-sketch/answers?userId=${encodeURIComponent(userId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, answers: nextAnswers }),
    }).catch((error) => {
      console.error("[layout-b/onboarding] failed to persist soulmate answers", error);
    });

    return nextAnswers;
  };

  const parseMultiAnswer = (raw: string | undefined): string[] => {
    if (!raw) return [];
    return raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  };

  const handleSelect = (value: string) => {
    if (!current) return;

    if (isMultiSelect) {
      const existing = parseMultiAnswer(answers[current.id]);
      const nextValues = existing.includes(value)
        ? existing.filter((item) => item !== value)
        : [...existing, value];

      const nextAnswers = { ...answers };
      if (nextValues.length === 0) {
        delete nextAnswers[current.id];
      } else {
        nextAnswers[current.id] = nextValues.join(",");
      }

      const mergedAnswers = persistAnswers(nextAnswers);
      setAnswers(mergedAnswers);
      return;
    }

    const nextAnswers =
      current.id === "attracted_to"
        ? withAttractedAliases({ ...answers, [current.id]: value })
        : { ...answers, [current.id]: value };
    const mergedAnswers = persistAnswers(nextAnswers);
    setAnswers(mergedAnswers);
    handleContinue();
  };

  const handleContinue = () => {
    if (questionIndex < totalQuestionSteps - 1) {
      router.push(`/onboarding/step-${routeStep + 1}`);
      return;
    }
    router.push("/onboarding/step-10b");
  };

  const handleBack = () => {
    if (routeStep <= 7) {
      router.push("/onboarding/step-6");
      return;
    }
    router.push(`/onboarding/step-${routeStep - 1}`);
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen">
      <OnboardingHeader showBack currentStep={routeStep} totalSteps={14} onBack={handleBack} />
      <ProgressBar currentStep={routeStep} totalSteps={14} />

      <div className="flex-1 flex flex-col px-6 pt-8">
        {current ? (
          <>
            <h1 className="text-xl md:text-2xl font-bold text-center mb-8">{current.title}</h1>
            {isMultiSelect ? (
              <p className="text-center text-xs text-muted-foreground -mt-4 mb-5">Select one or more options.</p>
            ) : null}
            <div className="space-y-3">
              {current.options.map((option) => {
                const selected = isMultiSelect
                  ? parseMultiAnswer(answers[current.id]).includes(option.value)
                  : answers[current.id] === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleSelect(option.value)}
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
            {isMultiSelect ? (
              <button
                type="button"
                onClick={handleContinue}
                disabled={parseMultiAnswer(answers[current.id]).length === 0}
                className={cn(
                  "w-full h-12 rounded-xl mt-5 font-semibold transition-all",
                  parseMultiAnswer(answers[current.id]).length > 0
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                )}
              >
                Continue
              </button>
            ) : null}
          </>
        ) : (
          <p className="text-center text-muted-foreground">Loading...</p>
        )}
      </div>
    </div>
  );
}
