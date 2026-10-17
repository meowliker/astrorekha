import crypto from "node:crypto";
import type { PreparationState } from "./soulmate-report-preparation";
import { validateDescription } from "./soulmate-report-plan";
import { validateTimeline } from "./soulmate-timeline";

export type QualityIssue = { kind: "sketch" | "description" | "timeline"; reason: string };
export type QualityResult = { passed: boolean; issues: QualityIssue[]; fingerprint: string; model?: string; requestId?: string };
export function reportContentFingerprint(s: PreparationState) {
  return crypto.createHash("sha256").update(JSON.stringify({ plan: s.plan, image: s.image?.sha256,
    description: s.description?.report, timeline: s.timeline?.report })).digest("hex");
}
export function deterministicReportIssues(s: PreparationState): QualityIssue[] {
  const issues: QualityIssue[] = [];
  for (const kind of ["description", "timeline"] as const) {
    if (!s.plan[kind]) continue;
    try {
      const draft = kind === "description" ? validateDescription(s.description?.report) : validateTimeline(s.timeline?.report);
      const paragraphs = [...draft.sections.flatMap(section => section.paragraphs), draft.closing];
      const openings = new Set<string>(), sentences = new Set<string>();
      for (const p of paragraphs) {
        const words = p.trim().split(/\s+/);
        // The prompt targets 55–70 words. Allow modest variation while the separate
        // rendered-PDF check enforces the actual layout, rather than rejecting a fitting page.
        if (words.length < 40 || words.length > 90) issues.push({ kind, reason: "Keep every paragraph and closing between 55 and 70 words, without padding or repetition." });
        const opening = words.slice(0, 9).join(" ").toLowerCase();
        if (openings.has(opening)) issues.push({ kind, reason: "Repeated paragraph opening. Give each paragraph a distinct opening and purpose." });
        openings.add(opening);
        for (const sentence of p.split(/[.!?]+/).map(t => t.trim().toLowerCase()).filter(t => t.split(/\s+/).length >= 9)) {
          if (sentences.has(sentence)) issues.push({ kind, reason: "Duplicate sentence. Remove repeated prose across sections." });
          sentences.add(sentence);
        }
        if (/\b(?:aries|taurus|gemini|cancer|leo|virgo|libra|scorpio|sagittarius|capricorn|aquarius|pisces)\b/i.test(p)) issues.push({ kind, reason: "Do not assign any zodiac sign to the imagined partner." });
        if (/\b(?:\d{1,2}(?:st|nd|rd|th)\s+(?:of\s+)?[A-Z][a-z]+|guaranteed|will definitely|destined to marry)\b/.test(p)) issues.push({ kind, reason: "Remove exact dates and guaranteed predictions; use conditional possibilities." });
      }
    } catch (error) { issues.push({ kind, reason: error instanceof Error ? error.message : "Invalid report structure" }); }
  }
  return issues.filter((v, i, all) => all.findIndex(a => a.kind === v.kind && a.reason === v.reason) === i);
}
export function parseProviderJson(payload: unknown): { value: unknown; model: string; requestId: string; usage: unknown } {
  const p = payload as { stop_reason?: string; content?: { type: string; text?: string }[]; model?: string; id?: string; usage?: unknown };
  if (p?.stop_reason !== "end_turn" || !Array.isArray(p.content)) throw new Error("Provider response is incomplete or refused");
  const text = p.content.filter(c => c.type === "text").map(c => c.text || "").join("").replace(/^```(?:json)?\s*|\s*```$/g, "");
  return { value: JSON.parse(text), model: p.model || "unknown", requestId: p.id || "unknown", usage: p.usage };
}
export function checkPreparedPdf(kind: "sketch" | "description" | "timeline", bytes: Buffer) {
  if (bytes.subarray(0, 5).toString() !== "%PDF-" || bytes.length > 3 * 1024 * 1024) throw new Error("Invalid or oversized PDF attachment");
  const pages = bytes.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length || 0;
  if (!pages || (kind === "sketch" ? pages !== 1 : pages > (kind === "description" ? 4 : 3))) throw new Error(`${kind} PDF exceeds the intended layout; shorten paragraphs to 55-65 words`);
  return pages;
}
