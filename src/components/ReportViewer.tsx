"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";

const SECTIONS = [
  { key: "ascendant_nature", title: "Your Ascendant & Core Nature", icon: "⬆" },
  { key: "moon_emotional", title: "Moon Sign & Emotional World", icon: "🌙" },
  { key: "life_predictions", title: "Life Predictions & Destiny", icon: "✨" },
  { key: "career", title: "Career & Profession", icon: "💼" },
  { key: "relationships", title: "Love, Marriage & Relationships", icon: "💫" },
  { key: "wealth", title: "Wealth & Finance", icon: "🪙" },
  { key: "health", title: "Health & Vitality", icon: "🌿" },
  { key: "current_dasha", title: "Your Current Planetary Period", icon: "🔮" },
  { key: "strengths_challenges", title: "Strengths & Challenges", icon: "⚖️" },
  { key: "guidance_remedies", title: "Guidance & Remedies", icon: "🧭" },
] as const;

interface ReportViewerProps {
  report: {
    report_id?: string;
    id?: string;
    sections: Record<string, string>;
    generated_at?: string;
    chart_details?: {
      basic_details?: Array<{ label: string; value: string }>;
      astro_details?: Array<{ label: string; value: string }>;
      planetary_positions?: Array<{
        planet: string;
        sign: string;
        house: string;
        nakshatra: string;
        pada: string;
      }>;
      lagna_chart_svg?: string | null;
      navamsa_chart_svg?: string | null;
    };
  };
  onRegenerate?: () => Promise<void>;
}

function formatDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function cleanupMarkdown(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .trim();
}

