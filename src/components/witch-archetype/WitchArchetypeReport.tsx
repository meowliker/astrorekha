"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Briefcase, Check, ChevronLeft, Compass, Heart, Leaf, Lightbulb, Loader2, Lock, Moon, Shield, Sparkles } from "lucide-react";
import ReportDisclaimer from "@/components/ReportDisclaimer";
import { isWitchResult, WITCH_QUESTIONS, WITCH_TRAIT_LABELS, WITCH_TRAITS, type WitchResult } from "@/lib/witch-archetype";
import { WITCH_ANSWER_ACCENTS } from "@/lib/witch-archetype-details";
import { isWitchTemplate, type WitchArchetypeTemplate } from "@/lib/witch-archetype-template";

function WitchSigil({ symbol, color }: { symbol: string; color: string }) {
  return <div aria-hidden="true" className="relative mx-auto flex h-40 w-40 items-center justify-center rounded-full border border-white/25 bg-black/20 shadow-[0_0_55px_rgba(202,177,255,0.18)]" style={{ color }}>
    <div className="absolute inset-2 rounded-full border border-current opacity-35" />
    <div className="absolute inset-5 rounded-full border border-dashed border-current opacity-30" />
    <span className="font-serif text-7xl">{symbol}</span>
    <span className="absolute -top-2 text-base">✦</span><span className="absolute -bottom-2 text-base">✦</span>
    <span className="absolute -left-2 text-base">✧</span><span className="absolute -right-2 text-base">✧</span>
  </div>;
}

function TextCard({ title, text, icon }: { title: string; text: string; icon: ReactNode }) {
  return <section className="rounded-3xl border border-[#d6b6d3]/15 bg-[#1A2235] p-5">
    <h3 className="flex items-center gap-2 font-semibold text-white">{icon}{title}</h3>
    <p className="mt-3 text-sm leading-7 text-white/70">{text}</p>
  </section>;
}

