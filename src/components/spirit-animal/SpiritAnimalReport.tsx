"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Briefcase,
  Compass,
  Heart,
  Leaf,
  Moon,
  Shield,
  Sparkles,
} from "lucide-react";
import ReportDisclaimer from "@/components/ReportDisclaimer";
import {
  hasSpiritAnimalTraitPercentages,
  SPIRIT_TRAITS,
  type SpiritAnimalReportResult,
  type SpiritTrait,
} from "@/lib/spirit-animal-report";

const TRAIT_LABELS: Record<SpiritTrait, string> = {
  courage: "Courage",
  connection: "Connection",
  intuition: "Intuition",
  adaptability: "Adaptability",
  grounding: "Grounding",
  transformation: "Transformation",
};

export function SpiritAnimalPageShell({
  children,
  backHref = "/reports",
}: {
  children: ReactNode;
  backHref?: string;
}) {
  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="mx-auto min-h-screen w-full max-w-md bg-[#0A0E1A] shadow-2xl shadow-black/50">
        <header className="sticky top-0 z-30 flex items-center border-b border-white/10 bg-[#0A0E1A]/95 px-4 py-3 backdrop-blur-sm">
          <Link
            href={backHref}
            aria-label="Back to reports"
            className="flex h-10 w-10 items-center justify-center"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1 pr-10 text-center">
            <h1 className="font-semibold">Spirit Animal</h1>
            <p className="text-[10px] uppercase tracking-[0.22em] text-primary/70">Symbolic archetype report</p>
          </div>
        </header>

        <div className="px-4 py-5">{children}</div>
      </div>
    </main>
  );
}

