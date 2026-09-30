"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle,
  Compass,
  Gem,
  Hash,
  Heart,
  Loader2,
  Lock,
  Moon,
  PiggyBank,
  Shield,
  Sparkles,
  Star,
  Sun,
  Waves,
} from "lucide-react";
import ReportDisclaimer from "@/components/ReportDisclaimer";
import { getBirthDateParts } from "@/lib/birth-details";
import { calculateNumerologyReport, type NumerologyReport } from "@/lib/numerology-report";
import { supabase } from "@/lib/supabase";
import { useOnboardingStore } from "@/lib/onboarding-store";
import { useUserStore } from "@/lib/user-store";

const birthFormMonths = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const tabs = [
  { id: "overview", label: "Core" },
  { id: "life", label: "Life" },
  { id: "lucky", label: "Lucky" },
  { id: "remedies", label: "Remedies" },
] as const;

type TabId = (typeof tabs)[number]["id"];

interface NumerologyDetailsFormState {
  name: string;
  birthMonth: string;
  birthDay: string;
  birthYear: string;
}

const defaultFormState: NumerologyDetailsFormState = {
  name: "",
  birthMonth: "January",
  birthDay: "1",
  birthYear: "2000",
};

function normalizeFormState(row: Record<string, unknown> | null | undefined, fallbackName = ""): NumerologyDetailsFormState | null {
  if (!row) return null;
  if (!(row.name || row.birth_month || row.birth_day || row.birth_year)) return null;

  return {
    name: String(row.name || fallbackName || ""),
    birthMonth: String(row.birth_month || defaultFormState.birthMonth),
    birthDay: String(row.birth_day || defaultFormState.birthDay),
    birthYear: String(row.birth_year || defaultFormState.birthYear),
  };
}

function getReportInput(details: NumerologyDetailsFormState) {
  const parts = getBirthDateParts({
    birthMonth: details.birthMonth,
    birthDay: details.birthDay,
    birthYear: details.birthYear,
  });

  if (!parts || !details.name.trim()) return null;

  return {
    name: details.name.trim(),
    birthDay: parts.day,
    birthMonth: parts.month,
    birthYear: parts.year,
  };
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-white/65">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full rounded-xl border border-white/15 bg-white/10 px-3 text-sm text-white outline-none transition-colors focus:border-primary"
      >
        {children}
      </select>
    </label>
  );
}

