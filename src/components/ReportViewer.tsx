"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, ChevronUp } from "lucide-react";

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
      planetary_columns?: Array<"sign" | "house" | "nakshatra" | "pada">;
      lagna_chart_svg?: string | null;
      navamsa_chart_svg?: string | null;
    };
  };
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

function formatDisplayValue(value: string, label?: string): string {
  const raw = (value || "").trim();
  if (!raw || raw === "—" || raw === "-") return "—";
  if ((label || "").toLowerCase() === "sex") {
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  }
  return raw;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function getReadableParagraphs(rawText: string): string[] {
  const cleaned = cleanupMarkdown(rawText);
  return cleaned
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\n+/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function dedupeParagraphs(paragraphs: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const paragraph of paragraphs) {
    const normalized = paragraph.toLowerCase().replace(/\s+/g, " ").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(paragraph);
  }
  return unique;
}

function stripLeadingSentences(paragraphs: string[], sentenceCount: number): string[] {
  if (sentenceCount <= 0) return paragraphs;

  let remaining = sentenceCount;
  const output = [...paragraphs];

  for (let i = 0; i < output.length && remaining > 0; i += 1) {
    const sentences = splitSentences(output[i]);
    if (sentences.length === 0) continue;

    if (sentences.length <= remaining) {
      output[i] = "";
      remaining -= sentences.length;
      continue;
    }

    output[i] = sentences.slice(remaining).join(" ");
    remaining = 0;
  }

  return output.map((paragraph) => paragraph.trim()).filter(Boolean);
}

function removeTitleEcho(paragraphs: string[], sectionTitle: string): string[] {
  if (paragraphs.length === 0) return paragraphs;
  const first = paragraphs[0].toLowerCase().replace(/[^\w\s&]/g, "").trim();
  const title = sectionTitle.toLowerCase().replace(/[^\w\s&]/g, "").trim();
  if (first === title) return paragraphs.slice(1);
  return paragraphs;
}

export default function ReportViewer({ report }: ReportViewerProps) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(SECTIONS.map((section, idx) => [section.key, idx < 2]))
  );
  const [expandedDetails, setExpandedDetails] = useState<Record<string, boolean>>({});

  const planetaryColumns =
    report.chart_details?.planetary_columns && report.chart_details.planetary_columns.length > 0
      ? report.chart_details.planetary_columns
      : (["sign", "house", "nakshatra", "pada"] as const).filter((key) =>
          (report.chart_details?.planetary_positions || []).some((row) => formatDisplayValue(row[key]) !== "—")
        );

  const planetaryHeaderLabel: Record<"sign" | "house" | "nakshatra" | "pada", string> = {
    sign: "Sign",
    house: "House",
    nakshatra: "Nakshatra",
    pada: "Pada",
  };

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleSectionDetails = (key: string) => {
    setExpandedDetails((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-4 pb-10">
      <div className="bg-gradient-to-br from-[#151d34] to-[#1f1a33] rounded-2xl border border-white/10 p-5 shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
        <h1 className="text-white text-2xl font-semibold tracking-tight">Your Detailed Birth Chart Report</h1>
        <p className="text-cyan-200/80 text-sm mt-2">Interactive, concise and personalized interpretation.</p>
      </div>

      {(report.chart_details?.lagna_chart_svg || report.chart_details?.navamsa_chart_svg) && (
        <section className="bg-[#171f36] rounded-2xl border border-white/10 p-5">
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
                <div className="px-3 py-2 bg-white/5 text-cyan-200 text-sm font-semibold">
                  Basic Details
                </div>
                <div className="divide-y divide-white/5">
                  {report.chart_details.basic_details.map((row) => (
                    <div key={`basic-${row.label}`} className="grid grid-cols-[42%_58%] px-3 py-2 text-sm">
                      <span className="text-white/60">{row.label}</span>
                      <span className={formatDisplayValue(row.value, row.label) === "—" ? "text-white/40 italic" : "text-white"}>
                        {formatDisplayValue(row.value, row.label)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {report.chart_details?.astro_details && (
              <div className="rounded-xl border border-white/10 overflow-hidden">
                <div className="px-3 py-2 bg-white/5 text-cyan-200 text-sm font-semibold">
                  Astro Details
                </div>
                <div className="divide-y divide-white/5">
                  {report.chart_details.astro_details.map((row) => (
                    <div key={`astro-${row.label}`} className="grid grid-cols-[42%_58%] px-3 py-2 text-sm">
                      <span className="text-white/60">{row.label}</span>
                      <span className={formatDisplayValue(row.value, row.label) === "—" ? "text-white/40 italic" : "text-white"}>
                        {formatDisplayValue(row.value, row.label)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {!!report.chart_details?.planetary_positions?.length && (
        <section className="bg-[#171f36] rounded-2xl border border-white/10 p-5">
          <div className="flex items-center gap-2 text-amber-300 mb-3">
            <span className="text-lg leading-none">🪐</span>
            <h2 className="text-base font-semibold">Planetary Positions</h2>
          </div>
          <div className="h-px w-full bg-white/10 mb-4" />

          <div className="rounded-xl border border-white/10 overflow-hidden">
            <table className="w-full table-fixed">
              <thead>
                <tr className="bg-white/5 text-[11px] font-semibold uppercase tracking-wide text-cyan-100/80">
                  <th className="text-left px-3 py-2">Planet</th>
                  {planetaryColumns.map((column) => (
                    <th key={`head-${column}`} className="text-left px-3 py-2">
                      {planetaryHeaderLabel[column]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {report.chart_details.planetary_positions.map((row, idx) => (
                  <tr key={`planet-${row.planet}-${idx}`} className="text-sm">
                    <td className="px-3 py-2 text-white whitespace-nowrap">{formatDisplayValue(row.planet, "planet")}</td>
                    {planetaryColumns.map((column) => {
                      const value = formatDisplayValue(row[column]);
                      return (
                        <td
                          key={`cell-${idx}-${column}`}
                          className={
                            value === "—"
                              ? "px-3 py-2 text-white/40 italic whitespace-nowrap"
                              : "px-3 py-2 text-white/85 whitespace-nowrap"
                          }
                        >
                          {value}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {SECTIONS.map((section, index) => {
        const rawText = report.sections?.[section.key] || "Section not available yet.";
        const paragraphs = dedupeParagraphs(
          removeTitleEcho(getReadableParagraphs(rawText), section.title)
        );
        const quickTakeSentences = splitSentences(paragraphs.join(" ")).slice(0, 2);
        const fullBodyParagraphs = stripLeadingSentences(paragraphs, quickTakeSentences.length);
        const collapsedBodyParagraphs = stripLeadingSentences(
          paragraphs.slice(0, 2),
          quickTakeSentences.length
        );
        const visibleParagraphs = expandedDetails[section.key]
          ? (fullBodyParagraphs.length > 0 ? fullBodyParagraphs : paragraphs)
          : (collapsedBodyParagraphs.length > 0 ? collapsedBodyParagraphs : paragraphs.slice(0, 1));
        const isOpen = !!openSections[section.key];

        return (
          <motion.section
            key={section.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04 }}
            className="bg-[#141c33] rounded-2xl border border-white/10 p-5"
          >
            <button
              type="button"
              onClick={() => toggleSection(section.key)}
              className="w-full flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-2 text-amber-300">
                <span className="text-lg leading-none">{section.icon}</span>
                <h2 className="text-base font-semibold">{section.title}</h2>
              </div>
              {isOpen ? (
                <ChevronUp className="w-4 h-4 text-white/50" />
              ) : (
                <ChevronDown className="w-4 h-4 text-white/50" />
              )}
            </button>

            {isOpen && (
              <>
                <div className="h-px w-full bg-white/10 my-4" />
                <div className="mb-4 rounded-xl border border-cyan-300/20 bg-cyan-300/5 px-4 py-3">
                  <p className="text-cyan-200 text-xs font-semibold uppercase tracking-wide mb-2">Quick Take</p>
                  <ul className="space-y-2">
                    {quickTakeSentences.map((sentence, i) => (
                      <li key={i} className="text-white/90 text-sm leading-6">
                        {sentence}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="text-white/90 text-[15px] leading-8">
                  {visibleParagraphs.length > 0
                    ? visibleParagraphs.map((paragraph, paragraphIndex) => (
                        <p key={paragraphIndex} className="mb-5 last:mb-0">
                          {paragraph}
                        </p>
                      ))
                    : <p>{cleanupMarkdown(rawText)}</p>}

                  {paragraphs.length > 2 && (
                    <button
                      type="button"
                      onClick={() => toggleSectionDetails(section.key)}
                      className="mt-1 text-sm text-cyan-300 hover:text-cyan-200 underline underline-offset-4"
                    >
                      {expandedDetails[section.key] ? "Show less" : "Read full section"}
                    </button>
                  )}
                </div>
              </>
            )}
          </motion.section>
        );
      })}

    </div>
  );
}
