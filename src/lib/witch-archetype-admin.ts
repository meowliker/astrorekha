import { isWitchResult, WITCH_PROFILES, WITCH_QUESTIONS, type WitchResult } from "./witch-archetype";
import type { WitchArchetypeTemplate } from "./witch-archetype-template";

export type WitchAdminUser = { id: string; name: string | null; email: string | null; unlocked_features?: Record<string, unknown> | null; is_dev_tester: boolean | null };
export type WitchSavedRow = { answers: unknown; result: unknown; scoring_version: string; generated_at: string; updated_at: string };
export type WitchAdminSummary = { user: Omit<WitchAdminUser, "unlocked_features">; access: "Unlocked" | "Tester" | "Locked"; status: "Saved" | "Not started" | "Needs review"; archetype: string | null; generatedAt: string | null };
export type WitchAdminDetail = WitchAdminSummary & {
  result: WitchResult | null; template: WitchArchetypeTemplate | null; templateVersion: string | null;
  scoringVersion: string | null; updatedAt: string | null; warning: string | null;
  answers: { id: string; question: string; answer: string; valid: boolean }[];
  payments: { id: string; type: string; bundle_id: string | null; feature: string | null; amount: number; currency: string; payment_status: string; created_at: string }[];
  paymentsTruncated: boolean;
};
export function witchAdminSummary(user: WitchAdminUser, saved: WitchSavedRow | null): WitchAdminSummary {
  return {
    user: { id: user.id, name: user.name, email: user.email, is_dev_tester: user.is_dev_tester },
    access: user.is_dev_tester === true ? "Tester" : user.unlocked_features?.witchArchetypeReport === true ? "Unlocked" : "Locked",
    status: saved ? isWitchResult(saved.result) ? "Saved" : "Needs review" : "Not started",
    archetype: saved && isWitchResult(saved.result) ? WITCH_PROFILES[saved.result.key].name : null,
    generatedAt: saved?.generated_at || null,
  };
}
export function witchAdminAnswers(answers: unknown) {
  const values = answers && typeof answers === "object" && !Array.isArray(answers) ? answers as Record<string, unknown> : {};
  return WITCH_QUESTIONS.map(q => {
    const option = q.options.find(o => o.id === values[q.id]);
    return { id: q.id, question: q.prompt, answer: option?.text || "Missing or unrecognized answer", valid: !!option };
  });
}