function ListCard({ title, intro, items, icon }: { title: string; intro?: string; items: string[]; icon: ReactNode }) {
  return <section className="rounded-3xl border border-[#d6b6d3]/15 bg-[#1A2235] p-5">
    <h3 className="flex items-center gap-2 font-semibold text-white">{icon}{title}</h3>
    {intro && <p className="mt-3 text-sm leading-7 text-white/70">{intro}</p>}
    <div className="mt-4 space-y-3">{items.map((item) => <p key={item} className="flex gap-3 text-sm leading-6 text-white/70"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#dfbfd8]" />{item}</p>)}</div>
  </section>;
}

export function WitchResultView({ result, template }: { result: WitchResult; template: WitchArchetypeTemplate }) {
  const { profile, details } = template;
  const answerTraits = result.topTraits.filter((trait) => result.scores[trait] > 0);
  const [showPatternInfo, setShowPatternInfo] = useState(false);
  return <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
    <section className="overflow-hidden rounded-3xl border border-[#d6b6d3]/25 bg-[#1A2235] shadow-2xl shadow-black/30">
      <div className="px-5 py-8 text-center" style={{ background: `radial-gradient(circle at 50% 25%, ${profile.color}35, transparent 46%), linear-gradient(155deg, #252438, #151d31 75%)` }}>
        <p className="text-[10px] font-semibold uppercase tracking-[.27em] text-[#dec6dc]">Your symbolic witch archetype</p>
        <div className="mt-6"><WitchSigil symbol={profile.symbol} color={profile.color} /></div>
        <h2 className="mt-5 font-serif text-4xl text-white">{profile.name}</h2>
        <p className="mt-1 text-sm font-semibold" style={{ color: profile.color }}>{profile.subtitle}</p>
        <p className="mx-auto mt-4 max-w-sm text-sm leading-7 text-white/75">{profile.summary}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {[profile.primary, profile.secondary].map((trait) => <span key={trait} className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white/85">{WITCH_TRAIT_LABELS[trait]}</span>)}
        </div>
      </div>
      <div className="p-5">
        <h3 className="flex items-center gap-2 font-semibold text-white"><Sparkles className="h-4 w-4 text-[#dfbfd8]" /> Why this archetype</h3>
        <p className="mt-3 text-sm leading-7 text-white/70">{details.whyThisArchetype}</p>
      </div>
    </section>

    <section className="rounded-3xl border border-[#d6b6d3]/20 bg-[#1A2235] p-5">
      <h3 className="flex items-center justify-between font-semibold text-white">Your Archetype Pattern <button type="button" aria-label="About archetype pattern values" aria-expanded={showPatternInfo} onClick={() => setShowPatternInfo((open) => !open)} className="rounded-full p-1 text-[#dfbfd8] hover:bg-white/10"><Compass className="h-5 w-5" /></button></h3>
      {showPatternInfo && <p className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-xs leading-5 text-white/65">These numbers are an editorial, symbolic profile for the {profile.name}. They show relative emphasis within this archetype and are not measured personal traits.</p>}
      <div className="mt-5 space-y-3">{WITCH_TRAITS.map((trait) => {
        const value = details.qualities[trait];
        return <div key={trait}>
          <div className="mb-1.5 flex justify-between text-xs"><span className="font-medium text-white/75">{WITCH_TRAIT_LABELS[trait]}</span><span className="text-white/45">{value}%</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-black/25"><div className="h-full rounded-full bg-gradient-to-r from-[#ad8ebf] via-[#dfbfd8] to-[#a9b9dc]" style={{ width: `${value}%` }} /></div>
        </div>;
      })}</div>
    </section>

    <section className="rounded-3xl border border-[#d6b6d3]/20 bg-[#1A2235] p-5">
      <h3 className="flex items-center gap-2 font-semibold text-white"><Lightbulb className="h-4 w-4 text-[#e6cba4]" /> Your Quiz Emphasis</h3>
      <div className="mt-4 space-y-4">{answerTraits.map((trait) => <div key={trait}>
        <h4 className="text-xs font-semibold uppercase tracking-[.15em] text-[#dfbfd8]">{WITCH_TRAIT_LABELS[trait]}</h4>
        <p className="mt-1.5 text-sm leading-7 text-white/70">{WITCH_ANSWER_ACCENTS[trait]}</p>
      </div>)}</div>
    </section>

    <section className="rounded-3xl border border-[#d6b6d3]/25 bg-gradient-to-br from-[#2b263c] to-[#1A2235] p-5">
      <h3 className="flex items-center gap-2 font-semibold text-white"><Sparkles className="h-4 w-4 text-[#dfbfd8]" /> Your Craft Signature</h3>
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        {([['Element', details.craftSignature.element], ['Symbol', details.craftSignature.symbol], ['Place', details.craftSignature.setting], ['Intention', details.craftSignature.intention]] as const).map(([label, value]) =>
          <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-3"><p className="text-[10px] uppercase tracking-[.16em] text-[#dfbfd8]">{label}</p><p className="mt-1 text-sm leading-5 text-white/85">{value}</p></div>
        )}
      </div>
    </section>
    <TextCard title="How Your Craft Takes Shape" icon={<Sparkles className="h-4 w-4 text-[#dfbfd8]" />} text={details.innerNature} />
    <ListCard title="Your Working Magic" icon={<Shield className="h-4 w-4 text-[#c4d6b9]" />} intro={profile.gift} items={details.strengths} />
    <TextCard title="When Your Power Flows" icon={<Sparkles className="h-4 w-4 text-[#dfbfd8]" />} text={details.whenAligned} />
    <section className="rounded-3xl border border-[#d6b6d3]/15 bg-[#1A2235] p-5">
      <h3 className="flex items-center gap-2 font-semibold text-white"><Moon className="h-4 w-4 text-[#d8b1cc]" /> When the Spell Unravels</h3>
      <p className="mt-3 text-sm leading-7 text-white/70">{details.emotionalPattern}</p>
      <p className="mt-3 text-sm leading-7 text-white/70">{profile.blindSpot}</p>
      <h4 className="mt-5 text-xs font-semibold uppercase tracking-[.15em] text-[#dfbfd8]">Under pressure</h4>
      <p className="mt-2 text-sm leading-7 text-white/70">{details.underPressure}</p>
      <div className="mt-5 rounded-2xl border border-[#dfbfd8]/20 bg-[#dfbfd8]/5 p-4"><p className="text-xs font-semibold uppercase tracking-[.15em] text-[#dfbfd8]">Shadow inquiry</p><p className="mt-2 text-sm leading-6 text-white/85">{details.shadowQuestion}</p></div>
    </section>
    <TextCard title="At a Crossroads" icon={<Compass className="h-4 w-4 text-[#b7b7e2]" />} text={details.decisionStyle} />
    <section className="rounded-3xl border border-[#d6b6d3]/15 bg-[#1A2235] p-5">
      <h3 className="flex items-center gap-2 font-semibold text-white"><Heart className="h-4 w-4 text-[#e1b6c9]" /> The Circle Around You</h3>
      <p className="mt-3 text-sm leading-7 text-white/70">{profile.relationships}</p>
      <h4 className="mt-5 text-xs font-semibold uppercase tracking-[.15em] text-[#dfbfd8]">In friendship</h4>
      <p className="mt-2 text-sm leading-7 text-white/70">{details.friendship}</p>
      <h4 className="mt-5 text-xs font-semibold uppercase tracking-[.15em] text-[#dfbfd8]">In love</h4>
      <p className="mt-2 text-sm leading-7 text-white/70">{details.love}</p>
    </section>
    <section className="rounded-3xl border border-[#d6b6d3]/15 bg-[#1A2235] p-5">
      <h3 className="flex items-center gap-2 font-semibold text-white"><Briefcase className="h-4 w-4 text-[#b7b7e2]" /> Bringing Your Craft Into the World</h3>
      <p className="mt-3 text-sm leading-7 text-white/70">{profile.work}</p>
      <h4 className="mt-5 text-xs font-semibold uppercase tracking-[.15em] text-[#dfbfd8]">A rhythm that suits you</h4>
      <p className="mt-2 text-sm leading-7 text-white/70">{details.workRhythm}</p>
    </section>
    <section className="rounded-3xl border border-[#d6b6d3]/25 bg-[#1A2235] p-5">
      <h3 className="flex items-center gap-2 font-semibold text-white"><Moon className="h-4 w-4 text-[#dfbfd8]" /> A Ritual for Your Archetype</h3>
      <p className="mt-3 font-serif text-lg text-white">{details.ritual.title}</p>
      <ol className="mt-4 space-y-3">{details.ritual.steps.map((step, index) => <li key={step} className="flex gap-3 text-sm leading-6 text-white/75"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#dfbfd8]/15 text-xs font-semibold text-[#dfbfd8]">{index + 1}</span>{step}</li>)}</ol>
    </section>
    <TextCard title="What Your Craft Asks You to Learn" icon={<Lightbulb className="h-4 w-4 text-[#e6cba4]" />} text={details.growthFocus} />
    <ListCard title="Keep the Practice Alive" icon={<Leaf className="h-4 w-4 text-[#b6d3bb]" />} intro={profile.practice} items={details.dailyPractices} />
    <section className="rounded-3xl border border-[#d6b6d3]/25 bg-gradient-to-br from-[#d6b6d3]/15 via-[#937ab0]/10 to-[#293b54]/15 p-5 text-center">
      <p className="text-[10px] uppercase tracking-[.24em] text-[#ddc6dc]">Your affirmation</p>
      <p className="mt-3 text-lg font-semibold leading-8 text-white">“{details.affirmation}”</p>
    </section>
    <section className="rounded-3xl border border-[#d6b6d3]/25 bg-gradient-to-br from-[#d6b6d3]/15 via-[#937ab0]/10 to-[#293b54]/15 p-5 text-center">
      <p className="text-[10px] uppercase tracking-[.24em] text-[#ddc6dc]">A question for your path</p>
      <p className="mt-3 font-serif text-xl leading-8 text-white">“{profile.reflection}”</p>
    </section>
    <ReportDisclaimer />
  </motion.div>;
}

export default function WitchArchetypeReport({ preview }: { preview?: { submit: (answers: Record<string, string>) => { result: WitchResult; template: WitchArchetypeTemplate } } }) {
  const [access, setAccess] = useState<"loading" | "allowed" | "locked" | "login">("loading");
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (advanceTimer.current) clearTimeout(advanceTimer.current); }, []);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<WitchResult | null>(null);
  const [template, setTemplate] = useState<WitchArchetypeTemplate | null>(null);
  const [error, setError] = useState("");
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const question = WITCH_QUESTIONS[step];
  const answeredCount = WITCH_QUESTIONS.filter((item) => !!answers[item.id]).length;

  useEffect(() => {
    async function load() {
      try {
        if (preview) { setAccess("allowed"); return; }
        const response = await fetch("/api/witch-archetype", { cache: "no-store" });
        if (response.status === 401) { setAccess("login"); return; }
        if (response.status === 403) { setAccess("locked"); return; }
        if (!response.ok) throw new Error("Unable to load your Witch Archetype Report right now.");
        setAccess("allowed");
        const data = await response.json();
        if (isWitchResult(data.result)) {
          if (!isWitchTemplate(data.template, data.result.key)) throw new Error("This archetype report template is unavailable.");
          setResult(data.result); setTemplate(data.template);
        }
      } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load your report."); }
      finally { setLoading(false); }
    }
    load();
  }, [preview]);

  async function submit(nextAnswers: Record<string, string>) {
    setIsSubmitting(true); setError("");
    try {
      if (preview) {
        const scored = preview.submit(nextAnswers);
        setResult(scored.result); setTemplate(scored.template);
      } else {
        const response = await fetch("/api/witch-archetype", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers: nextAnswers }) });
        if (response.status === 401) { setAccess("login"); return; }
        if (response.status === 403) { setAccess("locked"); return; }
        const data = await response.json();
        if (!response.ok || !isWitchResult(data.result) || !isWitchTemplate(data.template, data.result.key)) throw new Error(data.message || "Unable to save your report.");
        setResult(data.result);
        setTemplate(data.template);
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to save your report."); }
    finally { setIsSubmitting(false); setIsAdvancing(false); }
  }

  function selectOption(optionId: string) {
    if (isAdvancing || isSubmitting || !question) return;
    const nextAnswers = { ...answers, [question.id]: optionId };
    setAnswers(nextAnswers);
    setIsAdvancing(true);
    advanceTimer.current = setTimeout(() => {
      if (step === WITCH_QUESTIONS.length - 1) submit(nextAnswers);
      else { setStep((value) => value + 1); setIsAdvancing(false); }
    }, 180);
  }

  if (access === "locked" || access === "login") {
    return <main className="min-h-screen bg-[#0A0E1A] px-4 py-5 text-white"><div className="mx-auto max-w-md">
      <Link href="/reports" className="mb-4 inline-flex items-center gap-2 text-sm text-white/75"><ArrowLeft className="h-4 w-4" /> Reports</Link>
      <section className="rounded-3xl border border-[#d6b6d3]/25 bg-[#1A2235] p-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#d6b6d3]/10"><Lock className="h-6 w-6 text-[#dfbfd8]" /></div>
        <h1 className="mt-4 text-xl font-semibold">{access === "login" ? "Sign in to your report" : "Witch Archetype Report is locked"}</h1>
        <p className="mt-2 text-sm text-white/60">{access === "login" ? "Sign in with your purchase email to securely open your report." : "Unlock it from Reports to discover your archetype."}</p>
        <Link href={access === "login" ? "/login?next=/witch-archetype" : "/reports"} className="mt-5 block w-full rounded-2xl bg-[#dfbfd8] px-4 py-3 font-semibold text-[#261a2b]">{access === "login" ? "Sign in" : "Back to Reports"}</Link>
      </section>
    </div></main>;
  }

  return <main className="min-h-screen bg-[#0a0a0f] text-white"><div className="mx-auto min-h-screen w-full max-w-md bg-[#0A0E1A] shadow-2xl shadow-black/50">
    <header className="sticky top-0 z-30 flex items-center border-b border-[#d6b6d3]/15 bg-[#0A0E1A]/95 px-4 py-3 backdrop-blur-sm">
      <Link href="/reports" aria-label="Back to reports" className="flex h-10 w-10 items-center justify-center"><ArrowLeft className="h-5 w-5" /></Link>
      <div className="flex-1 pr-10 text-center"><h1 className="font-semibold">Witch Archetype</h1><p className="text-[10px] uppercase tracking-[.22em] text-[#d7b8d1]">Symbolic archetype report</p></div>
    </header>
    <div className="space-y-4 px-4 py-5">
      {loading && <div className="flex min-h-[70vh] items-center justify-center text-center"><div><Loader2 className="mx-auto h-10 w-10 animate-spin text-[#dfbfd8]" /><p className="mt-4 text-sm text-white/60">Opening your report...</p></div></div>}
      {!loading && error && !result && <section className="rounded-3xl border border-red-400/25 bg-red-500/10 p-5 text-center"><p role="alert" className="text-sm text-red-100">{error}</p>{answeredCount === WITCH_QUESTIONS.length && <button onClick={() => submit(answers)} disabled={isSubmitting} className="mt-4 block w-full rounded-2xl bg-[#dfbfd8] px-4 py-3 text-sm font-semibold text-[#261a2b]">Retry saving my result</button>}<Link href="/reports" className="mt-4 block w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold">Back to Reports</Link></section>}
      {!loading && !result && !error && <section className="rounded-2xl border border-[#d6b6d3]/25 bg-[#1A2235] p-3.5 shadow-xl shadow-black/30">
        <div className="flex justify-between text-[11px] text-white/50"><span>Question {step + 1} of {WITCH_QUESTIONS.length}</span><span>{Math.round(answeredCount / WITCH_QUESTIONS.length * 100)}%</span></div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full rounded-full bg-gradient-to-r from-[#ad8ebf] via-[#dfbfd8] to-[#a9b9dc]" animate={{ width: `${answeredCount / WITCH_QUESTIONS.length * 100}%` }} /></div>
        <AnimatePresence mode="wait"><motion.div key={question.id} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -18 }} className="mt-4">
          <div className="flex gap-2.5"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#d6b6d3]/25 bg-[#d6b6d3]/15"><Moon className="h-4 w-4 text-[#dfbfd8]" /></div><div><h2 className="text-[17px] font-semibold leading-6">{question.prompt}</h2><p className="mt-1.5 text-[11px] leading-4 text-white/50">{question.note}</p></div></div>
          <div className="mt-4 space-y-2">{question.options.map((option, index) => { const selected = answers[question.id] === option.id; return <button key={option.id} onClick={() => selectOption(option.id)} disabled={isAdvancing || isSubmitting} className={`w-full rounded-xl border p-3 text-left transition ${selected ? "border-[#dfbfd8] bg-[#dfbfd8]/15 shadow-lg shadow-[#dfbfd8]/10" : "border-white/10 bg-black/20 hover:border-[#dfbfd8]/40 hover:bg-white/5"}`}><span className="flex items-start gap-2.5"><span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${selected ? "border-[#dfbfd8] bg-[#dfbfd8] text-[#261a2b]" : "border-white/20 text-white/50"}`}>{selected ? <Check className="h-3 w-3" /> : String.fromCharCode(65 + index)}</span><span className="text-[13px] font-medium leading-5 text-white/80">{option.text}</span></span></button>; })}</div>
        </motion.div></AnimatePresence>
        <button onClick={() => { setStep((value) => Math.max(0, value - 1)); setIsAdvancing(false); }} disabled={step === 0 || isSubmitting || isAdvancing} className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 text-xs disabled:opacity-30"><ChevronLeft className="h-4 w-4" /> Back</button>
        <ReportDisclaimer className="mt-3" />
      </section>}
      {!loading && result && template && <WitchResultView result={result} template={template} />}
    </div>
  </div></main>;
}