export function SpiritAnimalResult({
  result,
  unoptimizedImages = false,
  onCompleteQuiz,
}: {
  result: SpiritAnimalReportResult;
  unoptimizedImages?: boolean;
  onCompleteQuiz?: () => void;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <section className="overflow-hidden rounded-3xl border border-primary/20 bg-[#1A2235] shadow-2xl shadow-black/30">
        <div
          className="relative overflow-hidden px-5 py-8 text-center"
          style={{ backgroundImage: result.heroGradient }}
        >
          <div className="relative">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-primary/75">Your symbolic animal archetype</p>
            <div className={`relative mx-auto mt-5 flex items-center justify-center overflow-hidden rounded-full border border-primary/30 bg-black/25 shadow-2xl shadow-primary/10 ${result.imageUrl ? "h-44 w-44" : "h-28 w-28 text-7xl"}`}>
              {result.imageUrl ? (
                <Image
                  src={result.imageUrl}
                  alt={`${result.animalName} spirit animal`}
                  fill
                  priority
                  unoptimized={unoptimizedImages}
                  sizes="176px"
                  className="object-contain"
                />
              ) : result.emoji}
            </div>
            <h2 className="mt-4 text-4xl font-bold">{result.animalName}</h2>
            <p className="mt-1 text-sm font-semibold text-primary">{result.archetype}</p>
            <p className="mx-auto mt-4 max-w-sm text-sm leading-7 text-white/75">{result.summary}</p>
            <div className="mt-5 flex items-center justify-center gap-2">
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80">{result.element} energy</span>
              {result.topTraits?.[0] ? <span className="rounded-full border border-primary/25 bg-primary/15 px-3 py-1.5 text-xs font-medium text-white/85">Primary: {TRAIT_LABELS[result.topTraits[0]]}</span> : null}
            </div>
          </div>
        </div>
        <div className="p-5">
          <h3 className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-primary" /> Why this animal</h3>
          <p className="mt-3 text-sm leading-7 text-white/70">{result.whyThisAnimal}</p>
          {result.topTraits?.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {result.topTraits.map((trait) => <span key={trait} className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs text-white/85">{TRAIT_LABELS[trait]}</span>)}
            </div>
          ) : null}
        </div>
      </section>

      <TraitProfile result={result} onCompleteQuiz={onCompleteQuiz} />
      <TextCard title="Your Inner Nature" icon={<Sparkles className="h-4 w-4 text-primary" />} text={result.innerNature} />
      <ListCard title="Natural Gifts" icon={<Shield className="h-4 w-4 text-emerald-300" />} items={result.strengths} tint="emerald" />
      <TextCard title="When You Are Aligned" icon={<Sparkles className="h-4 w-4 text-fuchsia-300" />} text={result.whenBalanced} />
      <ListCard title="Patterns to Watch" icon={<Moon className="h-4 w-4 text-fuchsia-300" />} items={result.shadowPatterns} tint="primary" />
      <TextCard title="When You Are Under Pressure" icon={<Moon className="h-4 w-4 text-violet-300" />} text={result.underPressure} />
      <TextCard title="Relationships" icon={<Heart className="h-4 w-4 text-pink-300" />} text={result.relationships} />
      <TextCard title="Career & Purpose" icon={<Briefcase className="h-4 w-4 text-violet-300" />} text={result.careerAndPurpose} />
      <TextCard title="Your Growth Focus" icon={<Compass className="h-4 w-4 text-primary" />} text={result.growthFocus} />
      <TextCard title="Life Lesson" icon={<Compass className="h-4 w-4 text-cyan-300" />} text={result.lifeLesson} />
      <ListCard title="Daily Integration" icon={<Leaf className="h-4 w-4 text-emerald-300" />} items={result.dailyPractices} tint="emerald" />
      <ListCard title="Guidance for Your Path" icon={<Compass className="h-4 w-4 text-violet-300" />} items={result.guidance} tint="violet" />

      <section className="rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/15 via-fuchsia-500/10 to-purple-600/15 p-5 text-center">
        <p className="text-[10px] uppercase tracking-[0.24em] text-primary/70">Your affirmation</p>
        <p className="mt-3 text-lg font-semibold leading-8 text-white">“{result.affirmation}”</p>
      </section>

      <ReportDisclaimer />
    </motion.div>
  );
}

function TraitProfile({ result, onCompleteQuiz }: { result: SpiritAnimalReportResult; onCompleteQuiz?: () => void }) {
  const hasPersonalScores = hasSpiritAnimalTraitPercentages(result.traitPercentages);
  const percentages: Partial<Record<SpiritTrait, number>> = hasPersonalScores ? result.traitPercentages : {};

  return (
    <section className="rounded-3xl border border-white/10 bg-[#1A2235] p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-white">Your Archetype Pattern</h3>
          <p className="mt-1 text-xs leading-5 text-white/50">{hasPersonalScores ? "The six instincts reflected across your choices" : "Complete the quiz to reveal your six instincts"}</p>
        </div>
        <Compass className="h-5 w-5 shrink-0 text-primary" />
      </div>
      {!hasPersonalScores ? (
        <div className="mt-5">
          <p className="text-sm leading-6 text-white/65">This earlier report has no saved quiz answers, so your personal trait pattern cannot be calculated yet.</p>
          {onCompleteQuiz ? <button type="button" onClick={onCompleteQuiz} className="mt-4 w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white">Complete the 10-question quiz</button> : null}
          {onCompleteQuiz ? <p className="mt-2 text-xs leading-5 text-white/45">Your animal will be based on your answers and may change.</p> : null}
        </div>
      ) : <div className="mt-5 space-y-3">
        {SPIRIT_TRAITS.map((trait) => {
          const value = Number(percentages[trait] || 0);
          return (
            <div key={trait}>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-medium text-white/75">{TRAIT_LABELS[trait]}</span>
                <span className="text-white/45">{value}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-black/25">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary via-fuchsia-500 to-purple-500"
                  style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>}
    </section>
  );
}

function TextCard({ title, icon, text }: { title: string; icon: ReactNode; text: string }) {
  return <section className="rounded-3xl border border-white/10 bg-[#1A2235] p-5"><h3 className="flex items-center gap-2 font-semibold">{icon}{title}</h3><p className="mt-3 text-sm leading-7 text-white/70">{text}</p></section>;
}

function ListCard({ title, icon, items, tint }: { title: string; icon: ReactNode; items: string[]; tint: "emerald" | "primary" | "violet" }) {
  const color = tint === "emerald" ? "bg-emerald-300" : tint === "primary" ? "bg-primary" : "bg-violet-300";
  return <section className="rounded-3xl border border-white/10 bg-[#1A2235] p-5"><h3 className="flex items-center gap-2 font-semibold">{icon}{title}</h3><div className="mt-4 space-y-3">{items.map((item) => <div key={item} className="flex gap-3 text-sm leading-6 text-white/70"><span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${color}`} />{item}</div>)}</div></section>;
}