function NumberBadge({ value, accent = "from-amber-400 to-rose-500" }: { value: number; accent?: string }) {
  return (
    <div className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${accent} text-3xl font-black text-white shadow-lg shadow-black/30`}>
      {value}
    </div>
  );
}

function DetailBlock({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <motion.section
      variants={{
        hidden: { opacity: 0, y: 12 },
        visible: { opacity: 1, y: 0 },
      }}
      className="rounded-2xl border border-white/10 bg-white/[0.045] p-4"
    >
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-amber-200">
          {icon}
        </div>
        <h2 className="text-base font-semibold text-white">{title}</h2>
      </div>
      {children}
    </motion.section>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item} className="flex gap-2 text-sm leading-relaxed text-white/72">
          <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-300" />
          <p>{item}</p>
        </div>
      ))}
    </div>
  );
}

function parseCompatibilityItems(items: string[]) {
  const supportive = items.find((item) => item.startsWith("Supportive numbers:"));
  const challenging = items.find((item) => item.startsWith("Challenging numbers:"));
  const supportiveIndex = supportive ? items.indexOf(supportive) : -1;
  const challengingIndex = challenging ? items.indexOf(challenging) : -1;
  const relationshipNotes = challengingIndex >= 0 ? items.slice(challengingIndex + 1) : [];

  const extractNumbers = (item?: string) => item?.match(/\d+/g)?.map(Number) || [];
  const stripLead = (item: string) => item.replace(/^(Supportive|Challenging) numbers:\s*[^.]+.\s*/i, "");

  return {
    supportive: {
      numbers: extractNumbers(supportive),
      description: supportive ? stripLead(supportive) : "",
      points:
        supportiveIndex >= 0 && challengingIndex > supportiveIndex
          ? items.slice(supportiveIndex + 1, challengingIndex)
          : [],
    },
    challenging: {
      numbers: extractNumbers(challenging),
      description: challenging ? stripLead(challenging) : "",
      points: [],
    },
    relationshipNotes: {
      numbers: Array.from(new Set(relationshipNotes.flatMap((item) => extractNumbers(item)))),
      points: relationshipNotes,
    },
  };
}

function CompatibilityGroup({
  title,
  tone,
  numbers,
  description,
  points,
}: {
  title: string;
  tone: "supportive" | "challenging";
  numbers: number[];
  description: string;
  points: string[];
}) {
  const colorClass =
    tone === "supportive"
      ? "border-emerald-300/15 bg-emerald-300/[0.06] text-emerald-100"
      : "border-amber-300/15 bg-amber-300/[0.06] text-amber-100";
  const iconClass = tone === "supportive" ? "text-emerald-300" : "text-amber-300";

  return (
    <div className="rounded-2xl border border-white/10 bg-[#111827]/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-white">{title}</p>
        <div className="flex flex-wrap gap-1.5">
          {numbers.map((number) => (
            <span
              key={`${title}-${number}`}
              className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm font-black ${colorClass}`}
            >
              {number}
            </span>
          ))}
        </div>
      </div>

      {description && <p className="mt-3 text-sm leading-relaxed text-white/68">{description}</p>}

      {points.length > 0 && (
        <div className="mt-3 space-y-2">
          {points.map((point) => (
            <div key={point} className="flex gap-2 text-sm leading-relaxed text-white/72">
              <CheckCircle className={`mt-0.5 h-4 w-4 flex-shrink-0 ${iconClass}`} />
              <p>{point}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CompatibilityNote({ numbers, points }: { numbers: number[]; points: string[] }) {
  if (points.length === 0) return null;

  return (
    <div className="rounded-2xl border border-sky-300/15 bg-sky-300/[0.055] p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-white">Friendly Notes</p>
        {numbers.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {numbers.map((number) => (
              <span
                key={`friendly-${number}`}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-sky-300/15 bg-sky-300/[0.08] text-sm font-black text-sky-100"
              >
                {number}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {points.map((point) => (
          <div key={point} className="flex gap-2 text-sm leading-relaxed text-white/72">
            <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-sky-300" />
            <p>{point}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function CompatibilitySection({ items }: { items: string[] }) {
  const compatibility = parseCompatibilityItems(items);

  return (
    <div className="space-y-3">
      <CompatibilityGroup
        title="Supportive Numbers"
        tone="supportive"
        numbers={compatibility.supportive.numbers}
        description={compatibility.supportive.description}
        points={compatibility.supportive.points}
      />
      <CompatibilityGroup
        title="Challenging Numbers"
        tone="challenging"
        numbers={compatibility.challenging.numbers}
        description={compatibility.challenging.description}
        points={compatibility.challenging.points}
      />
      <CompatibilityNote
        numbers={compatibility.relationshipNotes.numbers}
        points={compatibility.relationshipNotes.points}
      />
    </div>
  );
}

function FavorableRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#111827]/80 px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">{label}</p>
      <p className="mt-1 text-sm font-semibold leading-snug text-white">{value}</p>
    </div>
  );
}

function ReportHero({ report }: { report: NumerologyReport }) {
  const radical = report.coreNumbers[0];
  const destiny = report.coreNumbers[1];
  const name = report.coreNumbers[2];

  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#15101f] px-5 py-6"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(251,191,36,0.18),transparent_32%),radial-gradient(circle_at_85%_20%,rgba(168,85,247,0.2),transparent_34%),linear-gradient(135deg,rgba(225,29,72,0.25),rgba(15,23,42,0.25))]" />
      <div className="relative">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-amber-100/70">
              Ank Jyotish
            </p>
            <h1 className="mt-3 text-3xl font-black leading-tight text-white">
              Numerology Report
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-white/68">
              {report.name} • {report.birthDateLabel}
            </p>
          </div>
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10">
            <Hash className="h-7 w-7 text-amber-200" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Mulank", number: radical.value, accent: "from-orange-500 to-rose-500" },
            { label: "Bhagyank", number: destiny.value, accent: "from-amber-400 to-yellow-500" },
            { label: "Namank", number: name.value, accent: "from-sky-500 to-cyan-500" },
          ].map((item) => (
            <div key={item.label} className="rounded-2xl border border-white/10 bg-black/20 p-3 text-center">
              <div className={`mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${item.accent} text-2xl font-black text-white`}>
                {item.number}
              </div>
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55">{item.label}</p>
            </div>
          ))}
        </div>
      </div>
    </motion.section>
  );
}

function LockedState() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <div className="flex h-screen w-full max-w-md flex-col bg-[#0A0E1A]">
        <div className="sticky top-0 z-40 border-b border-white/10 bg-[#0A0E1A]/95 px-4 py-4 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <Link href="/reports" aria-label="Back to reports" className="flex h-10 w-10 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-lg font-semibold text-white">Numerology Report</h1>
            <div className="h-10 w-10" />
          </div>
        </div>
        <div className="flex flex-1 items-center px-6">
          <div className="w-full rounded-[28px] border border-white/12 bg-white/[0.045] p-6 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl border border-white/10 bg-white/10">
              <Lock className="h-9 w-9 text-primary" />
            </div>
            <h2 className="mt-5 text-2xl font-bold text-white">Unlock Numerology Report</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/60">
              Get your Mulank, Bhagyank, Name Number, compatibility numbers, remedies, and detailed life guidance.
            </p>
            <Link
              href="/reports"
              className="mt-6 flex h-14 w-full items-center justify-center rounded-2xl bg-gradient-to-r from-primary to-purple-600 px-4 py-3 font-semibold text-white transition-opacity hover:opacity-90"
            >
              Back to Reports
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NumerologyPage() {
  const { unlockedFeatures } = useUserStore();
  const {
    birthMonth: storeBirthMonth,
    birthDay: storeBirthDay,
    birthYear: storeBirthYear,
    setBirthDate,
  } = useOnboardingStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [hasConfirmedDetails, setHasConfirmedDetails] = useState(false);
  const [details, setDetails] = useState<NumerologyDetailsFormState>({
    ...defaultFormState,
    birthMonth: storeBirthMonth || defaultFormState.birthMonth,
    birthDay: storeBirthDay || defaultFormState.birthDay,
    birthYear: storeBirthYear || defaultFormState.birthYear,
  });

  const reportInput = useMemo(() => (hasConfirmedDetails ? getReportInput(details) : null), [details, hasConfirmedDetails]);
  const report = useMemo(() => (reportInput ? calculateNumerologyReport(reportInput) : null), [reportInput]);

  const updateDetails = (updates: Partial<NumerologyDetailsFormState>) => {
    setDetails((current) => ({ ...current, ...updates }));
  };

  const loadDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const userId = localStorage.getItem("astrorekha_user_id") || "";
      const fallbackName = localStorage.getItem("astrorekha_name") || "";
      let resolved: NumerologyDetailsFormState | null = null;
      let hasPersistedBirthDate = false;

      if (userId) {
        try {
          const { data: userData } = await supabase
            .from("users")
            .select("name, birth_month, birth_day, birth_year")
            .eq("id", userId)
            .maybeSingle();

          resolved = normalizeFormState(userData, fallbackName);
          hasPersistedBirthDate = !!getBirthDateParts({
            birthMonth: userData?.birth_month,
            birthDay: userData?.birth_day,
            birthYear: userData?.birth_year,
          });
        } catch (err) {
          console.error("Failed to load numerology user details:", err);
        }

        if (!hasPersistedBirthDate) {
          try {
            const { data: profileData } = await supabase
              .from("user_profiles")
              .select("birth_month, birth_day, birth_year")
              .eq("id", userId)
              .maybeSingle();

            const profileDetails = normalizeFormState(profileData, resolved?.name || fallbackName);
            resolved = profileDetails || resolved;
            hasPersistedBirthDate = !!getBirthDateParts({
              birthMonth: profileData?.birth_month,
              birthDay: profileData?.birth_day,
              birthYear: profileData?.birth_year,
            });
          } catch (err) {
            console.error("Failed to load numerology profile details:", err);
          }
        }
      }

      const nextDetails = {
        name: resolved?.name || fallbackName,
        birthMonth: resolved?.birthMonth || storeBirthMonth || defaultFormState.birthMonth,
        birthDay: resolved?.birthDay || storeBirthDay || defaultFormState.birthDay,
        birthYear: resolved?.birthYear || storeBirthYear || defaultFormState.birthYear,
      };

      setDetails(nextDetails);
      setHasConfirmedDetails(!!getReportInput(nextDetails) && hasPersistedBirthDate);
    } finally {
      setLoading(false);
    }
  }, [storeBirthDay, storeBirthMonth, storeBirthYear]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  const saveDetails = async () => {
    const input = getReportInput(details);
    if (!input) {
      setError("Please add a valid name and birth date.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      const userId = localStorage.getItem("astrorekha_user_id") || "";
      const email = (localStorage.getItem("astrorekha_email") || "").trim().toLowerCase();
      const birthPayload = {
        birth_month: details.birthMonth,
        birth_day: details.birthDay,
        birth_year: details.birthYear,
        updated_at: new Date().toISOString(),
      };

      localStorage.setItem("astrorekha_name", input.name);
      setBirthDate(details.birthMonth, details.birthDay, details.birthYear);

      if (userId) {
        const { error: userError } = await supabase
          .from("users")
          .update({
            name: input.name,
            ...birthPayload,
          })
          .eq("id", userId);

        if (userError) console.error("Failed to save numerology user details:", userError);

        const { error: profileError } = await supabase
          .from("user_profiles")
          .upsert({
            id: userId,
            ...(email ? { email } : {}),
            ...birthPayload,
          });

        if (profileError) console.error("Failed to save numerology profile details:", profileError);
      }

      setHasConfirmedDetails(true);
    } finally {
      setSaving(false);
    }
  };

  if (!unlockedFeatures.numerologyReport) {
    return <LockedState />;
  }

  const isMissingDetails = !report;

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <div className="flex h-screen w-full max-w-md flex-col overflow-hidden bg-[#0A0E1A] shadow-2xl shadow-black/50">
        <div className="sticky top-0 z-40 border-b border-white/10 bg-[#0A0E1A]/95 px-4 py-4 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <Link
              href="/reports"
              aria-label="Back to reports"
              className="flex h-10 w-10 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-lg font-semibold text-white">Numerology Report</h1>
            <div className="h-10 w-10" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
          ) : isMissingDetails ? (
            <div className="px-4 py-5">
              <div className="rounded-[28px] border border-white/12 bg-white/[0.045] p-5 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10">
                  <Hash className="h-8 w-8 text-amber-200" />
                </div>
                <h2 className="mt-4 text-xl font-bold text-white">Details Required</h2>
                <p className="mt-2 text-sm leading-relaxed text-white/60">
                  Numerology needs your full name and birth date to calculate your numbers.
                </p>
              </div>

              <div className="mt-4 rounded-2xl border border-white/12 bg-[#151c2f] p-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-white/65">Full Name</span>
                  <input
                    value={details.name}
                    onChange={(event) => updateDetails({ name: event.target.value })}
                    placeholder="Enter your full name"
                    className="h-12 w-full rounded-xl border border-white/15 bg-white/10 px-3 text-sm text-white outline-none transition-colors placeholder:text-white/35 focus:border-primary"
                  />
                </label>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <SelectField label="Month" value={details.birthMonth} onChange={(value) => updateDetails({ birthMonth: value })}>
                    {birthFormMonths.map((month) => (
                      <option key={month} value={month} className="bg-[#111827] text-white">
                        {month}
                      </option>
                    ))}
                  </SelectField>
                  <SelectField label="Day" value={details.birthDay} onChange={(value) => updateDetails({ birthDay: value })}>
                    {Array.from({ length: 31 }, (_, index) => String(index + 1)).map((day) => (
                      <option key={day} value={day} className="bg-[#111827] text-white">
                        {day}
                      </option>
                    ))}
                  </SelectField>
                  <SelectField label="Year" value={details.birthYear} onChange={(value) => updateDetails({ birthYear: value })}>
                    {Array.from({ length: 110 }, (_, index) => String(new Date().getFullYear() - index)).map((year) => (
                      <option key={year} value={year} className="bg-[#111827] text-white">
                        {year}
                      </option>
                    ))}
                  </SelectField>
                </div>

                {error && (
                  <div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                    {error}
                  </div>
                )}

                <button
                  onClick={saveDetails}
                  disabled={saving}
                  className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-primary to-purple-600 px-4 py-3 font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                  Create Numerology Report
                </button>
              </div>
            </div>
          ) : (
            <motion.main
              initial="hidden"
              animate="visible"
              transition={{ staggerChildren: 0.06 }}
              className="space-y-5 px-4 py-5 pb-24"
            >
              <ReportHero report={report} />

              <div className="sticky top-0 z-30 -mx-4 border-b border-white/10 bg-[#0A0E1A]/95 px-4 py-3 backdrop-blur-sm">
                <div className="grid grid-cols-4 rounded-2xl border border-white/10 bg-white/[0.045] p-1">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`h-10 rounded-xl text-xs font-semibold transition-all ${
                        activeTab === tab.id
                          ? "bg-white text-[#0A0E1A] shadow-lg shadow-black/20"
                          : "text-white/55 hover:text-white"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {activeTab === "overview" && (
                <>
                  <DetailBlock icon={<Hash className="h-5 w-5" />} title="Your Core Numbers">
                    <div className="space-y-3">
                      {report.coreNumbers.map((number, index) => (
                        <div key={number.key} className="rounded-2xl border border-white/10 bg-[#111827]/80 p-3">
                          <div className="flex gap-3">
                            <NumberBadge
                              value={number.value}
                              accent={
                                index === 0
                                  ? "from-orange-500 to-rose-500"
                                  : index === 1
                                  ? "from-amber-400 to-yellow-500"
                                  : index === 2
                                  ? "from-sky-500 to-cyan-500"
                                  : "from-violet-500 to-fuchsia-500"
                              }
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-white">{number.label}</p>
                              <p className="text-xs font-semibold text-amber-100/60">{number.sanskritLabel}</p>
                            </div>
                          </div>
                          <p className="mt-3 text-sm leading-relaxed text-white/70">{number.summary}</p>
                        </div>
                      ))}
                    </div>
                  </DetailBlock>

                  <DetailBlock icon={<Sun className="h-5 w-5" />} title="Main Personality Signature">
                    <div className="flex gap-4">
                      <NumberBadge value={report.primary.number} />
                      <div>
                        <p className="text-lg font-bold text-white">{report.primary.title}</p>
                        <p className="text-sm text-amber-100/65">{report.primary.archetype}</p>
                        <p className="mt-3 text-sm leading-relaxed text-white/72">{report.primary.short}</p>
                      </div>
                    </div>
                  </DetailBlock>
                </>
              )}

              {activeTab === "life" && (
                <>
                  <DetailBlock icon={<Star className="h-5 w-5" />} title="Characteristics">
                    <BulletList items={report.lifeSections.characteristics} />
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-200/70">Strengths</p>
                        <BulletList items={report.primary.strengths} />
                      </div>
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-rose-200/70">Watch</p>
                        <BulletList items={report.primary.cautions} />
                      </div>
                    </div>
                  </DetailBlock>

                  <DetailBlock icon={<Waves className="h-5 w-5" />} title="Health">
                    <BulletList items={report.lifeSections.health} />
                  </DetailBlock>

                  <DetailBlock icon={<PiggyBank className="h-5 w-5" />} title="Wealth">
                    <BulletList items={report.lifeSections.wealth} />
                  </DetailBlock>

                  <DetailBlock icon={<Heart className="h-5 w-5" />} title="Happiness">
                    <BulletList items={report.lifeSections.happiness} />
                  </DetailBlock>
                </>
              )}

              {activeTab === "lucky" && (
                <>
                  <DetailBlock icon={<Compass className="h-5 w-5" />} title="Favourable Details">
                    <div className="grid grid-cols-2 gap-3">
                      <FavorableRow label="Sign" value={report.favorable.signs} />
                      <FavorableRow label="Alphabets" value={report.favorable.alphabets} />
                      <FavorableRow label="Gemstone" value={report.favorable.gemstone} />
                      <FavorableRow label="Days" value={report.favorable.days} />
                      <FavorableRow label="Direction" value={report.favorable.direction} />
                      <FavorableRow label="Planet" value={report.favorable.planet} />
                      <FavorableRow label="God/Goddess" value={report.favorable.deity} />
                      <FavorableRow label="Fast" value={report.favorable.fast} />
                    </div>
                  </DetailBlock>

                  <DetailBlock icon={<CalendarDays className="h-5 w-5" />} title="Favourable Dates">
                    <p className="text-lg font-bold text-white">{report.favorable.dates}</p>
                    <p className="mt-3 text-sm leading-relaxed text-white/65">
                      These dates are useful for starting conversations, launches, purchases, and personal commitments when the practical situation also supports it.
                    </p>
                  </DetailBlock>

                  <DetailBlock icon={<Heart className="h-5 w-5" />} title="Compatibility Numbers">
                    <CompatibilitySection items={report.lifeSections.compatibility} />
                  </DetailBlock>
                </>
              )}

              {activeTab === "remedies" && (
                <>
                  <DetailBlock icon={<Moon className="h-5 w-5" />} title="Auspicious Place & Direction">
                    <p className="text-sm leading-relaxed text-white/72">{report.favorable.place}</p>
                  </DetailBlock>

                  <DetailBlock icon={<CalendarDays className="h-5 w-5" />} title="Auspicious Time">
                    <p className="text-sm leading-relaxed text-white/72">{report.favorable.time}</p>
                  </DetailBlock>

                  <DetailBlock icon={<Gem className="h-5 w-5" />} title="Mantra">
                    <p className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-base font-semibold leading-relaxed text-amber-100">
                      {report.favorable.mantra}
                    </p>
                  </DetailBlock>

                  <DetailBlock icon={<Shield className="h-5 w-5" />} title="Fasts & Remedies">
                    <BulletList items={report.favorable.remedies} />
                  </DetailBlock>

                  <DetailBlock icon={<Sparkles className="h-5 w-5" />} title="Date Awareness">
                    <BulletList items={report.lifeSections.awareness} />
                  </DetailBlock>
                </>
              )}

              <ReportDisclaimer text="This Numerology Report is a symbolic self-reflection guide based on traditional numerology. It is not medical, legal, financial, psychological, or professional advice." />
            </motion.main>
          )}
        </div>
      </div>
    </div>
  );
}