function getReadableParagraphs(rawText: string): string[] {
  const cleaned = cleanupMarkdown(rawText);
  return cleaned
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\n+/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function removeTitleEcho(paragraphs: string[], sectionTitle: string): string[] {
  if (paragraphs.length === 0) return paragraphs;
  const first = paragraphs[0].toLowerCase().replace(/[^\w\s&]/g, "").trim();
  const title = sectionTitle.toLowerCase().replace(/[^\w\s&]/g, "").trim();
  if (first === title) return paragraphs.slice(1);
  return paragraphs;
}

export default function ReportViewer({ report, onRegenerate }: ReportViewerProps) {
  const [isRegenerating, setIsRegenerating] = useState(false);

  const generatedAt = useMemo(() => formatDate(report.generated_at), [report.generated_at]);

  const handleRegenerate = async () => {
    if (!onRegenerate || isRegenerating) return;
    setIsRegenerating(true);
    try {
      await onRegenerate();
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div className="space-y-4 pb-10">
      <div className="bg-gradient-to-br from-[#1A1F2E] to-[#171425] rounded-2xl border border-white/10 p-5">
        <h1 className="text-white text-xl font-semibold">Your Detailed Birth Chart Report</h1>
        <p className="text-white/60 text-sm mt-1">Generated on {generatedAt}</p>
      </div>

      {(report.chart_details?.lagna_chart_svg || report.chart_details?.navamsa_chart_svg) && (
        <section className="bg-[#1A1F2E] rounded-2xl border border-white/10 p-5">
          <div className="flex items-center gap-2 text-amber-300 mb-3">
            <span className="text-lg leading-none">🧿</span>
            <h2 className="text-base font-semibold">Chart Visuals</h2>
          </div>
          <div className="h-px w-full bg-white/10 mb-4" />
          <div className="grid grid-cols-1 gap-4">
            {report.chart_details?.lagna_chart_svg && (
              <div className="rounded-xl border border-white/10 p-3 bg-white">
                <p className="text-xs text-slate-600 font-semibold mb-2">Lagna Chart</p>
                <div
                  className="w-full aspect-square [&_svg]:w-full [&_svg]:h-full"
                  dangerouslySetInnerHTML={{ __html: report.chart_details.lagna_chart_svg }}
                />
              </div>
            )}
            {report.chart_details?.navamsa_chart_svg && (
              <div className="rounded-xl border border-white/10 p-3 bg-white">
                <p className="text-xs text-slate-600 font-semibold mb-2">Navamsa Chart</p>
                <div
                  className="w-full aspect-square [&_svg]:w-full [&_svg]:h-full"
                  dangerouslySetInnerHTML={{ __html: report.chart_details.navamsa_chart_svg }}
                />
              </div>
            )}
          </div>
        </section>
      )}

      {(report.chart_details?.basic_details || report.chart_details?.astro_details) && (
        <section className="bg-[#1A1F2E] rounded-2xl border border-white/10 p-5">
          <div className="flex items-center gap-2 text-amber-300 mb-3">
            <span className="text-lg leading-none">📜</span>
            <h2 className="text-base font-semibold">Traditional Birth Snapshot</h2>
          </div>
          <div className="h-px w-full bg-white/10 mb-4" />

          <div className="grid grid-cols-1 gap-4">
            {report.chart_details?.basic_details && (
              <div className="rounded-xl border border-white/10 overflow-hidden">
                <div className="px-3 py-2 bg-white/5 text-white/90 text-sm font-semibold">
                  Basic Details
                </div>
                <div className="divide-y divide-white/5">
                  {report.chart_details.basic_details.map((row) => (
                    <div key={`basic-${row.label}`} className="grid grid-cols-[42%_58%] px-3 py-2 text-sm">
                      <span className="text-white/60">{row.label}</span>
                      <span className="text-white">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {report.chart_details?.astro_details && (
              <div className="rounded-xl border border-white/10 overflow-hidden">
                <div className="px-3 py-2 bg-white/5 text-white/90 text-sm font-semibold">
                  Astro Details
                </div>
                <div className="divide-y divide-white/5">
                  {report.chart_details.astro_details.map((row) => (
                    <div key={`astro-${row.label}`} className="grid grid-cols-[42%_58%] px-3 py-2 text-sm">
                      <span className="text-white/60">{row.label}</span>
                      <span className="text-white">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {!!report.chart_details?.planetary_positions?.length && (
        <section className="bg-[#1A1F2E] rounded-2xl border border-white/10 p-5">
          <div className="flex items-center gap-2 text-amber-300 mb-3">
            <span className="text-lg leading-none">🪐</span>
            <h2 className="text-base font-semibold">Planetary Positions</h2>
          </div>
          <div className="h-px w-full bg-white/10 mb-4" />

          <div className="rounded-xl border border-white/10 overflow-hidden">
            <div className="grid grid-cols-5 gap-2 px-3 py-2 bg-white/5 text-[11px] font-semibold uppercase tracking-wide text-white/70">
              <span>Planet</span>
              <span>Sign</span>
              <span>House</span>
              <span>Nakshatra</span>
              <span>Pada</span>
            </div>
            <div className="divide-y divide-white/5">
              {report.chart_details.planetary_positions.map((row) => (
                <div key={`planet-${row.planet}`} className="grid grid-cols-5 gap-2 px-3 py-2 text-sm">
                  <span className="text-white">{row.planet}</span>
                  <span className="text-white/90">{row.sign}</span>
                  <span className="text-white/80">{row.house}</span>
                  <span className="text-white/80">{row.nakshatra}</span>
                  <span className="text-white/80">{row.pada}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {SECTIONS.map((section, index) => {
        const rawText = report.sections?.[section.key] || "Section not available yet.";
        const paragraphs = removeTitleEcho(getReadableParagraphs(rawText), section.title);

        return (
          <motion.section
            key={section.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04 }}
            className="bg-[#1A1F2E] rounded-2xl border border-white/10 p-5"
          >
            <div className="flex items-center gap-2 text-amber-300 mb-3">
              <span className="text-lg leading-none">{section.icon}</span>
              <h2 className="text-base font-semibold">{section.title}</h2>
            </div>

            <div className="h-px w-full bg-white/10 mb-4" />

            <div className="text-white/90 text-[15px] leading-8">
              {paragraphs.length > 0
                ? paragraphs.map((paragraph, paragraphIndex) => (
                    <p key={paragraphIndex} className="mb-5 last:mb-0">
                      {paragraph}
                    </p>
                  ))
                : <p>{cleanupMarkdown(rawText)}</p>}
            </div>
          </motion.section>
        );
      })}

      <div className="pt-1 text-center">
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={!onRegenerate || isRegenerating}
          className="text-white/60 hover:text-amber-300 transition-colors text-sm underline underline-offset-4 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isRegenerating ? "Regenerating report..." : "Regenerate report"}
        </button>
      </div>
    </div>
  );
}
