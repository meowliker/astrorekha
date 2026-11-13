import { DEFAULT_RULE_SETTINGS, type RuleSettings } from "./rules-config";
export const SUPPORT_MAILBOX = "team.astrorekha@gmail.com";
export const CLOSING =
  "Please feel free to reach out to us if you have any questions or concerns.";
export const APPROVAL_ACTIONS = new Set([
  "change_email",
  "add_questions",
  "link_payment",
  "grant_features",
]);
export const ACTIONS = new Set([
  ...APPROVAL_ACTIONS,
  "correct_birth",
  "correct_sketch",
  "restore_access",
  "reconcile_payment",
  "recover_report",
  "reset_quiz",
]);
export const FEATURES = [
  "palmReading",
  "birthChart",
  "futurePartnerReport",
  "soulmateSketch",
  "pastLifeReport",
  "astrocartographyReport",
  "auraColorReport",
  "numerologyReport",
  "spiritAnimalReport",
  "witchArchetypeReport",
  "compatibilityTest",
  "prediction2026",
] as const;
export const REPORTS = {
  palmReading: {
    table: "palm_readings",
    key: "id",
    content: "reading",
    name: "Palm Reading",
    path: "/palm-reading",
  },
  birthChart: {
    table: "birth_chart_reports",
    key: "user_id",
    content: "sections",
    name: "Birth Chart",
    path: "/birth-chart",
  },
  futurePartnerReport: {
    table: "future_partner_reports",
    key: "user_id",
    content: "report_data",
    name: "Future Partner Report",
    path: "/future-partner",
  },
  soulmateSketch: {
    table: "soulmate_sketches",
    key: "user_id",
    content: "sketch_image_url",
    name: "Soulmate Sketch",
    path: "/soulmate-sketch",
  },
  pastLifeReport: {
    table: "past_life_reports",
    key: "user_id",
    content: "report_data",
    name: "Past Life Report",
    path: "/past-life",
  },
  astrocartographyReport: {
    table: "astrocartography_reports",
    key: "user_id",
    content: "report_data",
    name: "Astrocartography Report",
    path: "/astrocartography",
  },
  auraColorReport: {
    table: "aura_color_reports",
    key: "user_id",
    content: "result_data",
    name: "Aura Color Report",
    path: "/aura-color",
  },
  spiritAnimalReport: {
    table: "spirit_animal_reports",
    key: "user_id",
    content: "report_snapshot",
    name: "Spirit Animal Report",
    path: "/spirit-animal",
  },
  witchArchetypeReport: {
    table: "witch_archetype_results",
    key: "user_id",
    content: "result",
    name: "Witch Archetype Report",
    path: "/witch-archetype",
  },
} as const;
export type ReportKey = keyof typeof REPORTS;
export class SupportError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function requireText(value: unknown, name: string, max = 500): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new SupportError(`Invalid ${name}`);
  return value.trim();
}
export function emailAddress(value: unknown): string {
  const email = requireText(value, "email", 254).toLowerCase();
  if (!/^[^\s@,()]+@[^\s@,()]+\.[^\s@,()]+$/.test(email))
    throw new SupportError("Enter a valid email address");
  return email;
}
export function identifier(value: unknown): string {
  const id = requireText(value, "identifier", 160);
  if (!/^[a-zA-Z0-9_@.+\-]+$/.test(id))
    throw new SupportError("Invalid identifier");
  return id;
}
export function hasContent(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  return !!value && typeof value === "object" && Object.keys(value).length > 0;
}
export function reportReady(
  key: ReportKey,
  row: Record<string, unknown> | null,
  unlocked: boolean,
): boolean {
  if (!row || !unlocked || !hasContent(row[REPORTS[key].content])) return false;
  if (key === "palmReading") return !row.deleted_at;
  if (key === "witchArchetypeReport") return !!row.generated_at;
  return row.status === "complete";
}
export function hasOwnerAccess(actor: {
  role: string;
  kind: string;
  api_owner_access?: boolean;
}) {
  return (
    actor.role === "owner" &&
    (actor.kind === "browser" ||
      (actor.kind === "api" && actor.api_owner_access === true))
  );
}
export function requireOwnerAccess(actor: {
  role: string;
  kind: string;
  api_owner_access?: boolean;
}) {
  if (!hasOwnerAccess(actor))
    throw new SupportError(
      "An authorized owner session or delegated owner API token is required",
      403,
    );
}
export function validateDraft(
  text: string,
  settings: RuleSettings = DEFAULT_RULE_SETTINGS,
) {
  if (
    text.length > 12000 ||
    !text.includes(settings.closing) ||
    !text.includes(settings.signature)
  )
    throw new SupportError("Include the required customer-support closing");
  if (/(^|\n)\s*>|On .+wrote:|Forwarded message/i.test(text))
    throw new SupportError("Remove quoted customer history from the draft");
  const expressions = {
    refunds: /\brefund\b/i,
    failedPayments:
      /payment.{0,25}(failed|failure)|(failed|failure).{0,25}payment/i,
    processing: /\bprocessing\b/i,
    generationMethods: /AI.generated|entertainment/i,
    palmReplacement: /replace.{0,30}palm/i,
  };
  if (settings.blockedTopics.some((topic) => expressions[topic].test(text)))
    throw new SupportError(
      "Draft conflicts with the current support reply rules",
    );
}
export function makeReply(
  name: string,
  email: string,
  reports: string[],
  settings: RuleSettings = DEFAULT_RULE_SETTINGS,
) {
  if (!reports.length)
    throw new SupportError(
      "No verified reports selected. Investigate before drafting a ready message.",
    );
  return `Hi ${name || "there"},\n\nYour ${reports.join(", ")} ${reports.length === 1 ? "is" : "are"} available in your AstroRekha account.\n\n1. Open https://astrorekha.com/login.\n2. Sign in using ${email}.\n3. Open Reports and select ${reports.join(" or ")} to view ${reports.length === 1 ? "it" : "them"}.\n\n${settings.closing}\n\n${settings.signature}`;
}
